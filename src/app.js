const express = require("express");
const cors = require("cors");
const locationRoutes = require("./routes/locationRoutes");
const schoolRoutes = require("./routes/schoolRoutes");
const authRoutes = require("./routes/authRoutes");
const { getYears } = require("./controllers/locationController");

const app = express();

const allowedOrigins = [
  "https://school-directory.llf.org.in",
  "http://localhost:8080"
];

app.use(
  cors({
    origin: function (origin, callback) {
      // allow server-to-server & tools like Postman
      if (!origin) return callback(null, true);

      if (allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error("Not allowed by CORS"));
      }
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

app.use(express.json());

// Routes
app.use("/api/locations", locationRoutes);
app.use("/api/schools", schoolRoutes);
app.use("/api/auth", authRoutes);

// Metadata Routes
app.get("/api/years", getYears);

// 404
app.use((req, res) => res.status(404).json({ message: "Route not found" }));

module.exports = app;