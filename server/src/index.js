import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import mongoose from "mongoose";
import examRoutes from "./routes/examRoutes.js";
import scanRoutes from "./routes/scanRoutes.js";

dotenv.config(); // Load .env from current directory (server/.env)
dotenv.config({ path: "../.env" }); // Also check parent directory (.env)

const app = express();
const PORT = process.env.PORT || 5000;
const MONGODB_URI = process.env.MONGODB_URI || "mongodb://localhost:27017/omr_evaluation_system";

// Middleware
app.use(cors());
app.use(express.json({ limit: "15mb" }));
app.use(express.urlencoded({ extended: true, limit: "15mb" }));

// Health check endpoint
app.get("/health", (req, res) => {
  res.status(200).json({
    status: "healthy",
    service: "omr-express-backend",
    version: "1.0.0",
    mongodb: mongoose.connection.readyState === 1 ? "connected" : "disconnected",
  });
});

// REST API routes
app.use("/api/exams", examRoutes);
app.use("/api/scans", scanRoutes);

// Centralized error handling middleware
app.use((err, req, res, next) => {
  console.error("[Backend Error]", err);

  const statusCode = err.statusCode || 500;
  res.status(statusCode).json({
    success: false,
    message: err.message || "Internal Server Error",
    ...(process.env.NODE_ENV === "development" && { stack: err.stack }),
  });
});

import { fileURLToPath } from "url";

// Connect to MongoDB & Start Server
export const startServer = async () => {
  try {
    try {
      await mongoose.connect(MONGODB_URI, { serverSelectionTimeoutMS: 2000 });
      console.log("Connected to MongoDB successfully at:", MONGODB_URI);
    } catch (dbErr) {
      console.warn("MongoDB connection warning: Running without persistent DB until MongoDB is started.", dbErr.message);
    }

    const serverInstance = app.listen(PORT, () => {
      console.log(`OMR Express Server running on http://localhost:${PORT}`);
    });
    return serverInstance;
  } catch (error) {
    console.error("Failed to start server:", error);
  }
};

// Check if run directly
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  startServer();
}

export default app;
