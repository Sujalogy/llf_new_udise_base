const express = require("express");
const router = express.Router();
const authController = require("../controllers/authController");
const { authenticate } = require("../middleware/authMiddleware");

// This defines the endpoint: POST /api/auth/google
router.post("/google", authController.googleLogin);
router.get("/me", authenticate, authController.getMe);
router.post("/logout", authenticate, authController.logout);
module.exports = router;