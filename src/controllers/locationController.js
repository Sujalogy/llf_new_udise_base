const locationModel = require("../models/locationModel");
const apiService = require("../services/apiService");

// Master Lists
exports.getStates = async (req, res) => {
  try { const data = await locationModel.getAllStates(); res.json(data); } 
  catch (e) { res.status(500).json({ error: e.message }); }
};

exports.getDistricts = async (req, res) => {
  try { const data = await locationModel.getDistrictsByState(req.params.stcode11); res.json(data); } 
  catch (e) { res.status(500).json({ error: e.message }); }
};

// Synced Lists
exports.getSyncedStates = async (req, res) => {
  try { 
    // [NEW] Accept yearId to filter states that have data for that year
    const { yearId } = req.query;
    let yearDesc = null;
    if (yearId) {
        const years = await apiService.fetchYears();
        const match = years.find((y) => String(y.yearId) === String(yearId));
        if (match) yearDesc = match.yearDesc;
    }

    const data = await locationModel.getSyncedStates(yearDesc); 
    res.json(data); 
  } 
  catch (e) { res.status(500).json({ error: e.message }); }
};

exports.getSyncedDistricts = async (req, res) => {
  try { 
    // [NEW] Accept yearId
    const { yearId } = req.query;
    let yearDesc = null;
    if (yearId) {
        const years = await apiService.fetchYears();
        const match = years.find((y) => String(y.yearId) === String(yearId));
        if (match) yearDesc = match.yearDesc;
    }

    const data = await locationModel.getSyncedDistricts(req.params.stcode11, yearDesc); 
    res.json(data); 
  } 
  catch (e) { res.status(500).json({ error: e.message }); }
};

// Years
exports.getYears = async (req, res) => {
  try {
    const data = await apiService.fetchYears();
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};