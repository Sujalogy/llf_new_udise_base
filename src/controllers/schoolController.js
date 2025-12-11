const schoolModel = require("../models/schoolModel");
const apiService = require("../services/apiService");

// 1. Step 1: Sync Directory (Using GIS Logic)
exports.syncDirectory = async (req, res) => {
  try {
    const { stcode11, dtcode11 } = req.body;
    
    // A. Get Object IDs from Master Object
    const objectIds = await schoolModel.getObjectIds(stcode11, dtcode11);
    
    if (!objectIds.length) {
      return res.json({ success: true, count: 0, message: "No Object IDs found in Master." });
    }

    // B. Fetch from GIS & Save to school_udise_list
    const count = await apiService.syncSchoolsFromGIS(stcode11, dtcode11, objectIds);
    
    res.json({ success: true, count, message: "Directory (GIS) synced successfully" });

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
    const schools = await schoolModel.getSchoolsForDetailSync(stcode11, dtcode11);
    
    if (!schools.length) {
      return res.json({ success: false, message: "No schools in Directory. Run Step 1 first." });
    }

    console.log(`🚀 Syncing details for ${schools.length} schools...`);

    let processed = 0;
    const CHUNK_SIZE = 5; 
    
    for (let i = 0; i < schools.length; i += CHUNK_SIZE) {
      const chunk = schools.slice(i, i + CHUNK_SIZE);
      const promises = chunk.map(async (school) => {
        // B. Fetch Details (Search -> ID -> Data)
        const fullData = await apiService.fetchFullSchoolData(school.udise_code, yearId || 11);
        if (fullData) {
          // C. Save to school_udise_data
          await schoolModel.upsertSchoolDetails(fullData);
          processed++;
        }
      });
      await Promise.all(promises);
      console.log(`✅ Processed ${processed}/${schools.length}`);
    }

    res.json({ success: true, count: processed, message: "School details synced successfully" });

  } catch (err) {
    console.error("Detail Sync Error:", err);
    res.status(500).json({ success: false, error: err.message });
  }
};

// ... keep existing getMySchools & proxies
exports.getMySchools = async (req, res) => {
  try {
    const { stcode11, dtcode11 } = req.query;
    const schools = await schoolModel.getLocalSchoolList(stcode11, dtcode11);
    res.json(schools);
  } catch (err) { res.status(500).json({ error: err.message }); }
};

exports.syncData = async (req, res) => {
  try {
    const { stcode11, dtcode11 } = req.body;
    const objectIds = await schoolModel.getObjectIds(stcode11, dtcode11);
    
    if (!objectIds.length) return res.json({ success: false, message: "No Object IDs found.", count: 0 });

    const count = await apiService.syncSchoolsFromGIS(stcode11, dtcode11, objectIds);
    res.json({ success: true, message: "GIS Sync complete", count });
  } catch (err) { 
    res.status(500).json({ success: false, error: err.message }); 
  }
};
// ... other proxies
exports.searchSchool = async (req, res) => {
  const data = await apiService.fetchUdisePlusData("search-schools", { ...req.query });
  res.json(data);
};
// (Keep all other proxy exports from previous steps)
exports.getProfile = async (req, res) => {
  const { schoolId } = req.params;
  const data = await apiService.fetchUdisePlusData("school/profile", { schoolId, yearId: 11 });
  res.json(data);
};
exports.getFacilities = async (req, res) => {
  const { schoolId } = req.params;
  const data = await apiService.fetchUdisePlusData("school/facility", { schoolId, yearId: 11 });
  res.json(data);
};
exports.getSocialData = async (req, res) => {
  const { schoolId } = req.params;
  const data = await apiService.fetchUdisePlusData("getSocialData", { flag: req.query.flag || 1, schoolId, yearId: 11 });
  res.json(data);
};
exports.getStats = async (req, res) => {
  const { schoolId } = req.params;
  const data = await apiService.fetchUdisePlusData("school-statistics/enrolment-teacher", { schoolId });
  res.json(data);
};