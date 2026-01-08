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


// 1. Upload & Sync External Files (Now tracks user_id)
router.post("/sync/external", schoolController.syncExternalDetails);

// 2. Get User's Accessible Vaults (Owned + Shared)
router.get("/external/vaults", exportController.getUserVaults);

// 3. Browse External Schools (Filtered by user access)
router.get("/external/list", exportController.getExternalUdiseList);

// 4. Get Batch Filters (Only user's accessible batches)
router.get("/external/batch-filters", exportController.getExternalBatchFilters);

// 5. Export External Data (Only if user has access)
router.get("/export/external", exportController.exportExternalDataFlattened);

// 6. Share Vault with Another User
router.post("/external/share", schoolController.shareVault);

// 7. Revoke Vault Sharing
router.delete("/external/share", schoolController.revokeVaultShare);

// 8. Get Vault Sharing Details
router.get("/external/shares/:titleHeader", schoolController.getVaultShares);

// 9. Get External Skipped Schools (User-specific)
router.get("/external/skipped", schoolController.getExternalSkippedSchools);

router.get("/global-search", schoolController.globalSearch);

module.exports = router;