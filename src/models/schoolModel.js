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

exports.getLocalSchoolList = async (
  stcode11,
  dtcode11,
  page = 1,
  limit = 100
) => {
  const offset = (page - 1) * limit;

  // 1. Fetch Paginated Data
  const dataQuery = `
    SELECT 
      l.schcd as udise_code,
      d.school_name,
      l.stname as state_name,
      l.dtname as district_name,
      d.block_name,
      l.pincode,
      l.latitude,
      l.longitude,
      d.school_id,
      d.school_status,
      d.total_students,
      d.total_teachers
    FROM udise_data.school_udise_list l
    LEFT JOIN udise_data.school_udise_data d ON l.schcd = d.udise_code
    WHERE l.stcode11 = $1 AND l.dtcode11 = $2
    ORDER BY d.school_name ASC, l.schcd ASC
    LIMIT $3 OFFSET $4
  `;

  // 2. Fetch Total Count (for UI pagination info)
  const countQuery = `
    SELECT COUNT(*) as total
    FROM udise_data.school_udise_list l
    WHERE l.stcode11 = $1 AND l.dtcode11 = $2
  `;

  // Execute queries in parallel
  const [dataResult, countResult] = await Promise.all([
    pool.query(dataQuery, [stcode11, dtcode11, limit, offset]),
    pool.query(countQuery, [stcode11, dtcode11]),
  ]);

  return {
    data: dataResult.rows,
    meta: {
      page: page,
      limit: limit,
      count: dataResult.rows.length, // Count of current page
      total: parseInt(countResult.rows[0].total), // Total records in DB
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
  // We explicitly check for the composite pair
  const query = `
    SELECT 1 FROM udise_data.school_udise_data 
    WHERE udise_code = $1 AND year_desc = $2
  `;
  const result = await pool.query(query, [String(udiseCode), String(yearDesc)]);
  return result.rows.length > 0;
};

exports.upsertSchoolDetails = async (data) => {
  // [UPDATE] Changed ON CONFLICT to use (udise_code, year_desc)
  // Ensure you have a UNIQUE constraint/index on these two columns in your DB
  const query = `
    INSERT INTO udise_data.school_udise_data (
      udise_code, school_id, school_name, year_desc,
      
      -- Location Details ($45-$49)
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
      state_name = EXCLUDED.state_name,
      district_name = EXCLUDED.district_name,
      block_name = EXCLUDED.block_name,
      village_ward_name = EXCLUDED.village_ward_name,
      cluster_name = EXCLUDED.cluster_name,
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

  const num = (val) => {
    const n = parseInt(val, 10);
    return isNaN(n) ? 0 : n;
  };

  const intOrNull = (val) => {
    const n = parseInt(val, 10);
    return isNaN(n) ? null : n;
  };

  const toBool = (val) => {
    if (!val) return false;
    const str = String(val).toLowerCase();
    return str.includes("yes") || str.startsWith("1");
  };

  const totalTeachers = r.totalTeacher
    ? num(r.totalTeacher)
    : num(s.totalTeacherReg) + num(s.totalTeacherCon);

  const values = [
    // $1 - $4
    data.udiseCode,
    data.schoolId,
    r.schoolName,
    r.yearDesc, // Using the year description from API (e.g., "2023-24")

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
