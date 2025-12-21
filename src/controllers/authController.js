// src/controllers/authController.js
const { OAuth2Client } = require("google-auth-library");
const jwt = require("jsonwebtoken");
const pool = require("../config/db");
const crypto = require("crypto");

const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

// Helper function for cookie options
const getCookieOptions = () => {
  const isProduction = process.env.NODE_ENV === "production";
  
  return {
    httpOnly: true,
    secure: isProduction, // HTTPS required in production
    sameSite: isProduction ? "none" : "lax", // "none" for cross-domain
    maxAge: 24 * 60 * 60 * 1000, // 24 hours
    domain: isProduction ? ".llf.org.in" : undefined, // Share across subdomains
    path: "/",
  };
};

exports.googleLogin = async (req, res) => {
  try {
    console.log("🔐 Google login attempt");
    const { credential } = req.body;
    
    const ticket = await googleClient.verifyIdToken({
      idToken: credential,
      audience: process.env.GOOGLE_CLIENT_ID,
    });

    const { email, name, picture, sub: googleId } = ticket.getPayload();
    console.log("✅ Google token verified for:", email);

    if (!email.endsWith("@languageandlearningfoundation.org")) {
      console.log("❌ Unauthorized domain:", email);
      return res.status(403).json({
        error: "Unauthorized Domain",
        message: "Access is restricted to @languageandlearningfoundation.org emails.",
      });
    }
    
    const today = new Date().toISOString().split("T")[0];

    const upsertQuery = `
      INSERT INTO udise_data.users (email, google_id, name, profile_picture, last_login, status, last_attempt_date, login_attempts)
      VALUES ($1, $2, $3, $4, NOW(), 'pending', $5, 1)
      ON CONFLICT (email) DO UPDATE SET 
        last_login = NOW(),
        login_attempts = CASE WHEN users.last_attempt_date = $5 THEN users.login_attempts + 1 ELSE 1 END,
        last_attempt_date = $5
      RETURNING *;
    `;
    
    const result = await pool.query(upsertQuery, [
      email,
      googleId,
      name,
      picture,
      today,
    ]);
    const user = result.rows[0];

    if (user.status === "pending") {
      console.log("⏳ User on waiting list:", email);
      return res.status(403).json({
        error: "Waiting List",
        message: "You are on the waiting list. Please contact Sujal for activation.",
      });
    }

    const sessionId = crypto.randomBytes(32).toString("hex");
    const token = jwt.sign(
      { userId: user.user_id, sessionId, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: "24h" }
    );

    await pool.query(
      "UPDATE udise_data.users SET current_session_id = $1, last_login = NOW() WHERE user_id = $2",
      [sessionId, user.user_id]
    );

    // Set cookie with cross-domain support
    const cookieOptions = getCookieOptions();
    console.log("🍪 Setting cookie with options:", cookieOptions);
    res.cookie("auth_token", token, cookieOptions);

    console.log("✅ Login successful for:", email);
    res.json({
      success: true,
      user: {
        id: user.user_id,
        email: user.email,
        name: user.name,
        role: user.role,
        picture,
      },
    });
  } catch (error) {
    console.error("❌ Google login error:", error);
    res.status(401).json({ 
      error: "Authentication failed",
      message: error.message 
    });
  }
};

exports.getMe = async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT user_id as id, email, name, role, profile_picture as picture FROM udise_data.users WHERE user_id = $1",
      [req.user.userId]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: "User not found" });
    }
    
    res.json({ user: result.rows[0] });
  } catch (error) {
    console.error("❌ Get user error:", error);
    res.status(500).json({ error: "Failed to fetch user data" });
  }
};

exports.logout = async (req, res) => {
  try {
    await pool.query(
      "UPDATE udise_data.users SET current_session_id = NULL WHERE user_id = $1",
      [req.user.userId]
    );
    
    const isProduction = process.env.NODE_ENV === "production";
    
    res.clearCookie("auth_token", {
      httpOnly: true,
      secure: isProduction,
      sameSite: isProduction ? "none" : "lax",
      domain: isProduction ? ".llf.org.in" : undefined,
      path: "/",
    });
    
    console.log("✅ Logout successful");
    res.json({ success: true, message: "Logged out successfully" });
  } catch (error) {
    console.error("❌ Logout error:", error);
    res.status(500).json({ error: "Logout failed" });
  }
};