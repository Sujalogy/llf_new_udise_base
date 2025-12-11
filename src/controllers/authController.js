const { v4: uuidv4 } = require('uuid');
const pool = require('../config/db'); 

exports.googleLogin = async (req, res) => {
  // 1. Receive User Data directly (Trusting Frontend Authentication)
  const { email, name, picture, googleId } = req.body;

  // 2. LOG IT: Log the login attempt
  console.log(`[LOGIN EVENT] User: ${email} logged in at ${new Date().toISOString()}`);

  if (!email || !googleId) {
    return res.status(400).json({ error: "Missing required user data" });
  }

  try {
    // 3. Domain Restriction Check (Optional)
    const ALLOWED_DOMAIN = process.env.ALLOWED_DOMAIN || "languageandlearningfoundation.org"; 
    // Uncomment below to enforce domain check on backend
    // if (!email.endsWith(`@${ALLOWED_DOMAIN}`)) {
    //   console.warn(`[LOGIN BLOCKED] Unauthorized domain: ${email}`);
    //   return res.status(403).json({ error: "Domain not allowed" });
    // }

    // 4. Upsert User (Insert if new, Update if exists)
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

    // 5. Generate Session Token (Valid for 1 Day)
    const sessionToken = uuidv4(); 
    const expiryDate = new Date();
    expiryDate.setDate(expiryDate.getDate() + 1); // Set to 1 Day from now

    const tokenQuery = `
      INSERT INTO udise_data.auth_tokens (user_id, token, expires_at)
      VALUES ($1, $2, $3)
    `;
    await pool.query(tokenQuery, [user.user_id, sessionToken, expiryDate]);

    console.log(`[SESSION CREATED] Token generated for user ID: ${user.user_id}`);

    // 6. Send response
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
    console.error("Database/Auth Error:", error);
    res.status(500).json({ error: "Internal Server Error during login" });
  }
};