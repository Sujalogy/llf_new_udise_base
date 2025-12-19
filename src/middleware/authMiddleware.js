const jwt = require("jsonwebtoken");
const pool = require("../config/db");

exports.authenticate = async (req, res, next) => {
  const token = req.cookies.auth_token;
  if (!token) return res.status(401).json({ error: "No session found" }); // Generic message

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const userRes = await pool.query(
      "SELECT current_session_id, status FROM udise_data.users WHERE user_id = $1",
      [decoded.userId]
    );

    const user = userRes.rows[0];
    if (!user || user.current_session_id !== decoded.sessionId) {
      // Clear the cookie because it's invalid
      res.clearCookie("auth_token");
      return res
        .status(401)
        .json({ error: "Session expired or logged in elsewhere." });
    }

    req.user = decoded;
    next();
  } catch (err) {
    res.clearCookie("auth_token");
    res.status(401).json({ error: "Invalid session" });
  }
};

exports.authorizeAdmin = (req, res, next) => {
  if (req.user.role !== "admin") {
    return res.status(403).json({ error: "Admin access required" });
  }
  next();
};
