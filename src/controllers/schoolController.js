const pool = require("../config/db");
const schoolModel = require("../models/schoolModel");
const apiService = require("../services/apiService");
const adminController = require("./adminController");

exports.syncDirectory = async (req, res) => {
  try {
    const { stcode11, dtcode11 } = req.body;

    const allObjectIds = await schoolModel.getObjectIds(stcode11, dtcode11);
    if (!allObjectIds.length) {
      return res.json({
        success: true,
        count: 0,
        message: "No Object IDs found.",
      });
    }

    const existingObjectIds = await schoolModel.getExistingObjectIds(
      stcode11,
      dtcode11
    );
    const existingSet = new Set(existingObjectIds.map(String));
    const idsToSync = allObjectIds.filter((id) => !existingSet.has(String(id)));

    if (idsToSync.length === 0) {
      // Even if already synced, we try to resolve any orphaned tickets
      await adminController.resolveTicketsAfterSync(stcode11, dtcode11);
      return res.json({
        success: true,
        count: 0,
        message: "All schools already synced.",
      });
    }

    const count = await apiService.syncSchoolsFromGIS(
      stcode11,
      dtcode11,
      idsToSync
    );

    // [ACTION] Resolve pending tickets after directory sync
    await adminController.resolveTicketsAfterSync(stcode11, dtcode11);

    res.json({
      success: true,
      count,
      message: `Directory Sync: Added ${count} new schools. User tickets resolved.`,
    });
  } catch (err) {
    console.error("Directory Sync Error:", err);
    res.status(500).json({ success: false, error: err.message });
  }
};

exports.syncSchoolDetails = async (req, res) => {
  try {
    const { stcode11, dtcode11, yearId, udiseList, batchSize, strictMode } =
      req.body;

    const validYearId = yearId && parseInt(yearId) > 0 ? yearId : 11;

    // 1. [CONFIG] Set defaults and resolve Year Description
    const CHUNK_SIZE =
      batchSize && parseInt(batchSize) > 0 ? parseInt(batchSize) : 5;
    const IS_STRICT = strictMode === true;

    const yearsMeta = await apiService.fetchYears();
    const selectedYearMeta = yearsMeta.find(
      (y) => String(y.yearId) === String(validYearId)
    );
    const yearDesc = selectedYearMeta
      ? selectedYearMeta.yearDesc
      : `${validYearId}`;

    // 2. Determine School List
    let schools = [];
    if (udiseList && Array.isArray(udiseList) && udiseList.length > 0) {
      schools = udiseList.map((code) => ({ udise_code: code }));
    } else {
      schools = await schoolModel.getSchoolsForDetailSync(stcode11, dtcode11);
    }

    if (!schools.length) {
      return res.json({ success: false, message: "No schools found to sync." });
    }

    let processed = 0;
    let skipped = 0;
    let failed = 0;

    // 3. Main Sync Loop with Batching
    for (let i = 0; i < schools.length; i += CHUNK_SIZE) {
      const chunk = schools.slice(i, i + CHUNK_SIZE);

      const promises = chunk.map(async (school) => {
        try {
          // Check if detailed data already exists locally
          const existingRecord = await schoolModel.checkSchoolDataExists(
            school.udise_code,
            yearDesc
          );

          if (existingRecord && existingRecord.school_name) {
            skipped++;
            return;
          }

          // Fetch from UDISE+ API
          const fullData = await apiService.fetchFullSchoolData(
            school.udise_code,
            validYearId
          );

          // [NEW VALIDATION]: Check if BOTH name and block are missing
          const hasName = fullData?.report?.schoolName;
          const hasBlock = fullData?.report?.blockName;
          const isDataMissing = !hasName && !hasBlock;

          // Determine validity based on strict mode and missing mandatory fields
          const isValid = IS_STRICT
            ? hasName && hasBlock
            : fullData !== null && !isDataMissing;

          if (isValid) {
            fullData.yearDesc = yearDesc;
            await schoolModel.upsertSchoolDetails(fullData);

            // Clean up the skipped table if this school was previously failing
            await schoolModel.removeSkippedSchool(school.udise_code);
            processed++;
          } else {
            // [LOG TO SKIPPED]: Log school if mandatory fields are missing for this year
            const reason = isDataMissing
              ? "Missing School Name & Block"
              : fullData === null
              ? "API Returned Empty"
              : "Validation Failed (Strict Mode)";

            await schoolModel.logSkippedSchool(
              school.udise_code,
              stcode11,
              dtcode11,
              yearDesc,
              reason
            );
            failed++;
          }
        } catch (innerErr) {
          console.error(
            `❌ Error syncing ${school.udise_code}:`,
            innerErr.message
          );

          // Log specific DB/API errors as the skip reason
          await schoolModel.logSkippedSchool(
            school.udise_code,
            stcode11,
            dtcode11,
            yearDesc,
            `Error: ${innerErr.message}`
          );
          failed++;
        }
      });

      await Promise.all(promises);
    }

    // 4. [AUTO-RESOLVE]: Clear user requests for this district now that sync is finished
    if (stcode11 && dtcode11) {
      await adminController.resolveTicketsAfterSync(stcode11, dtcode11);
    }

    res.json({
      success: true,
      count: processed,
      skipped,
      failed,
      message: `Sync Complete: ${processed} schools added/updated. Notifications resolved.`,
    });
  } catch (err) {
    console.error("Critical Sync Error:", err);
    res.status(500).json({ success: false, error: err.message });
  }
};

exports.getSkippedList = async (req, res) => {
  try {
    const { page = 1, limit = 50 } = req.query;
    const result = await schoolModel.getSkippedSchools(
      parseInt(page),
      parseInt(limit)
    );
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.getMySchools = async (req, res) => {
  try {
    const {
      stcode11,
      dtcode11,
      page = 1,
      limit = 50,
      schoolType, // [RENAMED] was category
      category, // [NEW] the actual category column
      management,
      yearId,
      search,
    } = req.query;

    // Resolve Year ID -> Description
    let yearDesc = null;
    if (yearId) {
      const years = await apiService.fetchYears();
      const match = years.find((y) => String(y.yearId) === String(yearId));
      if (match) yearDesc = match.yearDesc;
    }

    const filters = {
      stcode11,
      dtcode11,
      schoolType,
      category,
      management,
      yearDesc,
      search,
    };

    const result = await schoolModel.getLocalSchoolList(
      filters,
      parseInt(page),
      parseInt(limit)
    );

    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.getFilters = async (req, res) => {
  try {
    // You might need to add a method in schoolModel to fetching distinct values
    // For now, assuming you have a way or simple query:
    const schoolTypesQuery = `SELECT DISTINCT school_type FROM udise_data.school_udise_data WHERE school_type IS NOT NULL ORDER BY school_type`;
    const categoriesQuery = `SELECT DISTINCT category FROM udise_data.school_udise_data WHERE category IS NOT NULL ORDER BY category`;
    const managementsQuery = `SELECT DISTINCT management_type FROM udise_data.school_udise_data WHERE management_type IS NOT NULL ORDER BY management_type`;

    const [typesRes, catsRes, mgmtRes] = await Promise.all([
      pool.query(schoolTypesQuery),
      pool.query(categoriesQuery),
      pool.query(managementsQuery),
    ]);

    res.json({
      schoolTypes: typesRes.rows.map((r) => r.school_type),
      categories: catsRes.rows.map((r) => r.category), // [NEW]
      managements: mgmtRes.rows.map((r) => r.management_type),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch filters" });
  }
};

exports.syncData = async (req, res) => {
  try {
    const { stcode11, dtcode11 } = req.body;
    const objectIds = await schoolModel.getObjectIds(stcode11, dtcode11);

    if (!objectIds.length)
      return res.json({
        success: false,
        message: "No Object IDs found.",
        count: 0,
      });

    const count = await apiService.syncSchoolsFromGIS(
      stcode11,
      dtcode11,
      objectIds
    );
    res.json({ success: true, message: "GIS Sync complete", count });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

exports.searchSchool = async (req, res) => {
  const data = await apiService.fetchUdisePlusData("search-schools", {
    ...req.query,
  });
  res.json(data);
};

exports.getProfile = async (req, res) => {
  const { schoolId } = req.params;
  const data = await apiService.fetchUdisePlusData("school/profile", {
    schoolId,
    yearId: 11,
  });
  res.json(data);
};

exports.getFacilities = async (req, res) => {
  const { schoolId } = req.params;
  const data = await apiService.fetchUdisePlusData("school/facility", {
    schoolId,
    yearId: 11,
  });
  res.json(data);
};

const calculateRowTotal = (row) => {
  if (!row) return 0;

  // List of all possible student columns based on UDISE+ structure
  const fields = [
    // Pre-primary
    "pp1B",
    "pp1G",
    "pp2B",
    "pp2G",
    "pp3B",
    "pp3G",
    // Classes 1-12 (Boys & Girls)
    "c1B",
    "c1G",
    "c2B",
    "c2G",
    "c3B",
    "c3G",
    "c4B",
    "c4G",
    "c5B",
    "c5G",
    "c6B",
    "c6G",
    "c7B",
    "c7G",
    "c8B",
    "c8G",
    "c9B",
    "c9G",
    "c10B",
    "c10G",
    "c11B",
    "c11G",
    "c12B",
    "c12G",
  ];

  // Sum them up
  return fields.reduce((sum, key) => {
    // Parse Int safely (handle null/undefined)
    return sum + (parseInt(row[key]) || 0);
  }, 0);
};

exports.getSocialData = async (req, res) => {
  const { schoolId } = req.params;
  const yearId = 11;

  try {
    // Fetch Flag 1 (Social Cat), Flag 2 (CWSN), Flag 4 (EWS)
    const [social1, social2, social4] = await Promise.all([
      apiService.fetchUdisePlusData("getSocialData", {
        flag: 1,
        schoolId,
        yearId,
      }),
      apiService.fetchUdisePlusData("getSocialData", {
        flag: 2,
        schoolId,
        yearId,
      }),
      apiService.fetchUdisePlusData("getSocialData", {
        flag: 4,
        schoolId,
        yearId,
      }),
    ]);

    const list1 = social1?.data?.schEnrollmentYearDataDTOS || [];
    const list2 = social2?.data?.schEnrollmentYearDataDTOS || [];
    const list4 = social4?.data?.schEnrollmentYearDataDTOS || [];

    // -------------------------------------

    // Helper to find specific category row and calculate its total
    const getCategorySum = (list, name) => {
      const found = list.find((i) =>
        i.enrollmentName?.toLowerCase().includes(name.toLowerCase())
      );
      return calculateRowTotal(found);
    };

    // Helper to sum the totals of ALL rows in a list (for CWSN/EWS)
    const getListSum = (list) => {
      return list.reduce((acc, curr) => acc + calculateRowTotal(curr), 0);
    };

    const responseData = {
      // Flag 1: Specific Rows
      general: getCategorySum(list1, "General"),
      caste_SC: getCategorySum(list1, "SC"),
      caste_ST: getCategorySum(list1, "ST"),
      OBC: getCategorySum(list1, "OBC"),

      // Flag 2 & 4: Sum of all rows
      EWS: getListSum(list4),
      CWSN: getListSum(list2),
    };

    res.json(responseData);
  } catch (error) {
    console.error("❌ Social Data Error:", error);
    res.json({ caste_SC: 0, caste_ST: 0, OBC: 0, EWS: 0, general: 0, CWSN: 0 });
  }
};

exports.getStats = async (req, res) => {
  const { schoolId } = req.params;
  const data = await apiService.fetchUdisePlusData(
    "school-statistics/enrolment-teacher",
    { schoolId }
  );
  res.json(data);
};

const getSocialSum = (jsonList, categoryName) => {
  if (!jsonList || !Array.isArray(jsonList)) return 0;

  // Calculate row total helper
  const rowTotal = (row) => {
    const fields = [
      "pp1B",
      "pp1G",
      "pp2B",
      "pp2G",
      "pp3B",
      "pp3G",
      "c1B",
      "c1G",
      "c2B",
      "c2G",
      "c3B",
      "c3G",
      "c4B",
      "c4G",
      "c5B",
      "c5G",
      "c6B",
      "c6G",
      "c7B",
      "c7G",
      "c8B",
      "c8G",
      "c9B",
      "c9G",
      "c10B",
      "c10G",
      "c11B",
      "c11G",
      "c12B",
      "c12G",
    ];
    return fields.reduce((sum, key) => sum + (parseInt(row[key]) || 0), 0);
  };

  if (categoryName === "ALL") {
    return jsonList.reduce((acc, row) => acc + rowTotal(row), 0);
  }

  const found = jsonList.find((i) =>
    i.enrollmentName?.toLowerCase().includes(categoryName.toLowerCase())
  );
  return found ? rowTotal(found) : 0;
};

exports.getLocalSchoolDetails = async (req, res) => {
  try {
    const { schoolId } = req.params;
    const school = await schoolModel.getSchoolById(schoolId);

    if (!school) {
      return res.status(404).json({
        error: "School not found in local database. Please sync it first.",
      });
    }

    // Parse JSON fields (Handle both stringified JSON and pre-parsed JSONB)
    const parse = (val) =>
      (typeof val === "string" ? JSON.parse(val) : val) || [];
    const socialGen = parse(school.social_data_general_sc_st_obc);
    const socialCwsn = parse(school.social_data_cwsn); // Flag 2
    const socialEws = parse(school.social_data_ews); // Flag 4

    // Construct the response object to match Frontend Interfaces
    const response = {
      profile: {
        udise_code: school.udise_code,
        school_name: school.school_name,
        // [NEW] Contact & Location
        school_phone: school.school_phone,
        location_type: school.location_type,

        state_name: school.state_name,
        district_name: school.district_name,
        block_name: school.block_name,
        cluster: school.cluster_name,
        village: school.village_ward_name,
        pincode: school.pincode || "",

        // [NEW] Use the new 'category' column if available, else fallback
        category_name: school.category || school.school_type,
        management_type: school.management_type || "Department of Education",

        // [NEW] Basic Info
        establishment_year: school.establishment_year || 0,
        head_master: school.head_master_name,
        school_status: school.school_status,
        year_desc: school.year_desc,

        // [NEW] Extra Profile Flags
        is_pre_primary_section: school.is_pre_primary_section,
        residential_school_type: school.residential_school_type,
        is_cwsn_school: school.is_cwsn_school,
        shift_school: school.is_shift_school,

        // [NEW] Mediums & Instruction
        medium_of_instruction_1: school.medium_of_instruction_1,
        medium_of_instruction_2: school.medium_of_instruction_2,
        medium_of_instruction_3: school.medium_of_instruction_3,
        medium_of_instruction_4: school.medium_of_instruction_4,
        instructional_days: school.instructional_days,

        // [NEW] Visits
        visits_by_brc: school.visits_by_brc,
        visits_by_crc: school.visits_by_crc,
        visits_by_district_officer: school.visits_by_district_officer,
      },
      facility: {
        // Basic
        building_status: school.building_status,
        classroom_count: school.total_classrooms_in_use,
        good_condition_classrooms: school.good_condition_classrooms,
        boundary_wall: school.boundary_wall_type || "Unknown",
        furniture: "Unknown", // Field not in DB, keep placeholder or remove

        // Sanitation
        toilet_boys: school.total_toilets_boys,
        toilet_girls: school.total_toilets_girls,
        urinals_boys: school.urinals_boys, // [NEW]
        urinals_girls: school.urinals_girls, // [NEW]

        // Amenities (Booleans)
        electricity: school.has_electricity,
        library: school.has_library,
        playground: school.has_playground,
        drinking_water: school.has_drinking_water_facility,
        ramp: school.has_ramps, // [UPDATED] Mapped from DB

        // [NEW] Amenities
        has_handwash_meal: school.has_handwash_meal,
        has_handwash_common: school.has_handwash_common,
        has_handrails: school.has_handrails,
        has_medical_checkup: school.has_medical_checkup,
        has_hm_room: school.has_hm_room,
        has_solar_panel: school.has_solar_panel,
        has_rain_harvesting: school.has_rain_harvesting,

        // [NEW] Digital & Furniture
        has_internet: school.has_internet,
        has_dth_access: school.has_dth_access,
        has_integrated_lab: school.has_integrated_lab,
        functional_desktops: school.functional_desktops,
        total_digital_boards: school.total_digital_boards,
        students_with_furniture: school.students_with_furniture,
      },
      social: {
        general: getSocialSum(socialGen, "General"),
        caste_SC: getSocialSum(socialGen, "SC"),
        caste_ST: getSocialSum(socialGen, "ST"),
        OBC: getSocialSum(socialGen, "OBC"),
        CWSN: getSocialSum(socialCwsn, "ALL"),
        EWS: getSocialSum(socialEws, "ALL"),
      },
      teachers: {
        total_teachers: school.total_teachers,
        teachers_male: school.total_male_teachers,
        teachers_female: school.total_female_teachers,
        regular: school.total_regular_teachers,
        contract: school.total_contract_teachers,
        part_time: school.total_part_time_teachers, // [NEW]

        // [NEW] Engagement
        non_teaching_assignments: school.teachers_non_teaching_assignments,
        in_service_training: school.teachers_in_service_training,

        // [NEW] Academic Stats
        below_graduate: school.teachers_below_graduate,
        graduate_above: school.teachers_graduate_above,
        post_graduate_above: school.teachers_post_graduate_above,

        // [NEW] Professional Quals
        qual_diploma_basic: school.teacher_qual_diploma_basic,
        qual_bele: school.teacher_qual_bele,
        qual_bed: school.teacher_qual_bed,
        qual_med: school.teacher_qual_med,
        qual_others: school.teacher_qual_others,
        qual_none: school.teacher_qual_none,
        qual_special_ed: school.teacher_qual_special_ed,
        qual_pursuing: school.teacher_qual_pursuing,
        qual_deled: school.teacher_qual_deled,
        qual_diploma_preschool: school.teacher_qual_diploma_preschool,
        qual_bed_nursery: school.teacher_qual_bed_nursery,
      },
      stats: {
        students_total: school.total_students,
        students_boys: school.total_boy_students,
        students_girls: school.total_girl_students,
      },
    };

    res.json(response);
  } catch (err) {
    console.error("Local Details Error:", err);
    res.status(500).json({ error: err.message });
  }
};

exports.getDashboardStats = async (req, res) => {
  try {
    const stats = await schoolModel.getDashboardStats();
    res.json(stats);
  } catch (err) {
    console.error("Dashboard Stats Error:", err);
    res.status(500).json({ error: err.message });
  }
};

exports.getSkippedSummary = async (req, res) => {
  try {
    const { yearId, stcode11 } = req.query;
    let finalYear = yearId;

    // Convert numeric ID (11) to DB string (2024-25)
    if (yearId && !isNaN(parseInt(yearId))) {
      const years = await apiService.fetchYears();
      const match = years.find((y) => String(y.yearId) === String(yearId));
      if (match) finalYear = match.yearDesc;
    }

    const summary = await schoolModel.getSkippedSummary({
      yearId: finalYear, // Now matches "2024-25" in database
      stcode11,
    });

    res.json(summary);
  } catch (err) {
    console.error("Skipped Summary Error:", err);
    res.status(500).json({ error: "Failed to fetch skipped summary" });
  }
};

exports.exportSkippedList = async (req, res) => {
  try {
    const { format = "json", yearId, stcode11, dtcode11 } = req.query;

    const data = await schoolModel.getSkippedForExport({
      yearId,
      stcode11,
      dtcode11,
    });

    if (format === "csv") {
      // Basic CSV conversion
      const headers = [
        "UDISE Code",
        "School Name",
        "State",
        "District",
        "Year",
        "Reason",
        "Date",
      ];
      const csvRows = [headers.join(",")];

      data.forEach((row) => {
        csvRows.push(
          [
            row.udise_code,
            `"${(row.school_name || "").replace(/"/g, '""')}"`, // Escape quotes
            row.stname,
            row.dtname,
            row.year_desc,
            `"${(row.reason || "").replace(/"/g, '""')}"`,
            new Date(row.created_at).toLocaleDateString(),
          ].join(",")
        );
      });

      res.setHeader("Content-Type", "text/csv");
      res.setHeader(
        "Content-Disposition",
        "attachment; filename=skipped_schools.csv"
      );
      return res.send(csvRows.join("\n"));
    }

    // Default JSON
    res.setHeader("Content-Type", "application/json");
    res.setHeader(
      "Content-Disposition",
      "attachment; filename=skipped_schools.json"
    );
    res.json(data);
  } catch (err) {
    console.error("Export Skipped Error:", err);
    res.status(500).json({ error: "Failed to export skipped list" });
  }
};

exports.getStateMatrix = async (req, res) => {
  try {
    const rawRows = await schoolModel.getStateMatrix();
    const stateMap = {};
    
    // Capture global lifecycle totals from first row
    const lifecycle = rawRows.length > 0 ? {
        master: rawRows[0].master_object_count,
        directory: rawRows[0].directory_list_count,
        fetched: rawRows[0].total_fetched_data
    } : { master: 0, directory: 0, fetched: 0 };

    rawRows.forEach((row) => {
      if (!row.state_name) return;

      if (!stateMap[row.state_name]) {
        stateMap[row.state_name] = {
          name: row.state_name,
          type: "state",
          stats: { schools: 0, teachers: 0, students: 0, infra_index: 0, ptr: 0, gpi: 0 },
          districts: {},
        };
      }

      const state = stateMap[row.state_name];

      if (!row.district_name) {
        // State Totals
        state.stats = { 
            schools: row.total_schools, teachers: row.total_teachers, students: row.total_students,
            infra_index: row.infra_index, ptr: row.ptr, gpi: row.gpi 
        };
      } else {
        if (!state.districts[row.district_name]) {
          state.districts[row.district_name] = {
            name: row.district_name,
            type: "district",
            stats: { schools: 0, teachers: 0, students: 0, infra_index: 0, ptr: 0, gpi: 0 },
            blocks: [],
          };
        }
        const district = state.districts[row.district_name];

        if (!row.block_name) {
          // District Totals
          district.stats = { 
              schools: row.total_schools, teachers: row.total_teachers, students: row.total_students,
              infra_index: row.infra_index, ptr: row.ptr, gpi: row.gpi 
          };
        } else {
          // Block Totals
          district.blocks.push({
            name: row.block_name,
            type: "block",
            stats: { 
                schools: row.total_schools, teachers: row.total_teachers, students: row.total_students,
                infra_index: row.infra_index, ptr: row.ptr, gpi: row.gpi 
            },
          });
        }
      }
    });

    const hierarchy = Object.values(stateMap).map((s) => ({
      ...s,
      districts: Object.values(s.districts).sort((a, b) => a.name.localeCompare(b.name)),
    })).sort((a, b) => a.name.localeCompare(b.name));

    // Return both the hierarchy and the global lifecycle counts
    res.json({ hierarchy, lifecycle });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.getUnsyncedLocations = async (req, res) => {
  try {
    // This query finds districts that exist in master but NOT in the schools table
    const result = await pool.query(`
      SELECT 
    d.stcode11, 
    d.stname AS stname, 
    d.dtcode11, 
    d.dtname AS dtname
FROM udise_data.district d
WHERE d.dtname NOT IN (
    SELECT DISTINCT district_name 
    FROM udise_data.school_udise_data 
    WHERE district_name IS NOT NULL
)
ORDER BY d.stname, d.dtname;
    `);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch unsynced locations" });
  }
};

exports.raiseDataRequest = async (req, res) => {
  const { stcode11, stname, dtcode11, dtnames } = req.body;
  const userId = req.user.userId;

  try {
    // Check for pending requests that overlap with requested districts
    const checkQuery = `
      SELECT r.*, u.name as requester_name 
      FROM udise_data.data_requests r
      JOIN udise_data.users u ON r.user_id = u.user_id
      WHERE r.stcode11 = $1 
        AND r.dtcode11 && $2::text[] 
        AND r.status = 'pending'
      LIMIT 1`;

    const duplicate = await pool.query(checkQuery, [stcode11, dtcode11]);

    if (duplicate.rows.length > 0) {
      const d = duplicate.rows[0];
      // This sends the specific name back to the frontend
      return res.status(409).json({
        error: "Duplicate Request",
        message: `${d.requester_name} has already raised a pending request for these districts in ${stname}.`,
      });
    }

    await pool.query(
      `INSERT INTO udise_data.data_requests 
       (user_id, stcode11, stname, dtcode11, dtnames, status) 
       VALUES ($1, $2, $3, $4, $5, 'pending')`,
      [userId, stcode11, stname, dtcode11, dtnames]
    );

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: "Internal Server Error" });
  }
};

exports.getPendingRequests = async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        r.request_id, 
        u.name as user_name, 
        r.stname, 
        r.dtnames, 
        r.created_at
      FROM udise_data.data_requests r
      JOIN udise_data.users u ON r.user_id = u.user_id
      WHERE r.status = 'pending'
      ORDER BY r.created_at DESC
    `);
    res.json(result.rows);
  } catch (err) {
    console.error("Error fetching pending requests:", err);
    res.status(500).json({ error: "Failed to fetch pending requests" });
  }
};