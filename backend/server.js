require("dotenv").config();
const express = require("express");
const cors = require("cors");

const { router: authRouter } = require("./routes/auth");
const ordersRouter = require("./routes/orders");
const profileRouter = require("./routes/profile");
const paymentRouter = require("./routes/payment");
const servicesRouter = require("./routes/services");
const operatorRouter = require("./routes/operator");
const { AVATAR_DIR } = require("./routes/profile");
const path = require("path");

const app = express();
app.disable("x-powered-by");
app.set("trust proxy", 1); // di balik proxy (Vercel/Nginx) agar req.ip benar untuk pembatas login & log

// Saat pengembangan, Live Server bisa memakai localhost atau 127.0.0.1
// dengan port yang berubah-ubah. Di produksi, gunakan FRONTEND_URL yang eksplisit.
const isDevelopment = process.env.NODE_ENV !== "production";
const allowedOrigins = String(process.env.FRONTEND_URL || "")
  .split(",").map((value) => value.trim()).filter(Boolean);
app.use(cors({
  origin(origin, callback) {
    // Requests without an Origin header (health checks/server-to-server) are allowed.
    if (!origin) return callback(null, true);
    // If FRONTEND_URL is configured, enforce the explicit allow-list.
    if (allowedOrigins.length) {
      if (allowedOrigins.includes(origin)) return callback(null, true);
      if (isDevelopment) {
        try {
          const url = new URL(origin);
          if (["localhost", "127.0.0.1", "::1"].includes(url.hostname)) return callback(null, true);
        } catch (_) { /* origin bukan URL valid */ }
      }
      return callback(new Error("Origin tidak diizinkan oleh kebijakan CORS."));
    }
    // No FRONTEND_URL configured: reflect the requesting origin. API access is still
    // protected by bearer-token authentication; configure FRONTEND_URL for a strict allow-list.
    return callback(null, true);
  },
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
  credentials: true,
  maxAge: 86400
}));
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true, limit: "1mb" }));

app.get("/api/health", (req, res) => res.json({ status: "ok", service: "nusaeast-backend" }));
app.use("/api/auth", authRouter);
app.use("/api/services", servicesRouter);
app.use("/uploads/avatars", express.static(AVATAR_DIR, { index: false, dotfiles: "deny", maxAge: "7d" }));
app.use("/uploads", express.static(path.join(__dirname, "uploads")));
app.use("/api/orders", ordersRouter);
app.use("/api/payment", paymentRouter);
app.use("/api/profile", profileRouter);
app.use("/api/operator", operatorRouter);

app.use((req, res) => res.status(404).json({ error: `Endpoint tidak ditemukan: ${req.method} ${req.path}` }));
app.use((err, req, res, next) => {
  if (res.headersSent) return next(err);
  console.error("Request error:", err.message);
  if (err.message === "Origin tidak diizinkan oleh kebijakan CORS.") {
    return res.status(403).json({ error: err.message });
  }
  return res.status(500).json({ error: "Terjadi kesalahan pada server." });
});

const PORT = Number(process.env.PORT) || 4000;

// Vercel imports the Express app as a serverless function; local development starts a listener.
if (require.main === module) {
  const server = app.listen(PORT, "0.0.0.0", () => {
    console.log(`Nusa East backend jalan di http://localhost:${PORT}`);
    console.log(`Health check: http://localhost:${PORT}/api/health`);
    console.log(`Mode: ${isDevelopment ? "development" : "production"}`);
    if (!process.env.DATABASE_URL) console.warn("PERINGATAN: DATABASE_URL belum diatur. Health check aktif, tetapi fitur berbasis database tidak akan berfungsi.");
    if (!process.env.JWT_SECRET || process.env.JWT_SECRET.startsWith("ganti_dengan")) console.warn("PERINGATAN: JWT_SECRET belum diatur dengan nilai rahasia yang kuat.");
  });
  server.on("error", (err) => {
    if (err.code === "EADDRINUSE") console.error(`Port ${PORT} sedang digunakan. Tutup server lama atau ubah PORT di .env.`);
    else console.error("Backend gagal dijalankan:", err);
    process.exitCode = 1;
  });
}

module.exports = app;
