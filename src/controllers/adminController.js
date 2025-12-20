const pool = require("../config/db");

exports.getMonitoringStats = async (req, res) => {
  try {
    // 1. High-Level Summary Metrics
    const summaryResult = await pool.query(`
      SELECT 
        (SELECT COUNT(*) FROM udise_data.users) as total_users,
        (SELECT COUNT(*) FROM udise_data.users WHERE last_login > NOW() - INTERVAL '24 hours') as active_today,
        (SELECT COUNT(*) FROM udise_data.download_logs) as total_downloads
    `);
    const summary = summaryResult.rows[0] || { total_users: 0, active_today: 0, total_downloads: 0 };

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
             MAX(l.downloaded_at) as last_download
      FROM udise_data.users u 
      LEFT JOIN udise_data.download_logs l ON u.user_id = l.user_id 
      GROUP BY u.user_id 
      ORDER BY download_count DESC 
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
      summary,
      trends: trends.rows || [],
      topUsers: topUsers.rows || [],
      recentLogs: recentLogs.rows || []
    });
  } catch (err) {
    console.error("Monitoring Error:", err);
    res.status(500).json({ error: "Failed to generate monitoring stats" });
  }
};