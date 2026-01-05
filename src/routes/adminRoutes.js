const express = require("express");
const router = express.Router();
const pool = require("../config/db");
const {
  authenticate,
  authorizeAdmin,
} = require("../middleware/authMiddleware");
const controller = require("../controllers/adminController");

router.use(authenticate, authorizeAdmin);

router.get("/users", async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT 
        user_id, email, name, status, role, 
        assigned_states, assigned_districts, assigned_blocks,
        (current_session_id IS NOT NULL) as is_logged_in, login_attempts, profile_picture
      FROM udise_data.users 
      ORDER BY last_login DESC`
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch users" });
  }
});

router.post("/users/status", async (req, res) => {
  const { userId, status } = req.body;
  await pool.query(
    "UPDATE udise_data.users SET status = $1 WHERE user_id = $2",
    [status, userId]
  );
  res.json({ success: true });
});

// src/routes/adminRoutes.js
router.put("/users/:id", async (req, res) => {
  const {
    name,
    role,
    status,
    assigned_states,
    assigned_state_names,
    assigned_districts,
    assigned_district_names,
  } = req.body;
  const userId = req.params.id; // Corrected from body

  try {
    await pool.query(
      `UPDATE udise_data.users 
       SET name = $1, role = $2, status = $3, 
           assigned_states = $4, assigned_state_names = $5, 
           assigned_districts = $6, assigned_district_names = $7 
       WHERE user_id = $8`,
      [
        name,
        role,
        status,
        assigned_states || [],
        assigned_state_names || [],
        assigned_districts || [],
        assigned_district_names || [],
        userId,
      ]
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: "Update failed" });
  }
});

router.get(
  "/monitoring",
  authenticate,
  authorizeAdmin,
  controller.getMonitoringStats
);
router.get("/requests/user-notifications", controller.getUserNotifications);
router.get(
  "/monitoring/logs",
  authenticate,
  authorizeAdmin,
  controller.getPaginatedLogs //
);
module.exports = router;
