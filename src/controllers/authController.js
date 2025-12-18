const { v4: uuidv4 } = require("uuid");
const pool = require("../config/db");
const { OAuth2Client } = require("google-auth-library");

const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

exports.googleLogin = async (req, res) => {
  try {
    const { credential } = req.body;

    if (!credential) {
      return res.status(400).json({ error: "Missing Google credential" });
    }

    /* ================= VERIFY GOOGLE TOKEN ================= */

    const ticket = await googleClient.verifyIdToken({
      idToken: credential,
      audience: process.env.GOOGLE_CLIENT_ID,
    });

    const payload = ticket.getPayload();
    const { email, name, picture, sub: googleId, hd } = payload;

    /* ================= DOMAIN RESTRICTION ================= */

    const ALLOWED_DOMAIN = process.env.ALLOWED_DOMAIN;
    if (ALLOWED_DOMAIN && hd !== ALLOWED_DOMAIN) {
      return res.status(403).json({ error: "Domain not allowed" });
    }

    /* ================= UPSERT USER ================= */

    const userQuery = `
      INSERT INTO udise_data.users
        (email, google_id, name, profile_picture, last_login, status)
      VALUES ($1, $2, $3, $4, NOW(), 'active')
      ON CONFLICT (email)
      DO UPDATE SET
        name = EXCLUDED.name,
        profile_picture = EXCLUDED.profile_picture,
        google_id = EXCLUDED.google_id,
        last_login = NOW()
      RETURNING user_id, email, name, role;
    `;

    const userResult = await pool.query(userQuery, [
      email,
      googleId,
      name,
      picture,
    ]);

    const user = userResult.rows[0];

    /* ================= SESSION TOKEN ================= */

    const token = uuidv4();
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

    // Optional: invalidate old tokens
    await pool.query(
      `DELETE FROM udise_data.auth_tokens WHERE user_id = $1`,
      [user.user_id]
    );

    await pool.query(
      `
      INSERT INTO udise_data.auth_tokens (user_id, token, expires_at)
      VALUES ($1, $2, $3)
    `,
      [user.user_id, token, expiresAt]
    );

    /* ================= SET COOKIE (RECOMMENDED) ================= */

    res.cookie("auth_token", token, {
      httpOnly: true,
      secure: true,
      sameSite: "None",
      maxAge: 24 * 60 * 60 * 1000,
    });

    /* ================= RESPONSE ================= */

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
    console.error("Google Login Error:", error);
    res.status(401).json({ error: "Authentication failed" });
  }
};
