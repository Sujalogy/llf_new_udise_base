const express = require("express");
const router = express.Router();
const schoolController = require("../controllers/schoolController");
const exportController = require("../controllers/exportController");
const adminController = require("../controllers/adminController");
const { authenticate, authorizeAdmin } = require("../middleware/authMiddleware");

// --- 1. MIDDLEWARE: Protect all school routes ---
router.use(authenticate);

// --- 2. USER ROUTES (Everyone with an 'active' account) ---
router.get("/filters", schoolController.getFilters);
router.get("/list", schoolController.getMySchools);
router.get("/local-details/:schoolId", schoolController.getLocalSchoolDetails);
router.get("/skipped", schoolController.getSkippedList);
router.get("/skipped/summary", schoolController.getSkippedSummary);
router.get("/skipped/export", schoolController.exportSkippedList);
router.get("/export/list", exportController.downloadSchoolList);

router.post("/requests", schoolController.raiseDataRequest);
router.get("/requests/pending", schoolController.getPendingRequests);
router.get("/locations/unsynced", schoolController.getUnsyncedLocations);

// --- 3. admin ONLY ROUTES (Syncing & Dashboard Stats) ---
router.post("/sync-directory", authorizeAdmin, schoolController.syncDirectory); 
router.post("/sync/details", authorizeAdmin, schoolController.syncSchoolDetails);
router.get("/stats/dashboard", authorizeAdmin, schoolController.getDashboardStats);
router.get("/stats/matrix", authorizeAdmin, schoolController.getStateMatrix);

// --- 4. UDISE+ PROXY ROUTES ---
router.get("/search", schoolController.searchSchool);
router.get("/profile/:schoolId", schoolController.getProfile);


router.post("/sync/external", authorizeAdmin, schoolController.syncExternalDetails);
// 2. Browse: Get paginated list of schools in the External Vault
router.get("/external/list", authorizeAdmin, exportController.getExternalUdiseList);
// 3. Filters: Get unique Batch Titles (title_header) for dropdowns
router.get("/external/batch-filters", authorizeAdmin, exportController.getExternalBatchFilters);
// 4. Export: Download flattened CSV/JSON for a specific batch
router.get("/export/external", authorizeAdmin, exportController.exportExternalDataFlattened);

module.exports = router;