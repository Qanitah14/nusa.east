"use strict";
const express = require("express");
const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const pool = require("../db/pool");
const V = require("../utils/validators");
const A = require("../middleware/auth");
const { ROLES, requireAuth, requireAdmin, requireStaff, logActivity, createSession, endSession, endAllSessions, clientIp, dbErrorResponse } = A;

const router = express.Router();
const DUMMY_HASH = bcrypt.hashSync("nusaeast-dummy-password", 10); // menyamakan waktu respons untuk email tak dikenal
const RESET_TOKEN_MINUTES = Number(process.env.RESET_TOKEN_MINUTES) > 0 ? Number(process.env.RESET_TOKEN_MINUTES) : 60;

/* ---------- pembatas percobaan (in-memory) ---------- */
const buckets = new Map();
function limited(key, max, windowMs) {
  const now = Date.now();
  const rec = buckets.get(key);
  if (!rec || now - rec.first > windowMs) return false;
  return rec.count >= max;
}
function noteHit(key, windowMs) {
  const now = Date.now();
  const rec = buckets.get(key);
  if (!rec || now - rec.first > windowMs) buckets.set(key, { count: 1, first: now });
  else rec.count++;
  if (buckets.size > 5000) for (const [k, v] of buckets) if (now - v.first > windowMs) buckets.delete(k);
}
const LOGIN_WINDOW = 15 * 60 * 1000, LOGIN_MAX = 5;

const publicUser = (u) => ({
  id: u.id, name: u.name, email: u.email, role: u.role,
  phone: u.phone || "", address: u.address || "", avatar_url: u.avatar_url || null,
  image_url: u.image_url || u.avatar_url || null,
  status: u.status, created_at: u.created_at
});
const USER_COLS = "id, name, email, role, phone, address, avatar_url, image_url, status, created_at";

/* =========================================================
   REGISTRASI — hanya untuk pelanggan. Role SELALU 'user'.
   Field `role` / `status` dari body diabaikan sepenuhnya.
   ========================================================= */
router.post("/register", async (req, res) => {
  try {
    const name = V.validateName(req.body.name);
    const email = V.validateEmail(req.body.email);
    const phone = V.validatePhone(req.body.phone);
    const address = V.validateAddress(req.body.address);
    const password = V.validatePassword(req.body.password);
    const err = V.firstError([name, email, phone, address, password]);
    if (err) return res.status(400).json({ error: err });

    const key = `register|${req.ip}`;
    if (limited(key, 10, 60 * 60 * 1000)) return res.status(429).json({ error: "Terlalu banyak pendaftaran dari alamat ini. Coba lagi nanti." });
    noteHit(key, 60 * 60 * 1000);

    const hash = await bcrypt.hash(password.value, 12);
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const dup = await client.query("SELECT 1 FROM users WHERE LOWER(email) = $1", [email.value]);
      if (dup.rowCount) { await client.query("ROLLBACK"); return res.status(409).json({ error: "Email sudah terdaftar." }); }
      const ins = await client.query(
        `INSERT INTO users (name, email, phone, address, password_hash, role, status)
         VALUES ($1,$2,$3,$4,$5,'user','active') RETURNING ${USER_COLS}`,
        [name.value, email.value, phone.value, address.value, hash]
      );
      const user = ins.rows[0];
      const session = await createSession(client, user, req);
      await logActivity(client, { actorId: user.id, actorRole: "user", action: "register", targetUserId: user.id, ip: clientIp(req) });
      await client.query("COMMIT");
      return res.status(201).json({ token: session.token, expiresAt: session.expiresAt, user: publicUser(user) });
    } catch (e) {
      try { await client.query("ROLLBACK"); } catch (_) {}
      if (e.code === "23505") return res.status(409).json({ error: "Email sudah terdaftar." });
      throw e;
    } finally { client.release(); }
  } catch (err) { return dbErrorResponse(res, err, "Register"); }
});

/* =========================================================
   LOGIN — satu fungsi, tiga pintu. Setiap pintu hanya menerima
   role-nya sendiri; kegagalan selalu berpesan sama (tidak membocorkan
   keberadaan akun internal).
   ========================================================= */
function loginHandler(requiredRole, scope) {
  return async (req, res) => {
    try {
      const email = String(req.body.email || "").trim().toLowerCase();
      const password = String(req.body.password || "");
      if (!email || !password) return res.status(400).json({ error: "Email dan password wajib diisi." });
      if (password.length > 200 || email.length > 150) return res.status(400).json({ error: "Email atau password salah." });

      const key = `login|${scope}|${req.ip}|${email}`;
      if (limited(key, LOGIN_MAX, LOGIN_WINDOW)) return res.status(429).json({ error: "Terlalu banyak percobaan. Coba lagi dalam 15 menit." });

      const r = await pool.query(`SELECT ${USER_COLS}, password_hash FROM users WHERE LOWER(email) = $1`, [email]);
      const user = r.rows[0];
      const valid = await bcrypt.compare(password, user ? user.password_hash : DUMMY_HASH);

      if (!user || !valid || user.role !== requiredRole) {
        noteHit(key, LOGIN_WINDOW);
        await logActivity(null, {
          actorId: user && valid ? user.id : null, action: "login_failed", targetUserId: user ? user.id : null,
          detail: { scope, email: email.slice(0, 150) }, ip: clientIp(req)
        });
        return res.status(401).json({ error: "Email atau password salah." });
      }
      if (user.status !== "active") {
        await logActivity(null, { actorId: user.id, actorRole: user.role, action: "login_denied", targetUserId: user.id, detail: { status: user.status }, ip: clientIp(req) });
        return res.status(403).json({ error: user.status === "blocked" ? "Akun Anda diblokir. Hubungi operator Nusa East." : "Akun Anda dinonaktifkan. Hubungi operator Nusa East." });
      }

      buckets.delete(key);
      A.sweepSessions();
      const session = await createSession(null, user, req);
      await logActivity(null, { actorId: user.id, actorRole: user.role, action: "login", targetUserId: user.id, ip: clientIp(req) });
      return res.json({ token: session.token, expiresAt: session.expiresAt, user: publicUser(user) });
    } catch (err) { return dbErrorResponse(res, err, "Login"); }
  };
}
router.post("/login", loginHandler(ROLES.USER, "user"));               // pelanggan
router.post("/admin-login", loginHandler(ROLES.SALES, "sales"));       // Admin Penjualan
router.post("/operator-login", loginHandler(ROLES.SUPER, "operator")); // Super User / Operator

/* ---------- logout, heartbeat, me ---------- */
router.post("/logout", requireAuth, async (req, res) => {
  try {
    if (await endSession(null, req.user.sid, "logout")) {
      await logActivity(null, { actorId: req.user.userId, actorRole: req.user.role, action: "logout", targetUserId: req.user.userId, ip: clientIp(req) });
    }
    res.json({ success: true });
  } catch (err) { dbErrorResponse(res, err, "Logout"); }
});

router.post("/heartbeat", requireAuth, async (req, res) => {
  try {
    await pool.query("UPDATE user_sessions SET last_seen_at = now() WHERE id = $1", [req.user.sid]);
    res.json({ ok: true, role: req.user.role });
  } catch (err) { dbErrorResponse(res, err, "Heartbeat"); }
});

router.get("/me", requireAuth, async (req, res) => {
  try {
    const r = await pool.query(`SELECT ${USER_COLS} FROM users WHERE id = $1`, [req.user.userId]);
    res.json(publicUser(r.rows[0]));
  } catch (err) { dbErrorResponse(res, err, "Me"); }
});

/* =========================================================
   LUPA PASSWORD (sisi pelanggan)
   Verifikasi identitas: email + nomor telepon terdaftar. Respons SELALU
   sama agar tidak bisa dipakai menebak email yang terdaftar. Hasil
   verifikasi hanya terlihat oleh operator (kolom identity_verified).
   ========================================================= */
const FORGOT_MSG = "Jika data Anda cocok, permintaan reset password sudah diteruskan ke operator Nusa East. Operator akan menghubungi Anda untuk memberikan tautan reset.";
router.post("/forgot-password", async (req, res) => {
  try {
    const email = V.validateEmail(req.body.email);
    const phone = V.validatePhone(req.body.phone);
    const err = V.firstError([email, phone]);
    if (err) return res.status(400).json({ error: err });

    const key = `forgot|${req.ip}`;
    if (limited(key, 5, 60 * 60 * 1000)) return res.status(429).json({ error: "Terlalu banyak permintaan. Coba lagi dalam 1 jam." });
    noteHit(key, 60 * 60 * 1000);

    const r = await pool.query("SELECT id, phone, status FROM users WHERE LOWER(email) = $1 AND role = 'user'", [email.value]);
    const user = r.rows[0];
    if (user && user.status !== "blocked") {
      const verified = V.normalizePhone(user.phone) !== "" && V.normalizePhone(user.phone) === V.normalizePhone(phone.value);
      const ins = await pool.query(
        `INSERT INTO password_reset_requests (user_id, source, identity_verified) VALUES ($1,'user',$2)
         ON CONFLICT (user_id) WHERE status IN ('pending','processing','approved')
         DO UPDATE SET identity_verified = password_reset_requests.identity_verified OR EXCLUDED.identity_verified, updated_at = now()
         RETURNING (xmax = 0) AS created`,
        [user.id, verified]
      );
      if (ins.rows[0].created) {
        await logActivity(null, { actorId: user.id, actorRole: "user", action: "password_reset_requested", targetUserId: user.id, detail: { identity_verified: verified }, ip: clientIp(req) });
      }
    }
    res.status(202).json({ message: FORGOT_MSG });
  } catch (err) { dbErrorResponse(res, err, "Forgot password"); }
});

/* Set password baru dengan token dari operator. Token sekali pakai & berkadaluarsa. */
router.post("/reset-password", async (req, res) => {
  const token = String(req.body.token || "").trim();
  const pw = V.validatePassword(req.body.newPassword);
  if (!/^[a-f0-9]{64}$/.test(token)) return res.status(400).json({ error: "Token reset tidak valid atau sudah kedaluwarsa." });
  if (!pw.ok) return res.status(400).json({ error: pw.error });
  const key = `reset|${req.ip}`;
  if (limited(key, 10, 15 * 60 * 1000)) return res.status(429).json({ error: "Terlalu banyak percobaan. Coba lagi nanti." });
  noteHit(key, 15 * 60 * 1000);

  const hashToken = crypto.createHash("sha256").update(token).digest("hex");
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const r = await client.query(
      `SELECT r.id, r.user_id, r.status, r.token_expires_at, r.token_used_at, (r.token_expires_at <= now()) AS expired, u.role, u.status AS user_status
         FROM password_reset_requests r JOIN users u ON u.id = r.user_id
        WHERE r.token_hash = $1 FOR UPDATE OF r`, [hashToken]);
    const row = r.rows[0];
    if (!row || row.status !== "approved" || row.token_used_at || row.user_status === "blocked") {
      await client.query("ROLLBACK");
      return res.status(400).json({ error: "Token reset tidak valid atau sudah kedaluwarsa." });
    }
    if (row.expired) {
      await client.query("UPDATE password_reset_requests SET status='expired', token_hash=NULL, updated_at=now() WHERE id=$1", [row.id]);
      await client.query("COMMIT");
      return res.status(400).json({ error: "Token reset tidak valid atau sudah kedaluwarsa." });
    }
    const newHash = await bcrypt.hash(pw.value, 12);
    await client.query("UPDATE users SET password_hash = $1, updated_at = now() WHERE id = $2", [newHash, row.user_id]);
    await client.query("UPDATE password_reset_requests SET status='completed', token_used_at=now(), token_hash=NULL, updated_at=now() WHERE id=$1", [row.id]);
    await endAllSessions(client, row.user_id, "password_reset");
    await logActivity(client, { actorId: row.user_id, actorRole: row.role, action: "password_reset_completed", targetUserId: row.user_id, ip: clientIp(req) });
    await client.query("COMMIT");
    res.json({ success: true, message: "Password berhasil diubah. Silakan masuk dengan password baru." });
  } catch (err) {
    try { await client.query("ROLLBACK"); } catch (_) {}
    dbErrorResponse(res, err, "Reset password");
  } finally { client.release(); }
});

/* =========================================================
   Profil & password akun internal (Admin Penjualan / Super User)
   Jalur lama /admin-* dipertahankan agar halaman admin lama tetap jalan.
   ========================================================= */
const staffMe = async (req, res) => {
  try {
    const r = await pool.query(`SELECT ${USER_COLS} FROM users WHERE id = $1`, [req.user.userId]);
    res.json(publicUser(r.rows[0]));
  } catch (err) { dbErrorResponse(res, err, "Staff profile"); }
};
const staffProfile = async (req, res) => {
  try {
    const name = V.validateName(req.body.name);
    if (!name.ok) return res.status(400).json({ error: name.error });
    const r = await pool.query(`UPDATE users SET name = $1, updated_at = now() WHERE id = $2 RETURNING ${USER_COLS}`, [name.value, req.user.userId]);
    res.json(publicUser(r.rows[0]));
  } catch (err) { dbErrorResponse(res, err, "Staff profile"); }
};
const staffPassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) return res.status(400).json({ error: "Password lama dan baru wajib diisi." });
    const pw = V.validatePassword(newPassword);
    if (!pw.ok) return res.status(400).json({ error: pw.error.replace("Password", "Password baru") });
    const r = await pool.query("SELECT password_hash FROM users WHERE id = $1", [req.user.userId]);
    if (!r.rows.length || !(await bcrypt.compare(String(currentPassword), r.rows[0].password_hash))) {
      return res.status(400).json({ error: "Password lama salah." });
    }
    await pool.query("UPDATE users SET password_hash = $1, updated_at = now() WHERE id = $2", [await bcrypt.hash(pw.value, 12), req.user.userId]);
    // Sesi lain milik akun ini dicabut; sesi yang sedang dipakai dipertahankan.
    await pool.query("UPDATE user_sessions SET ended_at = now(), end_reason = 'revoked' WHERE user_id = $1 AND id <> $2 AND ended_at IS NULL", [req.user.userId, req.user.sid]);
    await logActivity(null, { actorId: req.user.userId, actorRole: req.user.role, action: "password_changed", targetUserId: req.user.userId, ip: clientIp(req) });
    res.json({ success: true });
  } catch (err) { dbErrorResponse(res, err, "Staff password"); }
};
for (const p of ["/admin-me", "/staff-me"]) router.get(p, ...requireStaff, staffMe);
for (const p of ["/admin-profile", "/staff-profile"]) router.put(p, ...requireStaff, staffProfile);
for (const p of ["/admin-password", "/staff-password"]) router.put(p, ...requireStaff, staffPassword);

module.exports = { router, requireAuth, requireAdmin };
