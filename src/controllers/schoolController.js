const schoolModel = require("../models/schoolModel");
const apiService = require("../services/apiService");

// 1. Get Local List
exports.getMySchools = async (req, res) => {
  try {
    const { stcode11, dtcode11 } = req.query;
    if (!stcode11 || !dtcode11) return res.status(400).json({ error: "State and District required" });
    const schools = await schoolModel.getLocalSchoolList(stcode11, dtcode11);
    res.json(schools);
  } catch (err) { res.status(500).json({ error: err.message }); }
};

// 2. Trigger Sync
exports.syncData = async (req, res) => {
  try {
    const { stcode11, dtcode11 } = req.body;
    const objectIds = await schoolModel.getObjectIds(stcode11, dtcode11);
    
    if (!objectIds.length) return res.json({ message: "No Object IDs found", count: 0 });

    const count = await apiService.syncSchoolsFromGIS(stcode11, dtcode11, objectIds);
    res.json({ message: "Sync complete", count });
  } catch (err) { res.status(500).json({ error: err.message }); }
};

// 3. Proxy endpoints
exports.searchSchool = async (req, res) => {
  const data = await apiService.fetchUdisePlusData("search-schools", { ...req.query });
  res.json(data);
};

exports.getProfile = async (req, res) => {
  const { schoolId, yearId } = req.params;
  const data = await apiService.fetchUdisePlusData("school/profile", { schoolId, yearId: yearId || 11 });
  res.json(data);
};

exports.getFacilities = async (req, res) => {
  const { schoolId, yearId } = req.params;
  const data = await apiService.fetchUdisePlusData("school/facility", { schoolId, yearId: yearId || 11 });
  res.json(data);
};

exports.getSocialData = async (req, res) => {
  const { schoolId, yearId, flag } = req.params;
  // Note: flag is passed in query or params depending on how you structured route
  const data = await apiService.fetchUdisePlusData("getSocialData", { flag: req.query.flag || 1, schoolId, yearId: yearId || 11 });
  res.json(data);
};

exports.getStats = async (req, res) => {
  const { schoolId } = req.params;
  const data = await apiService.fetchUdisePlusData("school-statistics/enrolment-teacher", { schoolId });
  res.json(data);
};