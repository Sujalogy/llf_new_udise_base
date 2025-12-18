const express = require("express");
const cors = require("cors");
const locationRoutes = require("./routes/locationRoutes");
const schoolRoutes = require("./routes/schoolRoutes");
const authRoutes = require("./routes/authRoutes");
const { getYears } = require("./controllers/locationController");

const app = express();

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

app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true }));

// Routes
app.use("/api/locations", locationRoutes);
app.use("/api/schools", schoolRoutes);
app.use("/api/auth", authRoutes);

// Metadata Routes
app.get("/api/years", getYears);

// 404
app.use((req, res) => res.status(404).json({ message: "Route not found" }));

module.exports = app;