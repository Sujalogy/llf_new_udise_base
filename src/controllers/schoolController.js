const schoolModel = require("../models/schoolModel");
const apiService = require("../services/apiService");

// 1. Step 1: Sync Directory (Using GIS Logic)
exports.syncDirectory = async (req, res) => {
  try {
    const { stcode11, dtcode11 } = req.body;

    // A. Get Object IDs from Master Object
    const objectIds = await schoolModel.getObjectIds(stcode11, dtcode11);

    if (!objectIds.length) {
      return res.json({
        success: true,
        count: 0,
        message: "No Object IDs found in Master.",
      });
    }

    // B. Fetch from GIS & Save to school_udise_list
    const count = await apiService.syncSchoolsFromGIS(
      stcode11,
      dtcode11,
      objectIds
    );

    res.json({
      success: true,
      count,
      message: "Directory (GIS) synced successfully",
    });
  } catch (err) {
    console.error("Directory Sync Error:", err);
    res.status(500).json({ success: false, error: err.message });
  }
};

// 2. Step 2: Sync Full Details (Using UDISE+ Logic)
exports.syncSchoolDetails = async (req, res) => {
  try {
    const { stcode11, dtcode11, yearId } = req.body;

    // A. Get UDISE Codes from school_udise_list
    const schools = await schoolModel.getSchoolsForDetailSync(
      stcode11,
      dtcode11
    );

    if (!schools.length) {
      return res.json({
        success: false,
        message: "No schools in Directory. Run Step 1 first.",
      });
    }

    console.log(`🚀 Syncing details for ${schools.length} schools...`);

    let processed = 0;
    const CHUNK_SIZE = 5;

    for (let i = 0; i < schools.length; i += CHUNK_SIZE) {
      const chunk = schools.slice(i, i + CHUNK_SIZE);
      const promises = chunk.map(async (school) => {
        // B. Fetch Details (Search -> ID -> Data)
        const fullData = await apiService.fetchFullSchoolData(
          school.udise_code,
          yearId || 11
        );
        if (fullData) {
          // C. Save to school_udise_data
          await schoolModel.upsertSchoolDetails(fullData);
          processed++;
        }
      });
      await Promise.all(promises);
    }

    res.json({
      success: true,
      count: processed,
      message: "School details synced successfully",
    });
  } catch (err) {
    console.error("Detail Sync Error:", err);
    res.status(500).json({ success: false, error: err.message });
  }
};

// ... keep existing getMySchools & proxies
exports.getMySchools = async (req, res) => {
  try {
    // Extract page and limit from query params (default to 1 and 50 if missing)
    const { stcode11, dtcode11, page = 1, limit = 50 } = req.query;

    // Pass them to the model
    const schools = await schoolModel.getLocalSchoolList(
      stcode11,
      dtcode11,
      parseInt(page),
      parseInt(limit)
    );

    res.json(schools);
  } catch (err) {
    res.status(500).json({ error: err.message });
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
// ... other proxies
exports.searchSchool = async (req, res) => {
  const data = await apiService.fetchUdisePlusData("search-schools", {
    ...req.query,
  });
  res.json(data);
};
// (Keep all other proxy exports from previous steps)
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
    'pp1B', 'pp1G', 'pp2B', 'pp2G', 'pp3B', 'pp3G',
    // Classes 1-12 (Boys & Girls)
    'c1B', 'c1G', 'c2B', 'c2G', 'c3B', 'c3G', 'c4B', 'c4G', 
    'c5B', 'c5G', 'c6B', 'c6G', 'c7B', 'c7G', 'c8B', 'c8G', 
    'c9B', 'c9G', 'c10B', 'c10G', 'c11B', 'c11G', 'c12B', 'c12G'
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
    console.log(`📡 Fetching Social Data for School: ${schoolId}`);

    // Fetch Flag 1 (Social Cat), Flag 2 (CWSN), Flag 4 (EWS)
    const [social1, social2, social4] = await Promise.all([
      apiService.fetchUdisePlusData("getSocialData", { flag: 1, schoolId, yearId }),
      apiService.fetchUdisePlusData("getSocialData", { flag: 2, schoolId, yearId }), 
      apiService.fetchUdisePlusData("getSocialData", { flag: 4, schoolId, yearId })
    ]);

    const list1 = social1?.data?.schEnrollmentYearDataDTOS || [];
    const list2 = social2?.data?.schEnrollmentYearDataDTOS || [];
    const list4 = social4?.data?.schEnrollmentYearDataDTOS || [];

    // -------------------------------------

    // Helper to find specific category row and calculate its total
    const getCategorySum = (list, name) => {
      const found = list.find(i => i.enrollmentName?.toLowerCase().includes(name.toLowerCase()));
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
      CWSN: getListSum(list2) 
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
