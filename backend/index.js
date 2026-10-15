import "dotenv/config";
import cors from "cors";
import express from "express";
import { createServer } from "node:http";
import mongoose from "mongoose";
import { connectDatabase } from "./config/database.js";
import apiRouter from "./routes/api.js";
import { seedDatabase } from "./seed.js";

const app = express();
const port = Number(process.env.PORT) || 5000;
const server = createServer(app);
const clientOrigin = process.env.CLIENT_ORIGIN || "http://localhost:5173";

app.use(
  cors({
    origin(origin, callback) {
      if (!origin || origin === clientOrigin) return callback(null, true);
      if (/^http:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?$/.test(origin)) return callback(null, true);
      callback(new Error("Origin is not allowed by CORS."));
    },
  }),
);
app.use(express.json({ limit: "30kb" }));
app.use("/api", apiRouter);

app.use((error, req, res, next) => {
  if (res.headersSent) return next(error);
  if (error.code === 11000) {
    return res.status(409).json({ error: "A record with that unique value already exists." });
  }
  if (error.name === "ValidationError" || error.name === "CastError") {
    return res.status(400).json({ error: error.message });
  }
  const isClientError = Number.isInteger(error.status) && error.status >= 400 && error.status < 500;
  if (!isClientError) console.error(error);
  res.status(error.status || 500).json({
    error: error.status ? error.message : "An unexpected server error occurred.",
  });
});

try {
  if (process.env.NODE_ENV === "production" && (!process.env.AUTH_TOKEN_SECRET || process.env.AUTH_TOKEN_SECRET.length < 32)) {
    throw new Error("Set AUTH_TOKEN_SECRET to a random value of at least 32 characters before production startup.");
  }
  await connectDatabase();
  await seedDatabase();
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, resolve);
  });
  console.log(`Alpha Male API listening on http://localhost:${port}`);
} catch (error) {
  if (error.code === "EADDRINUSE") {
    console.error(
      `Could not start the API: port ${port} is already in use. Stop the other API process, or set PORT to a free port in .env. The frontend proxy uses PORT automatically.`,
    );
  } else if (error.code === "EACCES") {
    console.error(`Could not listen on port ${port}. Choose another available port in .env.`);
  } else {
    console.error("Could not start the API. Check that MongoDB is running and MONGODB_URI is correct.", error);
  }
  await mongoose.disconnect();
  process.exitCode = 1;
}
