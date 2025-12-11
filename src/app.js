const express = require("express");
const cors = require("cors");
const locationRoutes = require("./routes/locationRoutes");
const schoolRoutes = require("./routes/schoolRoutes");
const authRoutes = require("./routes/authRoutes");

const app = express();

app.use(cors());
app.use(express.json());

// Routes
app.use("/api/locations", locationRoutes);
app.use("/api/schools", schoolRoutes);
app.use("/api/auth", authRoutes);

// Metadata Routes (Mocked as requested)
app.get("/api/years", (req, res) => res.json([
  { yearId: 11, year: "2024-25" },
  { yearId: 10, year: "2023-24" }
]));

app.get("/api/categories", (req, res) => res.json([
  { catId: 1, category: "Primary" }, 
  { catId: 2, category: "Upper Primary" }
]));

// 404
app.use((req, res) => res.status(404).json({ message: "Route not found" }));

module.exports = app;