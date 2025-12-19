require("dotenv").config();
const app = require("./src/app");
const pool = require("./src/config/db");

const PORT = process.env.PORT || 3000;

// Test database connection before starting server
pool.connect((err, client, release) => {
  if (err) {
    console.error("❌ Database connection failed:", err.message);
    process.exit(1);
  } else {
    console.log("✅ Database connected successfully");
    release();
    app.listen(PORT, () => {
      console.log(`✅ Server running on http://localhost:${PORT}`);
      console.log(`✅ Environment: ${process.env.NODE_ENV || 'development'}`);
    });
  }
});

// Handle graceful shutdown for clean pool termination
process.on("SIGTERM", () => {
  console.log("SIGTERM received. Closing pool...");
  pool.end(() => {
    console.log("Database pool closed.");
    process.exit(0);
  });
});

process.on("SIGINT", () => {
  pool.end(() => {
    console.log("SIGINT received. Pool closed.");
    process.exit(0);
  });
});