// src/middleware/authMiddleware.js
const jwt = require("jsonwebtoken");
const pool = require("../config/db");

exports.authenticate = async (req, res, next) => {
  // Always check req.cookies (populated by cookie-parser)
  const token = req.cookies?.auth_token;

  if (!token) {
    console.log("❌ No auth_token cookie found in request headers");
    return res.status(401).json({ error: "No session found" });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    const userRes = await pool.query(
      "SELECT current_session_id, role FROM udise_data.users WHERE user_id = $1",
      [decoded.userId]
    );

    const user = userRes.rows[0];
    if (!user || user.current_session_id !== decoded.sessionId) {
      res.clearCookie("auth_token", { path: "/" }); // Ensure path matches
      return res.status(401).json({ error: "Session expired." });
    }

    req.user = decoded;
    next();
  } catch (err) {
    res.clearCookie("auth_token", { path: "/" });
    res.status(401).json({ error: "Invalid session" });
  }
};

exports.authorizeAdmin = (req, res, next) => {
  // Add a safety check to see if req.user exists
  if (!req.user || req.user.role !== "admin") {
    return res.status(403).json({ error: "Admin access required" });
  }
  next();
};