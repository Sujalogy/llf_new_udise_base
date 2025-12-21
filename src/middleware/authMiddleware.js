// src/middleware/authMiddleware.js
const jwt = require("jsonwebtoken");
const pool = require("../config/db");

exports.authenticate = async (req, res, next) => {
  const token = req.cookies.auth_token;
  if (!token) return res.status(401).json({ error: "No session found" });

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const userRes = await pool.query(
      "SELECT current_session_id FROM udise_data.users WHERE user_id = $1",
      [decoded.userId]
    );

    const user = userRes.rows[0];
    if (!user || user.current_session_id !== decoded.sessionId) {
      res.clearCookie("auth_token");
      return res.status(401).json({ error: "Session expired." });
    }

    req.user = decoded;
    next();
  } catch (err) {
    res.clearCookie("auth_token");
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