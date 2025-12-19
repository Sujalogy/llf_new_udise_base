const express = require("express");
const cors = require("cors");
const cookieParser = require("cookie-parser"); // [NEW] Required for secure cookies
const locationRoutes = require("./routes/locationRoutes");
const schoolRoutes = require("./routes/schoolRoutes");
const authRoutes = require("./routes/authRoutes");
const adminRoutes = require("./routes/adminRoutes"); // [NEW] Added admin routes
const { getYears } = require("./controllers/locationController");

const app = express();

// Required for secure cookies behind proxies (like Render/Heroku)
app.set("trust proxy", 1);

const allowedOrigins = [
  "https://school-directory.llf.org.in",
  "http://localhost:5173",
  "http://localhost:8080",
];

app.use(
  cors({
    origin(origin, callback) {
      if (!origin) return callback(null, true);
      if (allowedOrigins.includes(origin)) return callback(null, true);
      callback(new Error("Not allowed by CORS"));
    },
    credentials: true,
  })
);

app.options("*", cors());

app.use(cookieParser()); // [NEW] Parse cookies before routes
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true }));

// Routes
app.use("/api/auth", authRoutes); // Auth first
app.use("/api/locations", locationRoutes);
app.use("/api/schools", schoolRoutes);
app.use("/api/admin", adminRoutes); // [NEW] Secure Admin Management

// Metadata Routes
app.get("/api/years", getYears);

// 404
app.use((req, res) => res.status(404).json({ message: "Route not found" }));

module.exports = app;