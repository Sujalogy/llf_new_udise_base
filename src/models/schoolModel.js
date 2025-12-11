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

// -------------------------------------------------------------------------
// 2. LISTING & EXPORT
// -------------------------------------------------------------------------

exports.getLocalSchoolList = async (
  stcode11,
  dtcode11,
  page = 1,
  limit = 100
) => {
  // Calculate the offset based on the page number
  // Page 1: offset 0
  // Page 2: offset 100 (if limit is 100)
  const offset = (page - 1) * limit;

  const query = `
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

  // We pass limit and offset as the 3rd and 4th parameters
  const result = await pool.query(query, [stcode11, dtcode11, limit, offset]);

  return {
    data: result.rows,
    meta: {
      page: page,
      limit: limit,
      count: result.rows.length,
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

exports.upsertSchoolDetails = async (data) => {
  const query = `
    INSERT INTO udise_data.school_udise_data (
      udise_code, school_id, school_name, year_desc,
      
      -- We map these to $45-$49 at the end of the values array
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
      $45, $46, $47, $48, $49,  -- These placeholders expect values at indices 44-48
      $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17,
      $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29,
      $30, $31, $32, $33, $34, $35, $36,
      $37, $38, $39,
      $40, $41, $42, $43, $44
    )
    ON CONFLICT (udise_code) DO UPDATE SET
      school_id = EXCLUDED.school_id,
      school_name = EXCLUDED.school_name,
      year_desc = EXCLUDED.year_desc,
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

  const toBool = (val) => val === 1 || val === "1-Yes";
  const num = (val) => {
    const n = parseInt(val, 10);
    return isNaN(n) ? 0 : n;
  };
  const intOrNull = (val) => {
    const n = parseInt(val, 10);
    return isNaN(n) ? null : n;
  };

  const totalTeachers = r.totalTeacher
    ? num(r.totalTeacher)
    : num(s.totalTeacherReg) + num(s.totalTeacherCon);

  // --- CORRECTED ORDER ---
  const values = [
    // $1 - $4
    data.udiseCode,
    data.schoolId,
    r.schoolName,
    r.yearDesc,

    // $5 - $9 (Previously you had location strings here, which broke the order)
    p.headMasterName, // $5
    intOrNull(r.schoolStatus), // $6
    intOrNull(r.schType), // $7
    intOrNull(p.mediumOfInstrId1), // $8
    intOrNull(p.mediumOfInstrId2), // $9

    // $10 (The Boolean that was receiving "SANGEETHA")
    p.minorityYn === 1, // $10

    // $11 - $17
    p.anganwadiYn === 1,
    num(p.anganwadiStuB),
    num(p.anganwadiStuG),
    p.cceYn === 1,
    p.smcYn === 1,
    p.approachRoadYn === 1,
    p.shiftSchYn === 1,

    // $18 - $29
    intOrNull(f.bldStatusId),
    num(f.clsrmsInst),
    num(f.clsrmsGd),
    num(f.toiletb),
    num(f.toiletg),
    toBool(f.drinkWaterYn),
    toBool(f.electricityYn),
    toBool(f.libraryYn),
    toBool(f.playgroundYn),
    toBool(f.medchkYn),
    toBool(f.integratedLabYn),
    toBool(f.internetYn),

    // $30 - $36
    totalTeachers,
    num(r.totMale),
    num(r.totFemale),
    num(r.tchReg),
    num(r.tchCont),
    intOrNull(r.lowClass),
    intOrNull(r.highClass),

    // $37 - $39
    num(s.totalBoy),
    num(s.totalGirl),
    num(s.totalCount),

    // $40 - $44
    JSON.stringify(soc.flag1 || []),
    JSON.stringify(soc.flag2 || []),
    JSON.stringify(soc.flag3 || []),
    JSON.stringify(soc.flag5 || []),
    JSON.stringify(soc.flag4 || []),

    // --- NEW FIELDS ($45 - $49) ---
    // Moved to the end to match the SQL placeholders
    r.stateName, // $45
    r.districtName, // $46
    r.blockName, // $47
    r.villageWardName, // $48
    r.clusterName, // $49
  ];

  await pool.query(query, values);
};
