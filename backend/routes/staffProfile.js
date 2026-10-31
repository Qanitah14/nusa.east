"use strict";
// Profil Admin Penjualan & Operator: foto profil. Satu tabel untuk keduanya (staff_profiles),
// terpisah dari users. Foto disimpan sebagai FILE seperti foto pelanggan; tabel hanya
// menyimpan link/path-nya (image_url) dan tanggal.
const express = require("express");
const multer = require("multer");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const pool = require("../db/pool");
const { requireStaff, dbErrorResponse } = require("../middleware/auth");
const { AVATAR_DIR } = require("./profile");

const router = express.Router();
const MAX_FILE_SIZE = 1.5 * 1024 * 1024;
const EXT = { "image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp" };
const URL_PREFIX = "/uploads/avatars/";

// Tabel dibuat otomatis bila belum ada (sama dengan definisi di db/schema.sql), agar tidak error
// walaupun schema.sql belum dijalankan di database.
let tableReady = null;
function ensureTable() {
  if (!tableReady) {
    tableReady = pool.query(
      `CREATE TABLE IF NOT EXISTS public.staff_profiles (
         user_id UUID PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
         image_url TEXT,
         created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
         updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
       )`).catch((err) => { tableReady = null; throw err; });
  }
  return tableReady;
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_SIZE, files: 1 },
  fileFilter(req, file, cb) {
    if (!EXT[file.mimetype]) return cb(new Error("Gunakan file JPG, PNG, atau WebP."));
    cb(null, true);
  }
});
function validImage(buf, mime) {
  if (!buf || buf.length < 12) return false;
  if (mime === "image/jpeg") return buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff;
  if (mime === "image/png") return buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  if (mime === "image/webp") return buf.toString("ascii", 0, 4) === "RIFF" && buf.toString("ascii", 8, 12) === "WEBP";
  return false;
}
function handleUpload(req, res, next) {
  upload.single("avatar")(req, res, (error) => {
    if (!error) return next();
    if (error instanceof multer.MulterError && error.code === "LIMIT_FILE_SIZE") return res.status(413).json({ error: "Ukuran foto maksimal 1,5 MB." });
    return res.status(400).json({ error: error.message || "File foto tidak dapat diproses." });
  });
}
// Hapus file lama hanya jika benar-benar berada di folder avatar (cegah path traversal).
function removeFile(url) {
  if (!url || !String(url).startsWith(URL_PREFIX)) return;
  const target = path.join(AVATAR_DIR, path.basename(url));
  if (path.dirname(target) !== AVATAR_DIR) return;
  fs.unlink(target, (e) => { if (e && e.code !== "ENOENT") console.error("Gagal menghapus foto lama:", e.message); });
}

// GET /api/staff-profile — foto & tanggal profil milik sendiri
router.get("/", ...requireStaff, async (req, res) => {
  try {
    await ensureTable();
    const r = await pool.query("SELECT image_url, created_at, updated_at FROM staff_profiles WHERE user_id = $1", [req.user.userId]);
    res.json(r.rows[0] || { image_url: null, created_at: null, updated_at: null });
  } catch (err) { dbErrorResponse(res, err, "Staff profile"); }
});

// POST /api/staff-profile/avatar — multipart, field "avatar"
router.post("/avatar", ...requireStaff, handleUpload, async (req, res) => {
  let written = null;
  try {
    if (!req.file) return res.status(400).json({ error: "Silakan pilih foto profil terlebih dahulu." });
    if (!validImage(req.file.buffer, req.file.mimetype)) return res.status(400).json({ error: "Isi file tidak sesuai dengan format gambar." });
    await ensureTable();

    const fileName = `s${req.user.userId.slice(0, 8)}-${Date.now()}-${crypto.randomBytes(8).toString("hex")}${EXT[req.file.mimetype]}`;
    written = path.join(AVATAR_DIR, fileName);
    await fs.promises.writeFile(written, req.file.buffer, { flag: "wx" });

    const old = await pool.query("SELECT image_url FROM staff_profiles WHERE user_id = $1", [req.user.userId]);
    const url = URL_PREFIX + fileName;
    await pool.query(
      `INSERT INTO staff_profiles (user_id, image_url) VALUES ($1, $2)
       ON CONFLICT (user_id) DO UPDATE SET image_url = EXCLUDED.image_url, updated_at = now()`,
      [req.user.userId, url]);
    removeFile(old.rows[0] && old.rows[0].image_url);
    res.json({ success: true, image_url: url, message: "Foto profil berhasil disimpan." });
  } catch (err) {
    if (written) fs.unlink(written, () => {});
    dbErrorResponse(res, err, "Staff avatar upload");
  }
});

// DELETE /api/staff-profile/avatar
router.delete("/avatar", ...requireStaff, async (req, res) => {
  try {
    await ensureTable();
    const old = await pool.query("SELECT image_url FROM staff_profiles WHERE user_id = $1", [req.user.userId]);
    await pool.query("UPDATE staff_profiles SET image_url = NULL, updated_at = now() WHERE user_id = $1", [req.user.userId]);
    removeFile(old.rows[0] && old.rows[0].image_url);
    res.json({ success: true, image_url: null });
  } catch (err) { dbErrorResponse(res, err, "Staff avatar delete"); }
});

module.exports = router;
