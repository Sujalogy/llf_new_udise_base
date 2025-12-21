const express = require('express');
const router = express.Router();
const aiController = require('../controllers/aiController');
const {authorizeAdmin, authenticate } = require('../middleware/authMiddleware');

router.post("/ask", authenticate, authorizeAdmin, aiController.askAssistant);

module.exports = router;