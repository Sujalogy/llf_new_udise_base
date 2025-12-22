const pool = require("../config/db");

exports.getMonitoringStats = async (req, res) => {
  try {
    // 1. High-Level Summary Metrics
    const summaryResult = await pool.query(`
      SELECT 
        (SELECT COUNT(*) FROM udise_data.users) as total_users,
        (SELECT COUNT(*) FROM udise_data.users WHERE last_login > NOW() - INTERVAL '24 hours') as active_today,
        (SELECT COUNT(*) FROM udise_data.download_logs) as total_downloads,
        -- [NEW] Data usage stats in MB
        (SELECT COALESCE(SUM(bytes_downloaded), 0) / (1024.0 * 1024.0) FROM udise_data.download_logs WHERE downloaded_at >= CURRENT_DATE) as daily_mb,
        (SELECT COALESCE(SUM(bytes_downloaded), 0) / (1024.0 * 1024.0) FROM udise_data.download_logs WHERE downloaded_at >= CURRENT_DATE - INTERVAL '7 days') as weekly_mb,
        (SELECT COALESCE(SUM(bytes_downloaded), 0) / (1024.0 * 1024.0) FROM udise_data.download_logs WHERE downloaded_at >= CURRENT_DATE - INTERVAL '30 days') as monthly_mb
    `);

    // 2. Download Velocity (Last 14 Days)
    const trends = await pool.query(`
      SELECT TO_CHAR(downloaded_at, 'DD Mon') as date, COUNT(*) as count 
      FROM udise_data.download_logs 
      WHERE downloaded_at > NOW() - INTERVAL '14 days'
      GROUP BY date, date_trunc('day', downloaded_at)
      ORDER BY date_trunc('day', downloaded_at)
    `);

    // 3. Power Users (Top 10)
    const topUsers = await pool.query(`
      SELECT u.name, u.email, u.role, 
             COUNT(l.log_id) as download_count,
             COALESCE(SUM(l.bytes_downloaded), 0) / (1024.0 * 1024.0) as total_mb,
             COALESCE(SUM(CASE WHEN l.downloaded_at >= CURRENT_DATE THEN l.bytes_downloaded ELSE 0 END), 0) / (1024.0 * 1024.0) as daily_mb,
             MAX(l.downloaded_at) as last_download
      FROM udise_data.users u 
      LEFT JOIN udise_data.download_logs l ON u.user_id = l.user_id 
      GROUP BY u.user_id, u.name, u.email, u.role
      ORDER BY total_mb DESC 
      LIMIT 10
    `);

    // 4. Audit Log (Recent Activity)
    const recentLogs = await pool.query(`
      SELECT u.name, l.format, l.downloaded_at, l.filters
      FROM udise_data.download_logs l
      JOIN udise_data.users u ON l.user_id = u.user_id
      ORDER BY l.downloaded_at DESC
      LIMIT 50
    `);

    res.json({
      summary: summaryResult.rows[0],
      trends: trends.rows || [],
      topUsers: topUsers.rows || [],
      recentLogs: recentLogs.rows || [],
    });
  } catch (err) {
    console.error("Monitoring Error:", err);
    res.status(500).json({ error: "Failed to generate monitoring stats" });
  }
};

exports.getUnsyncedLocations = async (req, res) => {
  try {
    // This query finds districts that exist in master but NOT in the schools table
    const result = await pool.query(`
      SELECT 
    d.stcode11, 
    d.stname AS stname, 
    d.dtcode11, 
    d.dtname AS dtname
FROM udise_data.district d
WHERE d.dtname NOT IN (
    SELECT DISTINCT district_name 
    FROM udise_data.school_udise_data 
    WHERE district_name IS NOT NULL
)
ORDER BY d.stname, d.dtname;
    `);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch unsynced locations" });
  }
};

exports.raiseDataRequest = async (req, res) => {
  const { stcode11, stname, dtcode11, dtnames } = req.body;
  const userId = req.user.userId;

  try {
    // Check for pending requests that overlap with requested districts
    const checkQuery = `
      SELECT r.*, u.name as requester_name 
      FROM udise_data.data_requests r
      JOIN udise_data.users u ON r.user_id = u.user_id
      WHERE r.stcode11 = $1 
        AND r.dtcode11 && $2::text[] 
        AND r.status = 'pending'
      LIMIT 1`;

    const duplicate = await pool.query(checkQuery, [stcode11, dtcode11]);

    if (duplicate.rows.length > 0) {
      const d = duplicate.rows[0];
      // This sends the specific name back to the frontend
      return res.status(409).json({
        error: "Duplicate Request",
        message: `${d.requester_name} has already raised a pending request for these districts in ${stname}.`,
      });
    }

    await pool.query(
      `INSERT INTO udise_data.data_requests 
       (user_id, stcode11, stname, dtcode11, dtnames, status) 
       VALUES ($1, $2, $3, $4, $5, 'pending')`,
      [userId, stcode11, stname, dtcode11, dtnames]
    );

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: "Internal Server Error" });
  }
};

exports.getPendingRequests = async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        r.request_id, 
        u.name as user_name, 
        r.stname, 
        r.dtnames, 
        r.created_at
      FROM udise_data.data_requests r
      JOIN udise_data.users u ON r.user_id = u.user_id
      WHERE r.status = 'pending'
      ORDER BY r.created_at DESC
    `);
    res.json(result.rows);
  } catch (err) {
    console.error("Error fetching pending requests:", err);
    res.status(500).json({ error: "Failed to fetch pending requests" });
  }
};

// 2. For Users: Notify users when their specific requests are resolved
exports.getUserNotifications = async (req, res) => {
  const userId = req.user.userId; // Extracted from your auth middleware
  try {
    const result = await pool.query(
      `
      SELECT 
        request_id, 
        stname, 
        dtnames, 
        resolved_at 
      FROM udise_data.data_requests 
      WHERE user_id = $1 
        AND status = 'resolved'
        AND resolved_at > NOW() - INTERVAL '7 days' -- Only show recent successes
      ORDER BY resolved_at DESC
    `,
      [userId]
    );
    res.json(result.rows);
  } catch (err) {
    console.error("Error fetching user notifications:", err);
    res.status(500).json({ error: "Failed to fetch notifications" });
  }
};

// [BONUS] Helper to resolve a ticket (Call this after a successful Admin Sync)
exports.resolveTicket = async (stcode11, dtcode11) => {
  try {
    await pool.query(
      `
      UPDATE udise_data.data_requests 
      SET status = 'resolved', resolved_at = NOW() 
      WHERE stcode11 = $1 AND dtcode11 <@ $2::text[] -- Checks if requested districts are subset of synced ones
    `,
      [stcode11, dtcode11]
    );
  } catch (err) {
    console.error("Failed to auto-resolve tickets:", err);
  }
};

exports.resolveTicketsAfterSync = async (stcode11, dtcode11) => {
  try {
    // We convert the single synced dtcode11 into an array to use the overlap operator
    const result = await pool.query(
      `
      UPDATE udise_data.data_requests 
      SET 
        status = 'resolved', 
        resolved_at = NOW() 
      WHERE 
        stcode11 = $1 
        AND dtcode11 && ARRAY[$2]::text[] 
        AND status = 'pending'
      RETURNING request_id, user_id;
    `,
      [stcode11, dtcode11]
    );
  } catch (err) {
    console.error("❌ Auto-resolve failed:", err);
  }
};

exports.getPaginatedLogs = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const offset = (page - 1) * limit;

    // Query 1: Get the paginated data
    const logsQuery = `
      SELECT u.name, l.format, l.downloaded_at, l.filters
      FROM udise_data.download_logs l
      JOIN udise_data.users u ON l.user_id = u.user_id
      ORDER BY l.downloaded_at DESC
      LIMIT $1 OFFSET $2
    `;

    // Query 2: Get total count for pagination UI
    const countQuery = `SELECT COUNT(*) FROM udise_data.download_logs`;

    const [logs, countResult] = await Promise.all([
      pool.query(logsQuery, [limit, offset]),
      pool.query(countQuery)
    ]);

    const totalLogs = parseInt(countResult.rows[0].count);
    const totalPages = Math.ceil(totalLogs / limit);

    res.json({
      logs: logs.rows,
      pagination: {
        totalLogs,
        totalPages,
        currentPage: page,
        limit
      }
    });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch logs" });
  }
};