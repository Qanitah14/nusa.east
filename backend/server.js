require("dotenv").config();
const express = require("express");
const cors = require("cors");

const { router: authRouter } = require("./routes/auth");
const ordersRouter = require("./routes/orders");
const paymentRouter = require("./routes/payment");
const servicesRouter = require("./routes/services");
const path = require("path");

const app = express();
app.disable("x-powered-by");

// Saat pengembangan, Live Server bisa memakai localhost atau 127.0.0.1
// dengan port yang berubah-ubah. Di produksi, gunakan FRONTEND_URL yang eksplisit.
const isDevelopment = process.env.NODE_ENV !== "production";
const allowedOrigins = String(process.env.FRONTEND_URL || "")
  .split(",").map((value) => value.trim()).filter(Boolean);
app.use(cors({
  origin(origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
    if (isDevelopment) {
      try {
        const url = new URL(origin);
        if (["localhost", "127.0.0.1", "::1"].includes(url.hostname)) return callback(null, true);
      } catch (_) { /* origin bukan URL valid */ }
    }
    return callback(new Error("Origin tidak diizinkan oleh kebijakan CORS."));
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
app.use("/uploads", express.static(path.join(__dirname, "uploads")));
app.use("/api/orders", ordersRouter);
app.use("/api/payment", paymentRouter);

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
const server = app.listen(PORT, "0.0.0.0", () => {
  console.log(`Nusa East backend jalan di http://localhost:${PORT}`);
  console.log(`Health check: http://localhost:${PORT}/api/health`);
  console.log(`Mode: ${isDevelopment ? "development" : "production"}`);
  if (!process.env.DATABASE_URL) console.warn("PERINGATAN: DATABASE_URL belum diatur. Health check aktif, tetapi login/registrasi dan fitur berbasis database tidak akan berfungsi.");
  if (!process.env.JWT_SECRET || process.env.JWT_SECRET.startsWith("ganti_dengan")) console.warn("PERINGATAN: JWT_SECRET belum diatur dengan nilai rahasia yang kuat di file .env.");
});
server.on("error", (err) => {
  if (err.code === "EADDRINUSE") console.error(`Port ${PORT} sedang digunakan. Tutup server lama atau ubah PORT di .env.`);
  else console.error("Backend gagal dijalankan:", err);
  process.exitCode = 1;
});
