const pool = require("../config/db");

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
  // [FIX 1] Added 'category' to INSERT, VALUES ($51), and UPDATE clauses
  const query = `
    INSERT INTO udise_data.school_udise_data (
      udise_code, school_id, school_name, year_desc,
      
      state_name, district_name, block_name, village_ward_name, cluster_name,
      
      head_master_name, school_status, school_type,
      management_type, category,
      
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
      $50, $51,
      $8, $9, $10, $11, $12, $13, $14, $15, $16, $17,
      $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29,
      $30, $31, $32, $33, $34, $35, $36,
      $37, $38, $39,
      $40, $41, $42, $43, $44
    )
    ON CONFLICT (udise_code, year_desc) DO UPDATE SET
      school_id = EXCLUDED.school_id,
      school_name = EXCLUDED.school_name,
      management_type = EXCLUDED.management_type,
      category = EXCLUDED.category,
      total_students = EXCLUDED.total_students,
      updated_at = NOW();
  `;

  // Safe access helpers
  const p = data.profile || {};
  const f = data.facility || {};
  const r = data.report || {}; // 'r' holds the API report data
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
    r.schTypeDesc, // 5-7 (School Type)
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
    r.schMgmtStateDesc, // 50 (Management)
    r.schCategoryDesc,       // 51 [FIX: Map 'r.schCatDesc' to the new Category column]
  ];

  await pool.query(query, values);
};

exports.getLocalSchoolList = async (filters, page, limit) => {
  const { whereSql, params, paramIdx } = buildWhereClause(filters);
  const offset = (page - 1) * limit;

  // [UPDATED] Select 'category' in the query
  const dataQuery = `
    SELECT 
      l.schcd as udise_code,
      d.school_name,
      l.stname as state_name,
      l.dtname as district_name,
      d.block_name,
      d.school_id,
      d.school_status,
      d.school_type,      -- Existing School Type
      d.category,         -- [NEW] Category
      d.management_type as management,
      d.year_desc,
      d.total_students
    FROM udise_data.school_udise_list l
    JOIN udise_data.school_udise_data d ON l.schcd = d.udise_code
    ${whereSql}
    ORDER BY d.school_name ASC
    LIMIT $${paramIdx} OFFSET $${paramIdx + 1}
  `;

  const countQuery = `
    SELECT COUNT(*) as total
    FROM udise_data.school_udise_list l
    JOIN udise_data.school_udise_data d ON l.schcd = d.udise_code
    ${whereSql}
  `;

  const [dataResult, countResult] = await Promise.all([
    pool.query(dataQuery, [...params, limit, offset]),
    pool.query(countQuery, params)
  ]);

  return {
    data: dataResult.rows,
    meta: {
      page,
      limit,
      count: dataResult.rows.length,
      total: parseInt(countResult.rows[0]?.total || 0),
    },
  };
};

exports.getExportData = async (filters) => {
  const { whereSql, params } = buildWhereClause(filters);

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
      d.year_desc,
      d.management_type,
      d.school_type,
      d.* FROM udise_data.school_udise_data d
    JOIN udise_data.school_udise_list l ON d.udise_code = l.schcd
    ${whereSql}
    ORDER BY l.stname, l.dtname, d.school_name
  `;
  const result = await pool.query(query, params);
  return result.rows;
};

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
  // Safe access helpers
  const p = data.profile || {};
  const f = data.facility || {};
  const r = data.report || {};
  const s = data.stats || {};
  const soc = data.social || {};

  const num = (val) => (isNaN(parseInt(val, 10)) ? 0 : parseInt(val, 10));
  const intOrNull = (val) => (isNaN(parseInt(val, 10)) ? null : parseInt(val, 10));
  const decOrNull = (val) => (isNaN(parseFloat(val)) ? null : parseFloat(val));
  const toBool = (val) =>
    val
      ? String(val).toLowerCase().includes("yes") || String(val).startsWith("1")
      : false;

  // Calculate total teachers if not provided directly
  const totalTeachers = r.totalTeacher
    ? num(r.totalTeacher)
    : num(s.totalTeacherReg) + num(s.totalTeacherCon);

  const query = `
    INSERT INTO udise_data.school_udise_data (
      -- 1. Identity & Location
      udise_code, school_id, school_name, year_desc,
      state_name, district_name, block_name, village_ward_name, cluster_name,
      school_phone, location_type,
      
      -- 2. Basic Details
      head_master_name, school_status, school_type,
      management_type, category,
      establishment_year, is_pre_primary_section, residential_school_type,
      is_cwsn_school, is_shift_school,
      
      -- 3. Instructions & Visits
      medium_of_instruction_1, medium_of_instruction_2, 
      medium_of_instruction_3, medium_of_instruction_4,
      instructional_days, 
      visits_by_brc, visits_by_crc, visits_by_district_officer,
      
      -- 4. Flags (Profile)
      is_minority_school, has_anganwadi, 
      anganwadi_boy_students, anganwadi_girl_students, anganwadi_teacher_trained,
      is_cce_implemented, has_school_management_committee, has_approach_road,
      
      -- 5. Facility & Infrastructure
      building_status, total_classrooms_in_use, good_condition_classrooms,
      total_toilets_boys, total_toilets_girls, urinals_boys, urinals_girls,
      has_drinking_water_facility, has_electricity, has_library, has_playground, 
      has_medical_checkup, has_integrated_lab, has_internet, has_dth_access,
      
      boundary_wall_type, has_handrails, has_handwash_meal, has_handwash_common,
      has_hm_room, has_rain_harvesting, has_ramps, has_solar_panel,
      students_with_furniture, functional_desktops, total_digital_boards,

      -- 6. Teachers & Staff
      total_teachers, total_male_teachers, total_female_teachers,
      total_regular_teachers, total_contract_teachers, total_part_time_teachers,
      teachers_non_teaching_assignments, teachers_in_service_training, total_nr_teachers,
      
      -- 7. Teacher Qualifications
      teachers_below_graduate, teachers_graduate_above, teachers_post_graduate_above,
      teacher_qual_diploma_basic, teacher_qual_bele, teacher_qual_bed, teacher_qual_med,
      teacher_qual_others, teacher_qual_none, teacher_qual_special_ed, teacher_qual_pursuing,
      teacher_qual_deled, teacher_qual_diploma_preschool, teacher_qual_bed_nursery,

      -- 8. Students & Classes
      lowest_class, highest_class,
      total_boy_students, total_girl_students, total_students,
      
      -- 9. Finance
      total_expenditure, total_grant,

      -- 10. JSON Social Data
      social_data_general_sc_st_obc, social_data_religion,
      social_data_cwsn, social_data_rte, social_data_ews

    ) VALUES (
      -- $1 - $11 (Identity)
      $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11,
      
      -- $12 - $21 (Basic)
      $12, $13, $14, $15, $16, $17, $18, $19, $20, $21,
      
      -- $22 - $29 (Instruction/Visits)
      $22, $23, $24, $25, $26, $27, $28, $29,
      
      -- $30 - $37 (Flags)
      $30, $31, $32, $33, $34, $35, $36, $37,
      
      -- $38 - $63 (Facilities)
      $38, $39, $40, $41, $42, $43, $44, $45, $46, $47, $48, 
      $49, $50, $51, $52, $53, $54, $55, $56, $57, $58, $59, $60, 
      $61, $62, $63,

      -- $64 - $72 (Teachers Staff)
      $64, $65, $66, $67, $68, $69, $70, $71, $72,
      
      -- $73 - $86 (Teacher Quals)
      $73, $74, $75, $76, $77, $78, $79, $80, $81, $82, $83, $84, $85, $86,

      -- $87 - $91 (Students)
      $87, $88, $89, $90, $91,

      -- $92 - $93 (Finance)
      $92, $93,

      -- $94 - $98 (Social JSON)
      $94, $95, $96, $97, $98
    )
    ON CONFLICT (udise_code, year_desc) DO UPDATE SET
      school_id = EXCLUDED.school_id,
      school_name = EXCLUDED.school_name,
      management_type = EXCLUDED.management_type,
      category = EXCLUDED.category,
      total_students = EXCLUDED.total_students,
      total_teachers = EXCLUDED.total_teachers,
      updated_at = NOW();
  `;

  const values = [
    // 1. Identity & Location ($1-$11)
    data.udiseCode,
    data.schoolId,
    r.schoolName,
    data.yearDesc || r.yearDesc,
    r.stateName,
    r.districtName,
    r.blockName,
    r.villWardName,
    r.clusterName,
    p.schPhone,
    r.schLocDesc,

    // 2. Basic Details ($12-$21)
    p.headMasterName,
    r.schStatusName,
    r.schTypeDesc,
    r.schMgmtStateDesc,
    r.schCategoryDesc, // category
    intOrNull(p.estdYear),
    p.ppSecDesc, // is_pre_primary_section (keeping as text if it's a desc)
    p.resiSchDesc,
    toBool(p.cwsnSchYnDesc),
    toBool(p.shiftSchYnDesc),

    // 3. Instructions & Visits ($22-$29)
    p.mediumOfInstrName1,
    p.mediumOfInstrName2,
    p.mediumOfInstrName3,
    p.mediumOfInstrName4,
    intOrNull(p.instructionalDays),
    num(p.noVisitBrc),
    num(p.noVisitCrc),
    num(p.noVisitDis),

    // 4. Flags ($30-$37)
    toBool(p.minorityYnDesc),
    toBool(p.anganwadiYnDesc),
    num(p.anganwadiStuB),
    num(p.anganwadiStuG),
    toBool(p.anganwadiTchTrained),
    toBool(p.cceYnDesc),
    toBool(p.smcYnDesc),
    toBool(p.approachRoadYnDesc),

    // 5. Facility ($38-$63)
    f.bldStatus,
    num(f.clsrmsInst),
    num(f.clsrmsGd),
    num(f.toiletb),
    num(f.toiletg),
    num(f.urinalsb),
    num(f.urinalsg),
    toBool(f.drinkWaterYnDesc),
    toBool(f.electricityYnDesc),
    toBool(f.libraryYnDesc),
    toBool(f.playgroundYnDesc),
    toBool(f.medchkYnDesc),
    toBool(f.integratedLabYnDesc),
    toBool(f.internetYnDesc),
    toBool(f.accessDthYnDesc),
    f.bndrywallType,
    toBool(f.handrailsYnDesc),
    toBool(f.handwashMealYnDesc),
    toBool(f.handwashYnDesc),
    toBool(f.hmRoomYnDesc),
    toBool(f.rainHarvestYnDesc),
    toBool(f.rampsYnDesc),
    toBool(f.solarpanelYnDesc),
    num(f.stusHvFurnt),
    num(f.desktopFun),
    num(f.digiBoardTot),

    // 6. Teachers & Staff ($64-$72)
    totalTeachers,
    num(r.totMale),
    num(r.totFemale),
    num(r.tchReg),
    num(r.tchCont),
    num(r.tchPart),
    num(r.tchInvlovedNonTchAssign),
    num(r.tchRecvdServiceTrng),
    num(r.totNr),

    // 7. Teacher Qualifications ($73-$86)
    num(r.totTchBelowGraduate),
    num(r.totTchGraduateAbove),
    num(r.totTchPgraduateAbove),
    num(r.profQual1), // Diploma/Cert Basic
    num(r.profQual2), // B.El.Ed
    num(r.profQual3), // B.Ed
    num(r.profQual4), // M.Ed
    num(r.profQual5), // Others
    num(r.profQual6), // None
    num(r.profQual7), // Special Ed
    num(r.profQual8), // Pursuing
    num(r.profQual10), // D.El.Ed
    num(r.profQual11), // Diploma Preschool
    num(r.profQual12), // B.Ed Nursery

    // 8. Students & Classes ($87-$91)
    intOrNull(r.lowClass),
    intOrNull(r.highClass),
    num(s.totalBoy),
    num(s.totalGirl),
    num(s.totalCount),

    // 9. Finance ($92-$93)
    decOrNull(r.totalExpediture),
    decOrNull(r.totalGrant),

    // 10. Social JSON ($94-$98)
    JSON.stringify(soc.flag1 || []),
    JSON.stringify(soc.flag2 || []),
    JSON.stringify(soc.flag3 || []),
    JSON.stringify(soc.flag5 || []),
    JSON.stringify(soc.flag4 || []),
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

const buildWhereClause = (filters) => {
  const conditions = [];
  const params = [];
  let paramIdx = 1;

  // 1. Year Filter
  if (filters.yearDesc) {
    conditions.push(`d.year_desc = $${paramIdx++}`);
    params.push(filters.yearDesc);
  }

  // 2. State Filter
  if (filters.stcode11) {
    conditions.push(`l.stcode11 = $${paramIdx++}`);
    params.push(filters.stcode11);
  }

  // 3. District Filter
  if (filters.dtcode11) {
    conditions.push(`l.dtcode11 = $${paramIdx++}`);
    params.push(filters.dtcode11);
  }

  // 4. School Type Filter (Renamed from 'category' to avoid confusion)
  if (filters.schoolType && filters.schoolType !== 'all') {
    conditions.push(`d.school_type = $${paramIdx++}`);
    params.push(filters.schoolType);
  }

  // 5. [NEW] Category Filter (The new DB column)
  if (filters.category && filters.category !== 'all') {
    conditions.push(`d.category = $${paramIdx++}`);
    params.push(filters.category);
  }

  // 6. Management Filter
  if (filters.management && filters.management !== 'all') {
    conditions.push(`d.management_type = $${paramIdx++}`);
    params.push(filters.management);
  }

  // 7. Search Query
  if (filters.search) {
    conditions.push(`(d.school_name ILIKE $${paramIdx} OR l.schcd ILIKE $${paramIdx})`);
    params.push(`%${filters.search}%`);
    paramIdx++;
  }

  const whereSql = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  return { whereSql, params, paramIdx };
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
    DO UPDATE SET 
      reason = EXCLUDED.reason, 
      created_at = NOW()
  `;
  await pool.query(query, [udiseCode, stcode11, dtcode11, yearDesc, reason]);
};

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

exports.removeSkippedSchool = async (udiseCode) => {
  await pool.query("DELETE FROM udise_data.skipped_udise WHERE udise_code = $1", [udiseCode]);
};

exports.getSkippedSummary = async ({ yearId, stcode11 }) => {
  const params = [];
  let paramIdx = 1;
  const conditions = [];

  // Filter by State if provided
  if (stcode11 && stcode11 !== 'all') {
    conditions.push(`s.stcode11 = $${paramIdx++}`);
    params.push(stcode11);
  }

  // Filter by Year if provided (Matches year_desc column)
  if (yearId && yearId !== 'all') {
    // Note: If yearId is numeric (e.g. 11) but DB stores "2023-24", you need to convert it first.
    // Assuming here we pass the exact string stored in DB or ID matches.
    conditions.push(`s.year_desc = $${paramIdx++}`); 
    params.push(yearId);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  const query = `
    SELECT 
      l.stname as state,
      l.dtname as district,
      s.year_desc as year,
      COUNT(*)::int as count
    FROM udise_data.skipped_udise s
    LEFT JOIN udise_data.school_udise_list l ON s.udise_code = l.schcd
    ${whereClause}
    GROUP BY l.stname, l.dtname, s.year_desc
    ORDER BY l.stname, count DESC
  `;

  const result = await pool.query(query, params);
  return result.rows;
};

exports.getSkippedForExport = async ({ yearId, stcode11, dtcode11 }) => {
  const params = [];
  let paramIdx = 1;
  const conditions = [];

  if (stcode11 && stcode11 !== 'all') {
    conditions.push(`s.stcode11 = $${paramIdx++}`);
    params.push(stcode11);
  }

  if (dtcode11 && dtcode11 !== 'all') {
    conditions.push(`s.dtcode11 = $${paramIdx++}`);
    params.push(dtcode11);
  }

  if (yearId && yearId !== 'all') {
    conditions.push(`s.year_desc = $${paramIdx++}`);
    params.push(yearId);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  const query = `
    SELECT 
      s.udise_code,
      s.reason,
      s.year_desc,
      s.created_at,
      l.stname,
      l.dtname,
      -- Attempt to get school name from directory or skipped log if available
      COALESCE(d.school_name, 'Unknown') as school_name
    FROM udise_data.skipped_udise s
    LEFT JOIN udise_data.school_udise_list l ON s.udise_code = l.schcd
    LEFT JOIN udise_data.school_udise_data d ON s.udise_code = d.udise_code
    ${whereClause}
    ORDER BY s.created_at DESC
  `;

  const result = await pool.query(query, params);
  return result.rows;
};

exports.getStateMatrix = async () => {
  // Uses GROUP BY ROLLUP to get State aggregates AND District aggregates in one query
  const query = `
    SELECT 
      state_name,
      district_name,
      COUNT(udise_code)::int as total_schools,
      COUNT(DISTINCT district_name)::int as total_districts,
      COUNT(DISTINCT block_name)::int as total_blocks,
      SUM(total_teachers)::int as total_teachers,
      SUM(total_students)::int as total_students
    FROM udise_data.school_udise_data
    WHERE state_name IS NOT NULL
    GROUP BY ROLLUP(state_name, district_name)
    ORDER BY state_name NULLS LAST, district_name NULLS LAST
  `;

  const result = await pool.query(query);
  return result.rows;
};