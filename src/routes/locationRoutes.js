const express = require("express");
const router = express.Router();
const controller = require("../controllers/locationController");
// [FIX]: Added these imports so they aren't undefined when used in router.get
const { authenticate, authorizeAdmin } = require("../middleware/authMiddleware");

// Apply authentication to all location routes
router.use(authenticate);

// Master (Admin Sync only) - Super Admin Restricted
router.get("/master/states", authorizeAdmin, controller.getStates);
router.get("/master/districts/:stcode11", authorizeAdmin, controller.getDistricts);

// Synced (Explorer) - Available to all active users
router.get("/synced/states", controller.getSyncedStates);
router.get("/synced/districts/:stcode11", controller.getSyncedDistricts);

module.exports = router;