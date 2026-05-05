import "dotenv/config";
import express from "express";
import cors from "cors";
import compression from "compression";
import morgan from "morgan";
import districtsRouter from "./routes/districts.js";
import tehsilsRouter from "./routes/tehsils.js";
import villagesRouter from "./routes/villages.js";
import plotRouter from "./routes/plot.js";

const PORT = parseInt(process.env.PORT || "4000", 10);
// Comma-separated list of allowed origins. Defaults to common Next dev ports.
const CORS_ORIGIN =
  process.env.CORS_ORIGIN || "http://localhost:3000,http://localhost:3001";
const ALLOWED_ORIGINS = CORS_ORIGIN.split(",")
  .map((o) => o.trim())
  .filter(Boolean);

const app = express();
app.use(
  cors({
    origin(origin, cb) {
      // allow same-origin/no-origin (curl, healthchecks)
      if (!origin) return cb(null, true);
      if (ALLOWED_ORIGINS.includes("*")) return cb(null, true);
      if (ALLOWED_ORIGINS.includes(origin)) return cb(null, true);
      return cb(new Error(`CORS: origin ${origin} not allowed`), false);
    },
    credentials: false,
  })
);
app.use(compression());
app.use(express.json({ limit: "1mb" }));
app.use(morgan("dev"));

app.get("/health", (_req, res) => {
  res.json({ ok: true, service: "up-bhunaksha-portal-backend" });
});

app.use("/api/districts", districtsRouter);
app.use("/api/tehsils", tehsilsRouter);
app.use("/api/villages", villagesRouter);
app.use("/api/plot", plotRouter);

// Generic error handler
app.use((err, _req, res, _next) => {
  console.error("[error]", err.message);
  if (err.response) {
    console.error("       upstream status:", err.response.status);
    console.error("       upstream body  :", String(err.response.data).slice(0, 200));
  }
  const status = err.response?.status >= 400 && err.response?.status < 600
    ? 502
    : 500;
  res.status(status).json({
    error: "Upstream call failed",
    message: err.message,
    upstreamStatus: err.response?.status || null,
  });
});

app.listen(PORT, () => {
  console.log(`[backend] listening on http://localhost:${PORT}`);
  console.log(`[backend] CORS origins allowed: ${ALLOWED_ORIGINS.join(", ")}`);
});
