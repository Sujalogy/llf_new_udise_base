const locationModel = require("../models/locationModel");

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
  try { const data = await locationModel.getSyncedStates(); res.json(data); } 
  catch (e) { res.status(500).json({ error: e.message }); }
};

exports.getSyncedDistricts = async (req, res) => {
  try { const data = await locationModel.getSyncedDistricts(req.params.stcode11); res.json(data); } 
  catch (e) { res.status(500).json({ error: e.message }); }
};