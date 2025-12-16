const express = require("express");
const router = express.Router();
const schoolController = require("../controllers/schoolController");
const exportController = require("../controllers/exportController");

// --- 1. LOCAL DB ROUTES ---
router.get("/filters", schoolController.getFilters); // [NEW]
router.get("/list", schoolController.getMySchools);
router.post("/sync", schoolController.syncData); // Level 1.5 (GIS Coords)
router.post("/sync-directory", schoolController.syncDirectory); // Level 1 (Master List)
router.post("/sync-details", schoolController.syncSchoolDetails); // Level 2 (Full Details - NEW)
router.get("/export/list", exportController.downloadSchoolList);
router.get("/local-details/:schoolId", schoolController.getLocalSchoolDetails);
router.get("/skipped", schoolController.getSkippedList); // [NEW]
router.get("/skipped/summary", schoolController.getSkippedSummary); // [NEW] Summary Grouped Stats
router.get("/skipped/export", schoolController.exportSkippedList);  // [NEW] Download CSV/JSON
router.post("/sync/details", schoolController.syncSchoolDetails);
router.get("/stats/dashboard", schoolController.getDashboardStats);
router.get("/stats/matrix", schoolController.getStateMatrix);

// --- 2. UDISE+ PROXY ROUTES ---
router.get("/search", schoolController.searchSchool);
router.get("/profile/:schoolId", schoolController.getProfile);
// ... other existing proxy routes

module.exports = router;