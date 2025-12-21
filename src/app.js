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

// CRITICAL: Trust proxy FIRST, before any middleware
app.set("trust proxy", 1);

const allowedOrigins = [
  "https://school-directory.llf.org.in",
  "http://localhost:5173",
  "http://localhost:8080",
];

// Enhanced CORS configuration
const corsOptions = {
  origin: function (origin, callback) {
    // Allow requests with no origin (mobile apps, Postman, etc.)
    if (!origin) return callback(null, true);
    
    if (allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],
  allowedHeaders: [
    "Content-Type", 
    "Authorization", 
    "X-Requested-With",
    "Accept",
    "Origin"
  ],
  exposedHeaders: ["Set-Cookie"],
  maxAge: 86400, // 24 hours
  preflightContinue: false,
  optionsSuccessStatus: 204
};

// Apply CORS before other middleware
app.use(cors(corsOptions));

// Cookie parser
app.use(cookieParser());

// Body parsers
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true }));

// Additional headers middleware (for extra safety)
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (allowedOrigins.includes(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
  }
  res.setHeader("Access-Control-Allow-Credentials", "true");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS,PATCH");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type,Authorization,X-Requested-With,Accept,Origin");
  
  // Handle preflight
  if (req.method === "OPTIONS") {
    return res.sendStatus(204);
  }
  next();
});

// Routes (auth routes should handle Google OAuth)
app.use("/api/auth", authRoutes);
app.use("/api/locations", locationRoutes);
app.use("/api/schools", schoolRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/ai", aiRoutes);

// Metadata Routes
app.get("/api/years", getYears);

// Health check
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ message: "Route not found" });
});

// Error handler
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ 
    message: err.message || "Internal server error",
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
});

module.exports = app;