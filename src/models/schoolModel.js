const pool = require("../config/db");

// -------------------------------------------------------------------------
// 1. GIS SYNC (Step 1 or 1.5)
// -------------------------------------------------------------------------

exports.getObjectIds = async (stcode11, dtcode11) => {
  const result = await pool.query(
    "SELECT object_id FROM udise_data.master_object WHERE stcode11=$1 AND dtcode11=$2",
    [stcode11, dtcode11]
  );
  return result.rows.map((r) => r.object_id);
};

exports.getExistingObjectIds = async (stcode11, dtcode11) => {
  const result = await pool.query(
    "SELECT objectid FROM udise_data.school_udise_list WHERE stcode11=$1 AND dtcode11=$2",
    [stcode11, dtcode11]
  );
  return result.rows.map((r) => r.objectid);
};

exports.upsertSchoolDetails = async (data) => {
  const query = `
    INSERT INTO udise_data.school_udise_data (
      udise_code, school_id, school_name, year_desc,
      
      state_name, district_name, block_name, village_ward_name, cluster_name,
      
      head_master_name, school_status, school_type,
      medium_of_instruction_1, medium_of_instruction_2,
      is_minority_school, has_anganwadi, 
      anganwadi_boy_students, anganwadi_girl_students,
      is_cce_implemented, has_school_management_committee,
      has_approach_road, is_shift_school,
      
      building_status, total_classrooms_in_use, good_condition_classrooms,
      total_toilets_boys, total_toilets_girls, has_drinking_water_facility,
      has_electricity, has_library, has_playground, has_medical_checkup,
      has_integrated_lab, has_internet,
      
      total_teachers, total_male_teachers, total_female_teachers,
      total_regular_teachers, total_contract_teachers,
      lowest_class, highest_class,
      
      total_boy_students, total_girl_students, total_students,
      
      social_data_general_sc_st_obc, social_data_religion,
      social_data_cwsn, social_data_rte, social_data_ews
    ) VALUES (
      $1, $2, $3, $4,
      $45, $46, $47, $48, $49,
      $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17,
      $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29,
      $30, $31, $32, $33, $34, $35, $36,
      $37, $38, $39,
      $40, $41, $42, $43, $44
    )
    ON CONFLICT (udise_code, year_desc) DO UPDATE SET
      school_id = EXCLUDED.school_id,
      school_name = EXCLUDED.school_name,
      total_students = EXCLUDED.total_students,
      total_teachers = EXCLUDED.total_teachers,
      updated_at = NOW();
  `;

  // Safe access helpers
  const p = data.profile || {};
  const f = data.facility || {};
  const r = data.report || {};
  const s = data.stats || {};
  const soc = data.social || {};

  const num = (val) => (isNaN(parseInt(val, 10)) ? 0 : parseInt(val, 10));
  const intOrNull = (val) =>
    isNaN(parseInt(val, 10)) ? null : parseInt(val, 10);
  const toBool = (val) =>
    val
      ? String(val).toLowerCase().includes("yes") || String(val).startsWith("1")
      : false;

  const totalTeachers = r.totalTeacher
    ? num(r.totalTeacher)
    : num(s.totalTeacherReg) + num(s.totalTeacherCon);

  const values = [
    // $1 - $4
    data.udiseCode,
    data.schoolId,
    r.schoolName,
    // [FIX]: Use the injected yearDesc from controller (or fallback to report if needed)
    data.yearDesc || r.yearDesc,

    // $5 - $9 (Text Fields)
    p.headMasterName,
    r.schStatusName,
    r.schTypeDesc,
    p.mediumOfInstrName1,
    p.mediumOfInstrName2,

    // $10 - $17 (Flags)
    toBool(p.minorityYnDesc),
    toBool(p.anganwadiYnDesc),
    num(p.anganwadiStuB),
    num(p.anganwadiStuG),
    toBool(p.cceYnDesc),
    toBool(p.smcYnDesc),
    toBool(p.approachRoadYnDesc),
    toBool(p.shiftSchYnDesc),

    // $18 - $29 (Infrastructure)
    f.bldStatus,
    num(f.clsrmsInst),
    num(f.clsrmsGd),
    num(f.toiletb),
    num(f.toiletg),
    toBool(f.drinkWaterYnDesc),
    toBool(f.electricityYnDesc),
    toBool(f.libraryYnDesc),
    toBool(f.playgroundYnDesc),
    toBool(f.medchkYnDesc),
    toBool(f.integratedLabYnDesc),
    toBool(f.internetYnDesc),

    // $30 - $36 (Teachers)
    totalTeachers,
    num(r.totMale),
    num(r.totFemale),
    num(r.tchReg),
    num(r.tchCont),
    intOrNull(r.lowClass),
    intOrNull(r.highClass),

    // $37 - $39 (Students)
    num(s.totalBoy),
    num(s.totalGirl),
    num(s.totalCount),

    // $40 - $44 (JSON Data)
    JSON.stringify(soc.flag1 || []),
    JSON.stringify(soc.flag2 || []),
    JSON.stringify(soc.flag3 || []),
    JSON.stringify(soc.flag5 || []),
    JSON.stringify(soc.flag4 || []),

    // $45 - $49 (Location)
    r.stateName,
    r.districtName,
    r.blockName,
    r.villWardName,
    r.clusterName,
  ];

  await pool.query(query, values);
};

// -------------------------------------------------------------------------
// 2. LISTING & EXPORT
// -------------------------------------------------------------------------

exports.getLocalSchoolList = async (stcode11, dtcode11, page, limit, category, management) => {
  const offset = (page - 1) * limit;
  
  // Base conditions
  let whereClause = `WHERE l.stcode11 = $1 AND l.dtcode11 = $2`;
  const params = [stcode11, dtcode11];
  let paramIdx = 3;

  // Dynamic Filters
  if (category && category !== 'all') {
    whereClause += ` AND d.school_type = $${paramIdx}`;
    params.push(category);
    paramIdx++;
  }

  if (management && management !== 'all') {
    whereClause += ` AND d.management_type = $${paramIdx}`;
    params.push(management);
    paramIdx++;
  }

  // 1. Data Query (Uses LIMIT & OFFSET)
  const dataQuery = `
    SELECT 
      l.schcd as udise_code,
      d.school_name,
      l.stname as state_name,
      l.dtname as district_name,
      d.block_name,
      l.pincode,
      d.school_id,
      d.school_status,
      d.school_type as category,
      d.management_type as management
    FROM udise_data.school_udise_list l
    LEFT JOIN udise_data.school_udise_data d ON l.schcd = d.udise_code
    ${whereClause}
    ORDER BY d.school_name ASC
    LIMIT $${paramIdx} OFFSET $${paramIdx + 1}
  `;

  // 2. Count Query (Does NOT use LIMIT & OFFSET)
  const countQuery = `
    SELECT COUNT(*) as total
    FROM udise_data.school_udise_list l
    LEFT JOIN udise_data.school_udise_data d ON l.schcd = d.udise_code
    ${whereClause}
  `;

  // [FIX] Create a separate params array for count query
  // The 'params' array currently has filter values. We add limit/offset ONLY for dataQuery.
  const dataParams = [...params, limit, offset]; 
  const countParams = [...params]; // Copy without limit/offset

  const [dataResult, countResult] = await Promise.all([
    pool.query(dataQuery, dataParams),
    pool.query(countQuery, countParams)
  ]);

  return {
    data: dataResult.rows,
    meta: {
      page: page,
      limit: limit,
      count: dataResult.rows.length,
      total: parseInt(countResult.rows[0].total),
    },
  };
};

exports.getExportData = async (stcode11, dtcode11) => {
  const query = `
    SELECT 
      l.schcd as udise_code,
      d.school_name,
      l.stname as state,
      l.dtname as district,
      d.block_name as block,
      d.cluster_name,
      d.village_ward_name,
      l.pincode,
      d.* FROM udise_data.school_udise_data d
    JOIN udise_data.school_udise_list l ON d.udise_code = l.schcd
    WHERE l.stcode11 = $1 AND l.dtcode11 = $2
  `;
  const result = await pool.query(query, [stcode11, dtcode11]);
  return result.rows;
};

// -------------------------------------------------------------------------
// 3. DETAIL SYNC (Step 2 - Level 2)
// -------------------------------------------------------------------------

exports.getSchoolsForDetailSync = async (stcode11, dtcode11) => {
  const result = await pool.query(
    `SELECT schcd as udise_code 
     FROM udise_data.school_udise_list 
     WHERE stcode11 = $1 AND dtcode11 = $2`,
    [stcode11, dtcode11]
  );
  return result.rows;
};

exports.checkSchoolDataExists = async (udiseCode, yearDesc) => {
  const query = `
    SELECT school_name FROM udise_data.school_udise_data 
    WHERE udise_code = $1 AND year_desc = $2
  `;
  const result = await pool.query(query, [String(udiseCode), String(yearDesc)]);
  
  // Return the first row (or undefined if not found)
  return result.rows[0]; 
};

exports.getDistinctFilters = async () => {
  const [cats, mgmts] = await Promise.all([
    pool.query(
      "SELECT DISTINCT school_type FROM udise_data.school_udise_data WHERE school_type IS NOT NULL ORDER BY school_type"
    ),
    pool.query(
      "SELECT DISTINCT management_type FROM udise_data.school_udise_data WHERE management_type IS NOT NULL ORDER BY management_type"
    ),
  ]);

  return {
    categories: cats.rows.map((r) => r.school_type),
    managements: mgmts.rows.map((r) => r.management_type),
  };
};

exports.upsertSchoolDetails = async (data) => {
  // [UPDATE] Changed ON CONFLICT to use (udise_code, year_desc)
  // Ensure you have a UNIQUE constraint/index on these two columns in your DB
  const query = `
    INSERT INTO udise_data.school_udise_data (
      udise_code, school_id, school_name, year_desc,
      
      state_name, district_name, block_name, village_ward_name, cluster_name,
      
      head_master_name, school_status, school_type,
      management_type,
      medium_of_instruction_1, medium_of_instruction_2,
      is_minority_school, has_anganwadi, 
      anganwadi_boy_students, anganwadi_girl_students,
      is_cce_implemented, has_school_management_committee,
      has_approach_road, is_shift_school,
      
      building_status, total_classrooms_in_use, good_condition_classrooms,
      total_toilets_boys, total_toilets_girls, has_drinking_water_facility,
      has_electricity, has_library, has_playground, has_medical_checkup,
      has_integrated_lab, has_internet,
      
      total_teachers, total_male_teachers, total_female_teachers,
      total_regular_teachers, total_contract_teachers,
      lowest_class, highest_class,
      
      total_boy_students, total_girl_students, total_students,
      
      social_data_general_sc_st_obc, social_data_religion,
      social_data_cwsn, social_data_rte, social_data_ews
    ) VALUES (
      $1, $2, $3, $4,
      $45, $46, $47, $48, $49,
      $5, $6, $7, 
      $50,
      $8, $9, $10, $11, $12, $13, $14, $15, $16, $17,
      $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29,
      $30, $31, $32, $33, $34, $35, $36,
      $37, $38, $39,
      $40, $41, $42, $43, $44
    )
    ON CONFLICT (udise_code, year_desc) DO UPDATE SET
      school_id = EXCLUDED.school_id,
      school_name = EXCLUDED.school_name,
      management_type = EXCLUDED.management_type, -- Update on conflict
      total_students = EXCLUDED.total_students,
      updated_at = NOW();
  `;

  // Safe access helpers
  const p = data.profile || {};
  const f = data.facility || {};
  const r = data.report || {};
  const s = data.stats || {};
  const soc = data.social || {};

  const num = (val) => (isNaN(parseInt(val, 10)) ? 0 : parseInt(val, 10));
  const intOrNull = (val) =>
    isNaN(parseInt(val, 10)) ? null : parseInt(val, 10);
  const toBool = (val) =>
    val
      ? String(val).toLowerCase().includes("yes") || String(val).startsWith("1")
      : false;
  const totalTeachers = r.totalTeacher
    ? num(r.totalTeacher)
    : num(s.totalTeacherReg) + num(s.totalTeacherCon);

  const values = [
    data.udiseCode,
    data.schoolId,
    r.schoolName,
    data.yearDesc || r.yearDesc, // 1-4
    p.headMasterName,
    r.schStatusName,
    r.schTypeDesc, // 5-7
    p.mediumOfInstrName1,
    p.mediumOfInstrName2, // 8-9
    toBool(p.minorityYnDesc),
    toBool(p.anganwadiYnDesc),
    num(p.anganwadiStuB),
    num(p.anganwadiStuG), // 10-13
    toBool(p.cceYnDesc),
    toBool(p.smcYnDesc),
    toBool(p.approachRoadYnDesc),
    toBool(p.shiftSchYnDesc), // 14-17
    f.bldStatus,
    num(f.clsrmsInst),
    num(f.clsrmsGd),
    num(f.toiletb),
    num(f.toiletg), // 18-22
    toBool(f.drinkWaterYnDesc),
    toBool(f.electricityYnDesc),
    toBool(f.libraryYnDesc), // 23-25
    toBool(f.playgroundYnDesc),
    toBool(f.medchkYnDesc),
    toBool(f.integratedLabYnDesc),
    toBool(f.internetYnDesc), // 26-29
    totalTeachers,
    num(r.totMale),
    num(r.totFemale),
    num(r.tchReg),
    num(r.tchCont),
    intOrNull(r.lowClass),
    intOrNull(r.highClass), // 30-36
    num(s.totalBoy),
    num(s.totalGirl),
    num(s.totalCount), // 37-39
    JSON.stringify(soc.flag1 || []),
    JSON.stringify(soc.flag2 || []),
    JSON.stringify(soc.flag3 || []),
    JSON.stringify(soc.flag5 || []),
    JSON.stringify(soc.flag4 || []), // 40-44
    r.stateName,
    r.districtName,
    r.blockName,
    r.villWardName,
    r.clusterName,
    r.schMgmtStateDesc,
  ];

  await pool.query(query, values);
};

exports.getSchoolById = async (schoolId) => {
  const query = `
    SELECT * FROM udise_data.school_udise_data 
    WHERE school_id = $1
  `;
  const result = await pool.query(query, [schoolId]);
  return result.rows[0];
};

exports.upsertDirectorySchool = async (data) => {
  await pool.query(
    `INSERT INTO udise_data.school_udise_list
    (schcd, objectid, latitude, longitude, pincode, stname, dtname, stcode11, dtcode11)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    ON CONFLICT (schcd) DO UPDATE SET 
      latitude = EXCLUDED.latitude,
      longitude = EXCLUDED.longitude,
      objectid = EXCLUDED.objectid,
      pincode = EXCLUDED.pincode`,
    [
      data.schcd,
      data.objectid,
      data.latitude,
      data.longitude,
      data.pincode,
      data.stname,
      data.dtname,
      data.stcode11,
      data.dtcode11,
    ]
  );
};

exports.getDashboardStats = async () => {
  // 1. Sync Status Counts
  const syncStatusQuery = `
    SELECT 
      (SELECT COUNT(*) FROM udise_data.master_object) as total_master_ids,
      (SELECT COUNT(*) FROM udise_data.school_udise_list) as synced_directory,
      (SELECT COUNT(*) FROM udise_data.school_udise_data) as synced_details
  `;

  // 2. Gender & Enrollment Stats
  const enrollmentQuery = `
    SELECT 
      SUM(total_students) as total_students,
      SUM(total_boy_students) as total_boys,
      SUM(total_girl_students) as total_girls,
      SUM(total_teachers) as total_teachers
    FROM udise_data.school_udise_data
  `;

  // 3. Management Distribution
  const managementQuery = `
    SELECT management_type, COUNT(*) as count 
    FROM udise_data.school_udise_data 
    WHERE management_type IS NOT NULL 
    GROUP BY management_type 
    ORDER BY count DESC
  `;

  // 4. Category Distribution
  const categoryQuery = `
    SELECT school_type as category, COUNT(*) as count 
    FROM udise_data.school_udise_data 
    WHERE school_type IS NOT NULL 
    GROUP BY school_type 
    ORDER BY count DESC
  `;

  // 5. State-wise Stats (For Table & PTR)
  const stateStatsQuery = `
    SELECT 
      state_name,
      COUNT(*) as school_count,
      SUM(total_students) as student_count,
      SUM(total_teachers) as teacher_count
    FROM udise_data.school_udise_data
    WHERE state_name IS NOT NULL
    GROUP BY state_name
    ORDER BY school_count DESC
  `;

  // Execute all in parallel
  const [sync, enrol, mgmt, cat, states] = await Promise.all([
    pool.query(syncStatusQuery),
    pool.query(enrollmentQuery),
    pool.query(managementQuery),
    pool.query(categoryQuery),
    pool.query(stateStatsQuery)
  ]);

  return {
    sync: sync.rows[0],
    enrollment: enrol.rows[0],
    management: mgmt.rows,
    category: cat.rows,
    states: states.rows
  };
};

exports.logSkippedSchool = async (udiseCode, stcode11, dtcode11, yearDesc, reason) => {
  const query = `
    INSERT INTO udise_data.skipped_udise 
    (udise_code, stcode11, dtcode11, year_desc, reason)
    VALUES ($1, $2, $3, $4, $5)
    ON CONFLICT (udise_code, year_desc) 
    DO UPDATE SET reason = EXCLUDED.reason, created_at = NOW()
  `;
  await pool.query(query, [udiseCode, stcode11, dtcode11, yearDesc, reason]);
};

// [NEW] Get list of skipped schools
exports.getSkippedSchools = async (page = 1, limit = 50) => {
  const offset = (page - 1) * limit;
  
  const dataQuery = `
    SELECT s.*, l.stname, l.dtname
    FROM udise_data.skipped_udise s
    LEFT JOIN udise_data.school_udise_list l ON s.udise_code = l.schcd
    ORDER BY s.created_at DESC
    LIMIT $1 OFFSET $2
  `;
  
  const countQuery = `SELECT COUNT(*) as total FROM udise_data.skipped_udise`;

  const [data, count] = await Promise.all([
    pool.query(dataQuery, [limit, offset]),
    pool.query(countQuery)
  ]);

  return {
    data: data.rows,
    meta: {
      page,
      limit,
      total: parseInt(count.rows[0].total)
    }
  };
};

// [NEW] Remove from skipped table (after successful sync)
exports.removeSkippedSchool = async (udiseCode) => {
  await pool.query("DELETE FROM udise_data.skipped_udise WHERE udise_code = $1", [udiseCode]);
};