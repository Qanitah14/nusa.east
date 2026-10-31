"use strict";
// Autentikasi berbasis sesi + RBAC. Semua pengecekan dilakukan di server:
// token JWT hanya membawa id sesi; role, status akun, dan masa berlaku
// SELALU dibaca ulang dari database pada setiap request.
const jwt = require("jsonwebtoken");
const pool = require("../db/pool");

const ROLES = { USER: "user", SALES: "sales_admin", SUPER: "super_user" };

const num = (v, d) => (Number.isFinite(Number(v)) && Number(v) > 0 ? Number(v) : d);
// Masa berlaku sesi (jam) dan batas tidak aktif (menit) per role — dapat diubah lewat .env
const TTL_HOURS = {
  user: num(process.env.SESSION_TTL_HOURS_USER, 24 * 7),
  sales_admin: num(process.env.SESSION_TTL_HOURS_SALES, 12),
  super_user: num(process.env.SESSION_TTL_HOURS_SUPER, 8)
};
const IDLE_MINUTES = {
  user: num(process.env.SESSION_IDLE_MINUTES_USER, 24 * 60),
  sales_admin: num(process.env.SESSION_IDLE_MINUTES_SALES, 60),
  super_user: num(process.env.SESSION_IDLE_MINUTES_SUPER, 30)
};
// Pengguna dianggap "Online" bila heartbeat terakhir kurang dari ini.
const ONLINE_WINDOW_MINUTES = num(process.env.ONLINE_WINDOW_MINUTES, 5);

const clientIp = (req) => String(req.ip || req.socket?.remoteAddress || "").slice(0, 64);

async function logActivity(db, { actorId = null, actorRole = null, action, targetUserId = null, detail = null, ip = null }) {
  try {
    await (db || pool).query(
      `INSERT INTO activity_logs (actor_id, actor_role, action, target_user_id, detail, ip)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [actorId, actorRole, action, targetUserId, detail ? JSON.stringify(detail) : null, ip]
    );
  } catch (err) {
    console.error("Gagal mencatat aktivitas:", err.code || err.message);
  }
}

// Membuat sesi + token. `db` boleh berupa client transaksi.
async function createSession(db, user, req) {
  const ttlHours = TTL_HOURS[user.role] || TTL_HOURS.user;
  const r = await (db || pool).query(
    `INSERT INTO user_sessions (user_id, expires_at, ip, user_agent)
     VALUES ($1, now() + ($2::int * interval '1 hour'), $3, $4)
     RETURNING id, expires_at`,
    [user.id, Math.round(ttlHours), clientIp(req), String(req.headers["user-agent"] || "").slice(0, 300)]
  );
  const { id: sid, expires_at: expiresAt } = r.rows[0];
  const token = jwt.sign({ userId: user.id, sid }, process.env.JWT_SECRET, { expiresIn: Math.round(ttlHours * 3600) });
  return { sid, token, expiresAt };
}

async function endSession(db, sid, reason) {
  const r = await (db || pool).query(
    `UPDATE user_sessions SET ended_at = now(), end_reason = $2 WHERE id = $1 AND ended_at IS NULL RETURNING id`,
    [sid, reason]
  );
  return r.rowCount > 0;
}

async function endAllSessions(db, userId, reason) {
  const r = await (db || pool).query(
    `UPDATE user_sessions SET ended_at = now(), end_reason = $2 WHERE user_id = $1 AND ended_at IS NULL`,
    [userId, reason]
  );
  return r.rowCount;
}

// Menutup sesi yang kedaluwarsa / terlalu lama tidak aktif (mis. browser ditutup tanpa logout)
// dan mencatatnya di log aktivitas dengan waktu yang sebenarnya.
async function sweepSessions() {
  try {
    await pool.query(
      `WITH ended AS (
         UPDATE user_sessions s SET
           ended_at   = CASE WHEN s.expires_at <= now() THEN s.expires_at ELSE s.last_seen_at END,
           end_reason = CASE WHEN s.expires_at <= now() THEN 'expired' ELSE 'timeout' END
         FROM users u
         WHERE u.id = s.user_id AND s.ended_at IS NULL AND (
           s.expires_at <= now() OR
           s.last_seen_at < now() - (CASE u.role WHEN 'user' THEN $1::int WHEN 'sales_admin' THEN $2::int ELSE $3::int END) * interval '1 minute')
         RETURNING s.user_id, s.ended_at, s.end_reason, s.ip, u.role
       )
       INSERT INTO activity_logs (actor_id, actor_role, action, target_user_id, detail, ip, created_at)
       SELECT user_id, role, CASE end_reason WHEN 'expired' THEN 'session_expired' ELSE 'session_timeout' END,
              user_id, NULL, ip, ended_at FROM ended`,
      [Math.round(IDLE_MINUTES.user), Math.round(IDLE_MINUTES.sales_admin), Math.round(IDLE_MINUTES.super_user)]
    );
  } catch (err) {
    console.error("Sweep sesi gagal:", err.code || err.message);
  }
}

function dbErrorResponse(res, err, label = "Auth") {
  console.error(`${label} error:`, err.code || err.message);
  const down = ["ECONNREFUSED", "ENOTFOUND", "28P01", "3D000", "ECONNRESET", "ETIMEDOUT"].includes(err.code);
  return res.status(down ? 503 : 500).json({
    error: down ? "Database belum terhubung. Periksa konfigurasi database backend." : "Terjadi kesalahan pada server."
  });
}

async function requireAuth(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (!token) return res.status(401).json({ error: "Token tidak ditemukan." });

  let payload;
  try { payload = jwt.verify(token, process.env.JWT_SECRET); }
  catch { return res.status(401).json({ error: "Token tidak valid atau sudah kedaluwarsa." }); }
  if (!payload.sid || !payload.userId) return res.status(401).json({ error: "Sesi tidak valid. Silakan login kembali." });

  try {
    const r = await pool.query(
      `SELECT s.id AS sid, s.ended_at, s.end_reason, (s.expires_at <= now()) AS expired,
              EXTRACT(EPOCH FROM (now() - s.last_seen_at)) AS idle_sec,
              u.id, u.name, u.email, u.role, u.status
         FROM user_sessions s JOIN users u ON u.id = s.user_id
        WHERE s.id = $1 AND s.user_id = $2`,
      [payload.sid, payload.userId]
    );
    const row = r.rows[0];
    if (!row || row.ended_at) return res.status(401).json({ error: "Sesi telah berakhir. Silakan login kembali." });
    if (row.expired) { await endSession(null, row.sid, "expired"); return res.status(401).json({ error: "Sesi kedaluwarsa. Silakan login kembali." }); }
    if (Number(row.idle_sec) > (IDLE_MINUTES[row.role] || IDLE_MINUTES.user) * 60) {
      await endSession(null, row.sid, "timeout");
      return res.status(401).json({ error: "Sesi berakhir karena tidak aktif. Silakan login kembali." });
    }
    if (row.status !== "active") {
      await endSession(null, row.sid, "revoked");
      return res.status(403).json({ error: row.status === "blocked" ? "Akun Anda diblokir." : "Akun Anda dinonaktifkan." });
    }
    // Perbarui aktivitas terakhir (dibatasi 1x per 30 detik agar ringan)
    pool.query("UPDATE user_sessions SET last_seen_at = now() WHERE id = $1 AND last_seen_at < now() - interval '30 seconds'", [row.sid]).catch(() => {});
    req.user = { userId: row.id, sid: row.sid, role: row.role, name: row.name, email: row.email };
    return next();
  } catch (err) {
    return dbErrorResponse(res, err);
  }
}

// Gunakan setelah requireAuth. Role yang dipakai berasal dari database, bukan dari token.
const requireRole = (...roles) => (req, res, next) => {
  if (!req.user || !roles.includes(req.user.role)) {
    return res.status(403).json({ error: "Anda tidak memiliki hak akses untuk fitur ini." });
  }
  next();
};

const requireUser = [requireAuth, requireRole(ROLES.USER)];
const requireSales = [requireAuth, requireRole(ROLES.SALES)];
const requireSuper = [requireAuth, requireRole(ROLES.SUPER)];
const requireStaff = [requireAuth, requireRole(ROLES.SALES, ROLES.SUPER)];

// Kompatibilitas: kode lama memakai `requireAuth, requireAdmin`. "Admin" = Admin Penjualan.
const requireAdmin = requireRole(ROLES.SALES);

module.exports = {
  ROLES, TTL_HOURS, IDLE_MINUTES, ONLINE_WINDOW_MINUTES,
  clientIp, logActivity, createSession, endSession, endAllSessions, sweepSessions, dbErrorResponse,
  requireAuth, requireRole, requireAdmin, requireUser, requireSales, requireSuper, requireStaff
};
