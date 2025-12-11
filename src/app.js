const express = require("express");
const cors = require("cors");
const locationRoutes = require("./routes/locationRoutes");
const schoolRoutes = require("./routes/schoolRoutes");
const authRoutes = require("./routes/authRoutes");
const { getYears } = require("./controllers/locationController");

const app = express();

app.use(cors());
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