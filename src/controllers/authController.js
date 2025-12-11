const { OAuth2Client } = require('google-auth-library');
const { v4: uuidv4 } = require('uuid');
const pool = require('../config/db'); // Your existing DB connection

const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

exports.googleLogin = async (req, res) => {
  const { credential } = req.body; // The JWT from frontend

  try {
    // 1. Verify Google Token
    const ticket = await client.verifyIdToken({
      idToken: credential,
      audience: process.env.GOOGLE_CLIENT_ID,
    });
    const payload = ticket.getPayload();
    const { email, name, picture, sub: googleId } = payload;

    // 2. Domain Restriction Check (Backend side)
    const ALLOWED_DOMAIN = process.env.ALLOWED_DOMAIN; // e.g., "school.org"
    if (!email.endsWith(`@${ALLOWED_DOMAIN}`)) {
      return res.status(403).json({ error: "Domain not allowed" });
    }

    // 3. Upsert User (Insert if new, Update if exists)
    // We use ON CONFLICT to handle existing users
    const userQuery = `
      INSERT INTO udise_data.users (email, google_id, name, profile_picture, last_login, status, role)
      VALUES ($1, $2, $3, $4, NOW(), 'active', 'user')
      ON CONFLICT (email) 
      DO UPDATE SET 
        name = EXCLUDED.name, 
        profile_picture = EXCLUDED.profile_picture,
        last_login = NOW(),
        google_id = EXCLUDED.google_id
      RETURNING user_id, role, name, email;
    `;
    
    const userResult = await pool.query(userQuery, [email, googleId, name, picture]);
    const user = userResult.rows[0];

    // 4. Generate Session Token (Using your auth_tokens table)
    const sessionToken = uuidv4(); // Generate a random secure token
    const expiryDate = new Date();
    expiryDate.setDate(expiryDate.getDate() + 7); // Expires in 7 days

    const tokenQuery = `
      INSERT INTO udise_data.auth_tokens (user_id, token, expires_at)
      VALUES ($1, $2, $3)
    `;
    await pool.query(tokenQuery, [user.user_id, sessionToken, expiryDate]);

    // 5. Send response
    // Ideally, set token as HttpOnly cookie, but returning JSON for simplicity here
    res.json({
      success: true,
      token: sessionToken,
      user: {
        id: user.user_id,
        email: user.email,
        name: user.name,
        role: user.role,
        picture: picture
      }
    });

  } catch (error) {
    console.error("Auth Error:", error);
    res.status(401).json({ error: "Authentication failed" });
  }
};