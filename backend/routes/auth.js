const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const pool = require("../db/pool");

const router = express.Router();

// POST /api/auth/register
router.post("/register", async (req, res) => {
  try {
    const { name, email, phone, password } = req.body;
    if (!name || !email || !password) {
      return res.status(400).json({ error: "Nama, email, dan password wajib diisi." });
    }

    const existing = await pool.query("SELECT id FROM users WHERE email = $1", [email]);
    if (existing.rows.length > 0) {
      return res.status(409).json({ error: "Email sudah terdaftar." });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const result = await pool.query(
      `INSERT INTO users (name, email, phone, password_hash)
       VALUES ($1, $2, $3, $4) RETURNING id, name, email, role`,
      [name, email, phone, passwordHash]
    );

    const user = result.rows[0];
    const token = jwt.sign({ userId: user.id, role: user.role }, process.env.JWT_SECRET, { expiresIn: "7d" });

    res.status(201).json({ token, user });
  } catch (err) {
    console.error("Auth endpoint error:", err.code || err.message);
    const dbUnavailable = ["ECONNREFUSED", "ENOTFOUND", "28P01", "3D000", "ECONNRESET"].includes(err.code);
    res.status(500).json({ error: dbUnavailable ? "Database belum terhubung. Periksa PostgreSQL dan DATABASE_URL pada backend/.env." : "Terjadi kesalahan pada server. Periksa terminal backend untuk detailnya." });
  }
});

// POST /api/auth/login
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    const result = await pool.query("SELECT * FROM users WHERE email = $1", [email]);
    const user = result.rows[0];

    if (!user) return res.status(401).json({ error: "Email atau password salah." });

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) return res.status(401).json({ error: "Email atau password salah." });

    const token = jwt.sign({ userId: user.id, role: user.role }, process.env.JWT_SECRET, { expiresIn: "7d" });
    res.json({
      token,
      user: { id: user.id, name: user.name, email: user.email, role: user.role }
    });
  } catch (err) {
    console.error("Auth endpoint error:", err.code || err.message);
    const dbUnavailable = ["ECONNREFUSED", "ENOTFOUND", "28P01", "3D000", "ECONNRESET"].includes(err.code);
    res.status(500).json({ error: dbUnavailable ? "Database belum terhubung. Periksa PostgreSQL dan DATABASE_URL pada backend/.env." : "Terjadi kesalahan pada server. Periksa terminal backend untuk detailnya." });
  }
});

// Pembatas percobaan login admin (in-memory): 5 gagal / 15 menit per IP+email
const attempts = new Map();
const WINDOW_MS = 15 * 60 * 1000, MAX_FAILS = 5;
function tooManyAttempts(key) {
  const rec = attempts.get(key);
  if (!rec) return false;
  if (Date.now() - rec.first > WINDOW_MS) { attempts.delete(key); return false; }
  return rec.count >= MAX_FAILS;
}
function noteFail(key) {
  const rec = attempts.get(key);
  if (!rec || Date.now() - rec.first > WINDOW_MS) attempts.set(key, { count: 1, first: Date.now() });
  else rec.count++;
}

// POST /api/auth/admin-register — pendaftaran admin dibatasi dengan kunci bootstrap di server.
// Jangan pernah membuka pembuatan role admin tanpa ADMIN_REGISTRATION_KEY.

router.post("/admin-register", async (req, res) => {
  try {
    const name = String(req.body.name || "").trim();
    const email = String(req.body.email || "").trim().toLowerCase();
    const password = String(req.body.password || "");
    const registrationKey = String(req.body.registrationKey || "");
    const configuredKey = String(process.env.ADMIN_REGISTRATION_KEY || "");

    if (!configuredKey) {
      return res.status(503).json({
        error: "Pendaftaran admin belum diaktifkan."
      });
    }

    if (!name || !email || !password || !registrationKey) {
      return res.status(400).json({
        error: "Nama, email, password, dan kunci registrasi wajib diisi."
      });
    }

    if (registrationKey !== configuredKey) {
      return res.status(403).json({
        error: "Kunci registrasi admin tidak valid."
      });
    }

    if (password.length < 8) {
      return res.status(400).json({
        error: "Password minimal 8 karakter."
      });
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({
        error: "Format email tidak valid."
      });
    }

    const existing = await pool.query(
      `SELECT id FROM admins WHERE LOWER(email) = $1`,
      [email]
    );

    if (existing.rows.length) {
      return res.status(409).json({
        error: "Email sudah terdaftar sebagai admin."
      });
    }

    const passwordHash = await bcrypt.hash(password, 12);

    const result = await pool.query(
      `INSERT INTO admins (name, email, password_hash)
       VALUES ($1, $2, $3)
       RETURNING id, name, email`,
      [name, email, passwordHash]
    );

    return res.status(201).json({
      message: "Akun admin berhasil dibuat. Silakan masuk.",
      user: {
        ...result.rows[0],
        role: "admin"
      }
    });
  } catch (err) {
    if (err.code === "23505") {
      return res.status(409).json({
        error: "Email sudah terdaftar sebagai admin."
      });
    }

    console.error("Admin registration error:", err.code || err.message);

    return res.status(500).json({
      error: "Terjadi kesalahan pada server."
    });
  }
});


// POST /api/auth/admin-login — hanya untuk akun ber-role admin
router.post("/admin-login", async (req, res) => {
  try {
    const email = String(req.body.email || "").trim().toLowerCase();
    const password = String(req.body.password || "");
    if (!email || !password) return res.status(400).json({ error: "Email dan password wajib diisi." });

    const key = `${req.ip}|${email}`;
    if (tooManyAttempts(key)) {
      return res.status(429).json({ error: "Terlalu banyak percobaan. Coba lagi dalam 15 menit." });
    }

   const result = await pool.query(
  "SELECT * FROM admins WHERE LOWER(email) = $1",
  [email]
);

const admin = result.rows[0];
const valid =
  admin && (await bcrypt.compare(password, admin.password_hash));

// Pesan sama untuk email salah atau password salah
if (!valid) {
  noteFail(key);
  return res.status(401).json({
    error: "Email atau password admin salah."
  });
}

attempts.delete(key);

const token = jwt.sign(
  { userId: admin.id, role: "admin" },
  process.env.JWT_SECRET,
  { expiresIn: "12h" }
);

res.json({
  token,
  user: {
    id: admin.id,
    name: admin.name,
    email: admin.email,
    role: "admin"
  }
});

  } catch (err) {
    console.error("Auth endpoint error:", err.code || err.message);
    const dbUnavailable = ["ECONNREFUSED", "ENOTFOUND", "28P01", "3D000", "ECONNRESET"].includes(err.code);
    res.status(500).json({ error: dbUnavailable ? "Database belum terhubung. Periksa PostgreSQL dan DATABASE_URL pada backend/.env." : "Terjadi kesalahan pada server. Periksa terminal backend untuk detailnya." });
  }
});

// Middleware untuk melindungi route lain yang butuh login
function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ error: "Token tidak ditemukan." });
  const token = authHeader.split(" ")[1];
  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: "Token tidak valid." });
  }
}

// Khusus admin — pasang SETELAH requireAuth: router.post("/x", requireAuth, requireAdmin, handler)
// Role dicek ulang ke database, jadi akun yang dicabut hak adminnya langsung ditolak.

async function requireAdmin(req, res, next) {
  try {
    if (req.user?.role !== "admin") {
      return res.status(403).json({
        error: "Hanya admin yang boleh mengakses ini."
      });
    }

    const r = await pool.query(
      "SELECT id FROM admins WHERE id = $1",
      [req.user.userId]
    );

    if (!r.rows.length) {
      return res.status(403).json({
        error: "Hanya admin yang boleh mengakses ini."
      });
    }

    next();
  } catch (err) {
    console.error(
      "Admin authorization error:",
      err.code || err.message
    );

    const dbUnavailable = [
      "ECONNREFUSED",
      "ENOTFOUND",
      "28P01",
      "3D000",
      "ECONNRESET"
    ].includes(err.code);

    return res.status(500).json({
      error: dbUnavailable
        ? "Database belum terhubung. Periksa konfigurasi database backend."
        : "Terjadi kesalahan pada server."
    });
  }
}


// ---------- Profil admin ----------
// GET /api/auth/admin-me — data admin yang sedang masuk
router.get("/admin-me", requireAuth, requireAdmin, async (req, res) => {
  try {
    const r = await pool.query("SELECT id, name, email, created_at FROM admins WHERE id = $1", [req.user.userId]);
    if (!r.rows.length) return res.status(404).json({ error: "Akun admin tidak ditemukan." });
    res.json({ ...r.rows[0], role: "admin" });
  } catch (err) {
    console.error("Admin profile error:", err.code || err.message);
    res.status(500).json({ error: "Terjadi kesalahan pada server." });
  }
});

// PUT /api/auth/admin-profile — ubah nama tampilan admin
router.put("/admin-profile", requireAuth, requireAdmin, async (req, res) => {
  try {
    const name = String(req.body.name || "").trim();
    if (name.length < 2 || name.length > 150) return res.status(400).json({ error: "Nama harus 2–150 karakter." });
    const r = await pool.query("UPDATE admins SET name = $1 WHERE id = $2 RETURNING id, name, email", [name, req.user.userId]);
    res.json({ ...r.rows[0], role: "admin" });
  } catch (err) {
    console.error("Admin profile error:", err.code || err.message);
    res.status(500).json({ error: "Gagal menyimpan profil." });
  }
});

// PUT /api/auth/admin-password — ganti password (wajib password lama)
router.put("/admin-password", requireAuth, requireAdmin, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) return res.status(400).json({ error: "Password lama dan baru wajib diisi." });
    if (String(newPassword).length < 8) return res.status(400).json({ error: "Password baru minimal 8 karakter." });
    const r = await pool.query("SELECT password_hash FROM admins WHERE id = $1", [req.user.userId]);
    if (!r.rows.length || !(await bcrypt.compare(currentPassword, r.rows[0].password_hash))) {
      return res.status(400).json({ error: "Password lama salah." });
    }
    const hash = await bcrypt.hash(newPassword, 10);
    await pool.query("UPDATE admins SET password_hash = $1 WHERE id = $2", [hash, req.user.userId]);
    res.json({ success: true });
  } catch (err) {
    console.error("Admin password error:", err.code || err.message);
    res.status(500).json({ error: "Gagal mengganti password." });
  }
});

module.exports = { router, requireAuth, requireAdmin };
