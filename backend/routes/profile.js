"use strict";
// Profil pelanggan. Foto profil disimpan sebagai FILE; database hanya menyimpan
// path-nya di kolom users.avatar_url (tidak ada data gambar di database).
const express = require("express");
const multer = require("multer");
const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");
const pool = require("../db/pool");
const V = require("../utils/validators");
const { requireUser, logActivity, clientIp, dbErrorResponse } = require("../middleware/auth");

const router = express.Router();
const MAX_FILE_SIZE = 1.5 * 1024 * 1024;
const EXT = { "image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp" };
const URL_PREFIX = "/uploads/avatars/";

// Folder penyimpanan. Di hosting serverless (mis. Vercel) disk bersifat sementara —
// atur AVATAR_UPLOAD_DIR ke volume persisten atau pindahkan ke object storage.
function resolveAvatarDir() {
  const wanted = process.env.AVATAR_UPLOAD_DIR || path.join(__dirname, "..", "uploads", "avatars");
  for (const dir of [wanted, path.join(os.tmpdir(), "nusaeast-avatars")]) {
    try { fs.mkdirSync(dir, { recursive: true }); fs.accessSync(dir, fs.constants.W_OK); return dir; } catch (_) { /* coba berikutnya */ }
  }
  throw new Error("Folder foto profil tidak dapat ditulis.");
}
const AVATAR_DIR = resolveAvatarDir();

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
function removeAvatarFile(avatarUrl) {
  if (!avatarUrl || !String(avatarUrl).startsWith(URL_PREFIX)) return;
  const name = path.basename(avatarUrl);
  const target = path.join(AVATAR_DIR, name);
  if (path.dirname(target) !== AVATAR_DIR) return;
  fs.unlink(target, (e) => { if (e && e.code !== "ENOENT") console.error("Gagal menghapus foto lama:", e.message); });
}

const COLS = "id, name, email, role, phone, address, avatar_url, status, created_at";

// GET /api/profile — profil milik sendiri
router.get("/", ...requireUser, async (req, res) => {
  try {
    const r = await pool.query(`SELECT ${COLS} FROM users WHERE id = $1`, [req.user.userId]);
    res.json(r.rows[0]);
  } catch (err) { dbErrorResponse(res, err, "Profile"); }
});

// PUT /api/profile — hanya name, phone, address. Role/email/status tidak bisa diubah dari sini.
router.put("/", ...requireUser, async (req, res) => {
  try {
    const name = V.validateName(req.body.name);
    const phone = V.validatePhone(req.body.phone);
    const address = V.validateAddress(req.body.address);
    const err = V.firstError([name, phone, address]);
    if (err) return res.status(400).json({ error: err });
    const r = await pool.query(
      `UPDATE users SET name = $1, phone = $2, address = $3, updated_at = now() WHERE id = $4 RETURNING ${COLS}`,
      [name.value, phone.value, address.value, req.user.userId]
    );
    await logActivity(null, { actorId: req.user.userId, actorRole: "user", action: "profile_updated", targetUserId: req.user.userId, ip: clientIp(req) });
    res.json(r.rows[0]);
  } catch (err) { dbErrorResponse(res, err, "Profile"); }
});

// POST /api/profile/avatar — multipart, field "avatar"
router.post("/avatar", ...requireUser, handleUpload, async (req, res) => {
  let written = null;
  try {
    if (!req.file) return res.status(400).json({ error: "Silakan pilih foto profil terlebih dahulu." });
    if (!validImage(req.file.buffer, req.file.mimetype)) return res.status(400).json({ error: "Isi file tidak sesuai dengan format gambar." });

    const fileName = `u${req.user.userId.slice(0, 8)}-${Date.now()}-${crypto.randomBytes(8).toString("hex")}${EXT[req.file.mimetype]}`;
    written = path.join(AVATAR_DIR, fileName);
    await fs.promises.writeFile(written, req.file.buffer, { flag: "wx" });

    const old = await pool.query("SELECT avatar_url FROM users WHERE id = $1", [req.user.userId]);
    const url = URL_PREFIX + fileName;
    await pool.query("UPDATE users SET avatar_url = $1, updated_at = now() WHERE id = $2", [url, req.user.userId]);
    removeAvatarFile(old.rows[0] && old.rows[0].avatar_url);
    res.json({ success: true, avatar_url: url, message: "Foto profil berhasil disimpan." });
  } catch (err) {
    if (written) fs.unlink(written, () => {});
    dbErrorResponse(res, err, "Avatar upload");
  }
});

// DELETE /api/profile/avatar
router.delete("/avatar", ...requireUser, async (req, res) => {
  try {
    const old = await pool.query("SELECT avatar_url FROM users WHERE id = $1", [req.user.userId]);
    await pool.query("UPDATE users SET avatar_url = NULL, updated_at = now() WHERE id = $1", [req.user.userId]);
    removeAvatarFile(old.rows[0] && old.rows[0].avatar_url);
    res.json({ success: true, avatar_url: null });
  } catch (err) { dbErrorResponse(res, err, "Avatar delete"); }
});

module.exports = router;
module.exports.AVATAR_DIR = AVATAR_DIR;
