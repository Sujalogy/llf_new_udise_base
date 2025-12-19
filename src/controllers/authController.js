// src/controllers/authController.js
const { OAuth2Client } = require("google-auth-library");
const jwt = require("jsonwebtoken");
const pool = require("../config/db");
const crypto = require("crypto");

const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

exports.googleLogin = async (req, res) => {
  try {
    const { credential } = req.body;
    const ticket = await googleClient.verifyIdToken({
      idToken: credential,
      audience: process.env.GOOGLE_CLIENT_ID,
    });

    const { email, name, picture, sub: googleId } = ticket.getPayload();
    const today = new Date().toISOString().split('T')[0];

    // Upsert User with status 'pending' if new
    const upsertQuery = `
      INSERT INTO udise_data.users (email, google_id, name, profile_picture, last_login, status, last_attempt_date, login_attempts)
      VALUES ($1, $2, $3, $4, NOW(), 'pending', $5, 1)
      ON CONFLICT (email) DO UPDATE SET 
        last_login = NOW(),
        login_attempts = CASE WHEN users.last_attempt_date = $5 THEN users.login_attempts + 1 ELSE 1 END,
        last_attempt_date = $5
      RETURNING *;
    `;
    const result = await pool.query(upsertQuery, [email, googleId, name, picture, today]);
    const user = result.rows[0];

    if (user.status === 'pending') {
      return res.status(403).json({ 
        error: "Waiting List", 
        message: "You are on the waiting list. Please contact Sujal for activation." 
      });
    }

    const sessionId = crypto.randomBytes(32).toString('hex');
    const token = jwt.sign(
      { userId: user.user_id, sessionId, role: user.role }, 
      process.env.JWT_SECRET, 
      { expiresIn: '24h' }
    );

    await pool.query(
      "UPDATE udise_data.users SET current_session_id = $1 WHERE user_id = $2", 
      [sessionId, user.user_id]
    );

    res.cookie("auth_token", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "Lax",
      maxAge: 24 * 60 * 60 * 1000,
    });

    res.json({ success: true, user: { id: user.user_id, email: user.email, name: user.name, role: user.role, picture } });
  } catch (error) {
    res.status(401).json({ error: "Authentication failed" });
  }
};

exports.getMe = async (req, res) => {
  const result = await pool.query(
    "SELECT user_id as id, email, name, role, profile_picture as picture FROM udise_data.users WHERE user_id = $1", 
    [req.user.userId]
  );
  res.json({ user: result.rows[0] });
};

exports.logout = async (req, res) => {
  await pool.query("UPDATE udise_data.users SET current_session_id = NULL WHERE user_id = $1", [req.user.userId]);
  res.clearCookie("auth_token");
  res.json({ success: true });
};