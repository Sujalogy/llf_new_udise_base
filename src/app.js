const express = require("express");
const cors = require("cors");
const cookieParser = require("cookie-parser");
const locationRoutes = require("./routes/locationRoutes");
const schoolRoutes = require("./routes/schoolRoutes");
const authRoutes = require("./routes/authRoutes");
const adminRoutes = require("./routes/adminRoutes");
const aiRoutes = require("./routes/aiRoutes");
const { getYears } = require("./controllers/locationController");

const app = express();
// CRITICAL: Trust proxy for production
app.set("trust proxy", 1);

app.use(cookieParser());

app.use(
  cors({
    origin: true,
    credentials: true,
    // exposedHeaders: ["Set-Cookie"],
    optionsSuccessStatus: 204,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: [
      "Content-Type",
      "Authorization",
      "X-Requested-With",
      "Accept",
    ],
  })
);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use((req, res, next) => {
  console.log(`🔍 [${req.method}] ${req.path} | Cookies:`, req.cookies);
  next();
});

// Routes
app.use("/api/auth", authRoutes);
app.use("/api/locations", locationRoutes);
app.use("/api/schools", schoolRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/ai", aiRoutes);

// Metadata Routes
app.get("/api/years", getYears);

// Health check
app.get("/api/health", (req, res) => {
  res.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || "development",
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ message: "Route not found", path: req.path });
});

// Error handler
app.use((err, req, res, next) => {
  console.error("❌ Error:", err.message);

  if (err.message.includes("CORS")) {
    return res.status(403).json({
      error: "CORS Error",
      message: "Your origin is not allowed to access this resource",
    });
  }

  res.status(500).json({
    error: "Internal server error",
    message: isProduction ? "Something went wrong" : err.message,
  });
});

module.exports = app;
