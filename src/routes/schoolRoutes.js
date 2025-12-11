const express = require("express");
const router = express.Router();
const schoolController = require("../controllers/schoolController");
const exportController = require("../controllers/exportController");

// --- 1. LOCAL DB ROUTES ---
router.get("/list", schoolController.getMySchools);
router.post("/sync", schoolController.syncData);
router.get("/export/list", exportController.downloadSchoolList);

// --- 2. UDISE+ PROXY ROUTES ---
router.get("/search", schoolController.searchSchool);
router.get("/profile/:schoolId", schoolController.getProfile);
router.get("/facility/:schoolId", schoolController.getFacilities);
router.get("/social-data/:schoolId", schoolController.getSocialData);
router.get("/stats/:schoolId", schoolController.getStats);

module.exports = router;