const pool = require('../config/db'); // Assuming you use pg

const trafficTracker = async (req, res, next) => {
  // We only track data for authenticated users
  const userId = req.user?.id;
  if (!userId) return next();

  // Listen for the response to finish
  res.on('finish', async () => {
    try {
      // Get content length from headers or fallback to bytes written
      const bytes = parseInt(res.getHeader('content-length') || res.socket.bytesWritten || 0);
      
      if (bytes > 0) {
        await pool.query(
          'INSERT INTO user_traffic_logs (user_id, bytes_downloaded, endpoint) VALUES ($1, $2, $3)',
          [userId, bytes, req.originalUrl]
        );
      }
    } catch (err) {
      console.error('Traffic tracking error:', err);
    }
  });

  next();
};

module.exports = trafficTracker;