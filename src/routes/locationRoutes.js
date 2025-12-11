const express = require("express");
const router = express.Router();
const controller = require("../controllers/locationController");

// Master (Admin Sync)
router.get("/master/states", controller.getStates);
router.get("/master/districts/:stcode11", controller.getDistricts);

// Synced (Explorer)
router.get("/synced/states", controller.getSyncedStates);
router.get("/synced/districts/:stcode11", controller.getSyncedDistricts);

module.exports = router;