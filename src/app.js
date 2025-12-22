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

// ✅ CORS Configuration with explicit OPTIONS handling
const corsOptions = {
  origin: process.env.NODE_ENV === "production"
    ? ["https://school-directory.llf.org.in"] 
    : ["http://localhost:8080"],
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"], // ✅ Explicit methods
  allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With", "Accept"], // ✅ Explicit headers
  exposedHeaders: ["Set-Cookie"], // ✅ Allow frontend to see cookies
  maxAge: 86400, // ✅ Cache preflight for 24 hours
};

app.use(cors(corsOptions));

// ✅ Handle preflight requests explicitly
app.options("*", cors(corsOptions));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

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

  const isProduction = process.env.NODE_ENV === "production";
  res.status(500).json({
    error: "Internal server error",
    message: isProduction ? "Something went wrong" : err.message,
  });
});

module.exports = app;