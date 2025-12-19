const express = require("express");
const router = express.Router();
const pool = require("../config/db");
const {
  authenticate,
  authorizeAdmin,
} = require("../middleware/authMiddleware");

router.use(authenticate, authorizeAdmin);

router.get("/users", async (req, res) => {
  const result = await pool.query(
    "SELECT user_id, email, name, status, role FROM udise_data.users ORDER BY last_login DESC"
  );
  res.json(result.rows);
});

router.post("/users/status", async (req, res) => {
  const { userId, status } = req.body;
  await pool.query(
    "UPDATE udise_data.users SET status = $1 WHERE user_id = $2",
    [status, userId]
  );
  res.json({ success: true });
});

module.exports = router;
