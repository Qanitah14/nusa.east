"use strict";
// API khusus Super User / Operator. Semua endpoint wajib login + role super_user
// (diperiksa ulang dari database pada setiap request).
const express = require("express");
const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const pool = require("../db/pool");
const V = require("../utils/validators");
const A = require("../middleware/auth");
const { requireSuper, logActivity, endAllSessions, sweepSessions, clientIp, ONLINE_WINDOW_MINUTES } = A;

const router = express.Router();
router.use(...requireSuper);

class HttpError extends Error { constructor(m, s = 400) { super(m); this.status = s; } }
const wrap = (fn) => async (req, res) => {
  try { res.json(await fn(req, res)); }
  catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    A.dbErrorResponse(res, err, "Operator");
  }
};
const audit = (req, action, targetUserId, detail) =>
  logActivity(null, { actorId: req.user.userId, actorRole: req.user.role, action, targetUserId, detail, ip: clientIp(req) });

const like = (s) => "%" + String(s).trim().replace(/[\\%_]/g, (c) => "\\" + c) + "%";
function paging(q, def = 15) {
  const page = Math.max(1, parseInt(q.page, 10) || 1);
  const pageSize = Math.min(100, Math.max(1, parseInt(q.pageSize, 10) || def));
  return { page, pageSize, offset: (page - 1) * pageSize };
}
const uuidParam = (v) => { if (!V.isUuid(v)) throw new HttpError("ID tidak valid.", 400); return v; };
const ROLE_SET = new Set(["user", "sales_admin", "super_user"]);
const STATUS_SET = new Set(["active", "disabled", "blocked"]);

/* ---------- daftar pengguna (dipakai Manajemen Pengguna, Data Pelanggan, Status Login, Akun) ---------- */
async function listUsers(req, { forceRole = null, withOrders = false } = {}) {
  await sweepSessions();
  const { page, pageSize, offset } = paging(req.query);
  const where = [], p = [];
  const add = (sql, v) => { p.push(v); where.push(sql.replace("?", "$" + p.length)); };
  const role = forceRole || req.query.role;
  if (role) { if (!ROLE_SET.has(role)) throw new HttpError("Filter role tidak valid."); add("u.role = ?", role); }
  if (req.query.status) { if (!STATUS_SET.has(req.query.status)) throw new HttpError("Filter status tidak valid."); add("u.status = ?", req.query.status); }
  if (req.query.search && String(req.query.search).trim()) {
    p.push(like(req.query.search));
    const i = p.length;
    where.push(`(u.name ILIKE $${i} OR u.email ILIKE $${i} OR COALESCE(u.phone,'') ILIKE $${i} OR COALESCE(u.address,'') ILIKE $${i})`);
  }
  const onlineSql = `EXISTS (SELECT 1 FROM user_sessions s WHERE s.user_id = u.id AND s.ended_at IS NULL AND s.expires_at > now()
                       AND s.last_seen_at > now() - interval '${Number(ONLINE_WINDOW_MINUTES)} minutes')`;
  if (req.query.online === "1") where.push(onlineSql);
  if (req.query.online === "0") where.push(`NOT ${onlineSql}`);
  const w = where.length ? "WHERE " + where.join(" AND ") : "";

  const total = (await pool.query(`SELECT COUNT(*)::int AS n FROM users u ${w}`, p)).rows[0].n;
  const orderCols = withOrders
    ? `, (SELECT COUNT(*)::int FROM orders o WHERE o.user_id = u.id) AS order_count,
         (SELECT COALESCE(SUM(o.total),0)::float FROM orders o WHERE o.user_id = u.id AND o.payment_status = 'paid') AS total_spent`
    : "";
  const sort = { name: "u.name ASC", oldest: "u.created_at ASC", last_seen: "last_seen_at DESC NULLS LAST" }[req.query.sort] || "u.created_at DESC";
  const rows = (await pool.query(
    `SELECT u.id, u.name, u.email, u.phone, u.address, u.avatar_url, u.role, u.status, u.created_at,
            ${onlineSql} AS online,
            (SELECT MAX(s.created_at) FROM user_sessions s WHERE s.user_id = u.id) AS last_login_at,
            (SELECT MAX(s.ended_at) FROM user_sessions s WHERE s.user_id = u.id AND s.end_reason = 'logout') AS last_logout_at,
            (SELECT MAX(s.last_seen_at) FROM user_sessions s WHERE s.user_id = u.id) AS last_seen_at
            ${orderCols}
       FROM users u ${w} ORDER BY ${sort}, u.id LIMIT ${pageSize} OFFSET ${offset}`, p)).rows;
  return { rows, total, page, pageSize };
}
router.get("/users", wrap((req) => listUsers(req)));
router.get("/customers", wrap((req) => listUsers(req, { forceRole: "user", withOrders: true })));

/* ---------- detail pengguna / pelanggan (tanpa password_hash) ---------- */
router.get("/users/:id", wrap(async (req) => {
  const id = uuidParam(req.params.id);
  const u = (await pool.query(
    `SELECT id, name, email, phone, address, avatar_url, role, status, created_at, updated_at FROM users WHERE id = $1`, [id])).rows[0];
  if (!u) throw new HttpError("Pengguna tidak ditemukan.", 404);
  const [sessions, activity, orders, resets] = await Promise.all([
    pool.query(`SELECT id, created_at, last_seen_at, ended_at, end_reason, ip, user_agent,
                       (ended_at IS NULL AND expires_at > now() AND last_seen_at > now() - interval '${Number(ONLINE_WINDOW_MINUTES)} minutes') AS online
                  FROM user_sessions WHERE user_id = $1 ORDER BY created_at DESC LIMIT 10`, [id]),
    pool.query(`SELECT action, detail, ip, created_at FROM activity_logs WHERE actor_id = $1 OR target_user_id = $1 ORDER BY created_at DESC LIMIT 15`, [id]),
    u.role === "user"
      ? pool.query(`SELECT id, total::float AS total, status, payment_status, created_at FROM orders WHERE user_id = $1 ORDER BY created_at DESC LIMIT 10`, [id])
      : { rows: [] },
    pool.query(`SELECT id, status, source, created_at FROM password_reset_requests WHERE user_id = $1 ORDER BY created_at DESC LIMIT 5`, [id])
  ]);
  return { ...u, sessions: sessions.rows, activity: activity.rows, orders: orders.rows, resetRequests: resets.rows };
}));

/* ---------- status akun ---------- */
router.patch("/users/:id/status", wrap(async (req) => {
  const id = uuidParam(req.params.id);
  const status = String(req.body.status || "");
  const reason = String(req.body.reason || "").trim().slice(0, 300);
  if (!STATUS_SET.has(status)) throw new HttpError("Status tidak valid.");
  if (id === req.user.userId) throw new HttpError("Anda tidak dapat mengubah status akun sendiri.", 403);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const t = (await client.query("SELECT id, role, status FROM users WHERE id = $1 FOR UPDATE", [id])).rows[0];
    if (!t) throw new HttpError("Pengguna tidak ditemukan.", 404);
    if (t.role === "super_user") throw new HttpError("Status akun Super User tidak dapat diubah dari dashboard.", 403);
    if (t.status === status) throw new HttpError("Akun sudah berstatus tersebut.", 409);
    await client.query("UPDATE users SET status = $1, updated_at = now() WHERE id = $2", [status, id]);
    if (status !== "active") await endAllSessions(client, id, "revoked");
    await logActivity(client, { actorId: req.user.userId, actorRole: req.user.role, action: "account_status_changed", targetUserId: id,
      detail: { from: t.status, to: status, reason: reason || null }, ip: clientIp(req) });
    await client.query("COMMIT");
    return { success: true, status };
  } catch (e) { try { await client.query("ROLLBACK"); } catch (_) {} throw e; }
  finally { client.release(); }
}));

/* ---------- paksa keluar (akhiri semua sesi) ---------- */
router.post("/users/:id/revoke-sessions", wrap(async (req) => {
  const id = uuidParam(req.params.id);
  if (id === req.user.userId) throw new HttpError("Gunakan tombol Keluar untuk mengakhiri sesi Anda sendiri.", 403);
  const t = (await pool.query("SELECT id, role FROM users WHERE id = $1", [id])).rows[0];
  if (!t) throw new HttpError("Pengguna tidak ditemukan.", 404);
  if (t.role === "super_user") throw new HttpError("Sesi Super User lain tidak dapat diakhiri dari sini.", 403);
  const n = await endAllSessions(null, id, "revoked");
  await audit(req, "sessions_revoked", id, { count: n });
  return { success: true, ended: n };
}));

/* ---------- Manajemen Role: akun internal ---------- */
router.post("/staff", wrap(async (req) => {
  const role = String(req.body.role || "");
  if (!["sales_admin", "super_user"].includes(role)) throw new HttpError("Role akun internal harus sales_admin atau super_user.");
  const name = V.validateName(req.body.name), email = V.validateEmail(req.body.email), pw = V.validatePassword(req.body.password);
  const err = V.firstError([name, email, pw]);
  if (err) throw new HttpError(err);
  const dup = await pool.query("SELECT 1 FROM users WHERE LOWER(email) = $1", [email.value]);
  if (dup.rowCount) throw new HttpError("Email sudah terdaftar.", 409);
  const hash = await bcrypt.hash(pw.value, 12);
  const r = await pool.query(
    `INSERT INTO users (name, email, password_hash, role, status) VALUES ($1,$2,$3,$4,'active') RETURNING id, name, email, role, status`,
    [name.value, email.value, hash, role]).catch((e) => { if (e.code === "23505") throw new HttpError("Email sudah terdaftar.", 409); throw e; });
  await audit(req, "staff_created", r.rows[0].id, { role });
  return r.rows[0];
}));

router.patch("/users/:id/role", wrap(async (req) => {
  const id = uuidParam(req.params.id);
  const role = String(req.body.role || "");
  if (!ROLE_SET.has(role)) throw new HttpError("Role tidak valid.");
  if (id === req.user.userId) throw new HttpError("Anda tidak dapat mengubah role akun sendiri.", 403);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const t = (await client.query("SELECT id, role FROM users WHERE id = $1 FOR UPDATE", [id])).rows[0];
    if (!t) throw new HttpError("Pengguna tidak ditemukan.", 404);
    if (t.role === role) throw new HttpError("Akun sudah memiliki role tersebut.", 409);
    if (t.role === "super_user") {
      const others = (await client.query("SELECT COUNT(*)::int AS n FROM users WHERE role='super_user' AND status='active' AND id <> $1", [id])).rows[0].n;
      if (others < 1) throw new HttpError("Minimal harus ada satu Super User aktif.", 409);
    }
    await client.query("UPDATE users SET role = $1, updated_at = now() WHERE id = $2", [role, id]);
    await endAllSessions(client, id, "revoked"); // paksa login ulang dengan hak akses baru
    await logActivity(client, { actorId: req.user.userId, actorRole: req.user.role, action: "role_changed", targetUserId: id, detail: { from: t.role, to: role }, ip: clientIp(req) });
    await client.query("COMMIT");
    return { success: true, role };
  } catch (e) { try { await client.query("ROLLBACK"); } catch (_) {} throw e; }
  finally { client.release(); }
}));

/* ---------- Permintaan reset password ---------- */
async function expireResets() {
  await pool.query(`UPDATE password_reset_requests SET status = 'expired', token_hash = NULL, updated_at = now()
                     WHERE status = 'approved' AND token_expires_at <= now()`);
}
const newToken = () => {
  const token = crypto.randomBytes(32).toString("hex");
  return { token, hash: crypto.createHash("sha256").update(token).digest("hex") };
};
const RESET_MIN = Number(process.env.RESET_TOKEN_MINUTES) > 0 ? Number(process.env.RESET_TOKEN_MINUTES) : 60;
const resetPath = (token) => `reset-password.html?token=${token}`;

router.get("/reset-requests", wrap(async (req) => {
  await expireResets();
  const { page, pageSize, offset } = paging(req.query);
  const where = [], p = [];
  if (req.query.status) {
    if (!["pending", "processing", "approved", "completed", "rejected", "expired"].includes(req.query.status)) throw new HttpError("Filter status tidak valid.");
    p.push(req.query.status); where.push(`r.status = $${p.length}`);
  }
  if (req.query.search && String(req.query.search).trim()) {
    p.push(like(req.query.search)); where.push(`(u.name ILIKE $${p.length} OR u.email ILIKE $${p.length})`);
  }
  const w = where.length ? "WHERE " + where.join(" AND ") : "";
  const total = (await pool.query(`SELECT COUNT(*)::int AS n FROM password_reset_requests r JOIN users u ON u.id = r.user_id ${w}`, p)).rows[0].n;
  const rows = (await pool.query(
    `SELECT r.id, r.status, r.source, r.identity_verified, r.note, r.created_at, r.updated_at, r.token_expires_at,
            u.id AS user_id, u.name, u.email, u.phone, u.role, h.name AS handled_by_name
       FROM password_reset_requests r JOIN users u ON u.id = r.user_id LEFT JOIN users h ON h.id = r.handled_by
       ${w} ORDER BY CASE r.status WHEN 'pending' THEN 0 WHEN 'processing' THEN 1 WHEN 'approved' THEN 2 ELSE 3 END, r.created_at DESC
       LIMIT ${pageSize} OFFSET ${offset}`, p)).rows;
  return { rows, total, page, pageSize };
}));

router.patch("/reset-requests/:id", wrap(async (req) => {
  const id = uuidParam(req.params.id);
  const action = String(req.body.action || "");
  const note = String(req.body.note || "").trim().slice(0, 500);
  if (!["process", "approve", "reject", "complete"].includes(action)) throw new HttpError("Aksi tidak valid.");
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const r = (await client.query(
      `SELECT r.*, u.role AS user_role, u.status AS user_status FROM password_reset_requests r JOIN users u ON u.id = r.user_id WHERE r.id = $1 FOR UPDATE OF r`, [id])).rows[0];
    if (!r) throw new HttpError("Permintaan tidak ditemukan.", 404);
    if (r.user_role === "super_user") throw new HttpError("Reset password Super User tidak dapat diproses dari dashboard.", 403);
    const open = ["pending", "processing", "approved"];
    if (!open.includes(r.status)) throw new HttpError("Permintaan ini sudah ditutup.", 409);
    let result = { success: true };
    if (action === "process") {
      if (r.status !== "pending") throw new HttpError("Hanya permintaan Pending yang dapat diproses.", 409);
      await client.query("UPDATE password_reset_requests SET status='processing', handled_by=$2, updated_at=now() WHERE id=$1", [id, req.user.userId]);
    } else if (action === "approve") {
      if (r.user_status === "blocked") throw new HttpError("Akun diblokir; aktifkan kembali sebelum menyetujui reset.", 409);
      if (!r.identity_verified && req.body.force !== true) {
        throw new HttpError("Nomor telepon yang diisi pemohon TIDAK cocok dengan data akun. Verifikasi identitas secara manual, lalu setujui dengan konfirmasi.", 409);
      }
      const t = newToken();
      await client.query(
        `UPDATE password_reset_requests SET status='approved', token_hash=$2, token_expires_at = now() + ($3::int * interval '1 minute'),
                token_used_at=NULL, handled_by=$4, note=COALESCE(NULLIF($5,''), note), updated_at=now() WHERE id=$1`,
        [id, t.hash, RESET_MIN, req.user.userId, note]);
      // Token asli hanya ditampilkan SEKALI di respons ini; di database hanya hash-nya.
      result = { success: true, resetPath: resetPath(t.token), expiresInMinutes: RESET_MIN };
    } else if (action === "reject") {
      await client.query("UPDATE password_reset_requests SET status='rejected', token_hash=NULL, handled_by=$2, note=COALESCE(NULLIF($3,''), note), updated_at=now() WHERE id=$1", [id, req.user.userId, note]);
    } else if (action === "complete") {
      if (r.status !== "approved") throw new HttpError("Hanya permintaan yang sudah disetujui yang dapat diselesaikan manual.", 409);
      await client.query("UPDATE password_reset_requests SET status='completed', token_hash=NULL, handled_by=$2, note=COALESCE(NULLIF($3,''), note), updated_at=now() WHERE id=$1", [id, req.user.userId, note]);
    }
    await logActivity(client, { actorId: req.user.userId, actorRole: req.user.role, action: `password_reset_${action}`, targetUserId: r.user_id,
      detail: { request_id: id, identity_verified: r.identity_verified }, ip: clientIp(req) });
    await client.query("COMMIT");
    return result;
  } catch (e) { try { await client.query("ROLLBACK"); } catch (_) {} throw e; }
  finally { client.release(); }
}));

// Bantu akun yang tidak punya jalur "lupa password" (mis. Admin Penjualan): buat tautan reset oleh operator.
router.post("/users/:id/reset-link", wrap(async (req) => {
  const id = uuidParam(req.params.id);
  if (id === req.user.userId) throw new HttpError("Ubah password sendiri melalui Profil Operator.", 403);
  const t = (await pool.query("SELECT id, role, status FROM users WHERE id = $1", [id])).rows[0];
  if (!t) throw new HttpError("Pengguna tidak ditemukan.", 404);
  if (t.role === "super_user") throw new HttpError("Reset password Super User tidak dapat dilakukan dari dashboard.", 403);
  if (t.status === "blocked") throw new HttpError("Akun diblokir; aktifkan kembali sebelum membuat tautan reset.", 409);
  const tok = newToken();
  await pool.query(
    `INSERT INTO password_reset_requests (user_id, status, source, identity_verified, token_hash, token_expires_at, handled_by)
     VALUES ($1,'approved','operator',true,$2, now() + ($3::int * interval '1 minute'), $4)
     ON CONFLICT (user_id) WHERE status IN ('pending','processing','approved')
     DO UPDATE SET status='approved', source='operator', identity_verified=true, token_hash=EXCLUDED.token_hash,
        token_expires_at=EXCLUDED.token_expires_at, token_used_at=NULL, handled_by=EXCLUDED.handled_by, updated_at=now()`,
    [id, tok.hash, RESET_MIN, req.user.userId]);
  await audit(req, "password_reset_link_issued", id, { source: "operator" });
  return { success: true, resetPath: resetPath(tok.token), expiresInMinutes: RESET_MIN };
}));

/* ---------- riwayat aktivitas ---------- */
router.get("/activity", wrap(async (req) => {
  await sweepSessions();
  const { page, pageSize, offset } = paging(req.query, 20);
  const where = [], p = [];
  if (req.query.action) { p.push(String(req.query.action).slice(0, 50)); where.push(`a.action = $${p.length}`); }
  if (req.query.group === "auth") where.push(`a.action IN ('login','logout','login_failed','login_denied','session_timeout','session_expired','register')`);
  if (req.query.from && !isNaN(Date.parse(req.query.from))) { p.push(req.query.from); where.push(`a.created_at >= $${p.length}::timestamptz`); }
  if (req.query.to && !isNaN(Date.parse(req.query.to))) { p.push(req.query.to); where.push(`a.created_at < ($${p.length}::timestamptz + interval '1 day')`); }
  if (req.query.search && String(req.query.search).trim()) {
    p.push(like(req.query.search));
    where.push(`(au.name ILIKE $${p.length} OR au.email ILIKE $${p.length} OR tu.name ILIKE $${p.length} OR tu.email ILIKE $${p.length} OR COALESCE(a.detail->>'email','') ILIKE $${p.length})`);
  }
  const w = where.length ? "WHERE " + where.join(" AND ") : "";
  const from = `FROM activity_logs a LEFT JOIN users au ON au.id = a.actor_id LEFT JOIN users tu ON tu.id = a.target_user_id ${w}`;
  const total = (await pool.query(`SELECT COUNT(*)::int AS n ${from}`, p)).rows[0].n;
  const rows = (await pool.query(
    `SELECT a.id, a.action, a.actor_role, a.detail, a.ip, a.created_at,
            au.name AS actor_name, au.email AS actor_email, tu.name AS target_name, tu.email AS target_email
       ${from} ORDER BY a.created_at DESC, a.id DESC LIMIT ${pageSize} OFFSET ${offset}`, p)).rows;
  return { rows, total, page, pageSize };
}));

/* ---------- ringkasan dashboard ---------- */
router.get("/overview", wrap(async () => {
  await sweepSessions(); await expireResets();
  const w = Number(ONLINE_WINDOW_MINUTES);
  const one = async (sql) => (await pool.query(sql)).rows[0];
  const [users, online, auth, resets, orders, recent, latestUsers] = await Promise.all([
    one(`SELECT COUNT(*)::int AS total,
                COUNT(*) FILTER (WHERE role='user')::int AS customers,
                COUNT(*) FILTER (WHERE role='sales_admin')::int AS sales_admins,
                COUNT(*) FILTER (WHERE role='super_user')::int AS super_users,
                COUNT(*) FILTER (WHERE status='active')::int AS active,
                COUNT(*) FILTER (WHERE status='disabled')::int AS disabled,
                COUNT(*) FILTER (WHERE status='blocked')::int AS blocked,
                COUNT(*) FILTER (WHERE created_at > now() - interval '7 days')::int AS new_7d FROM users`),
    one(`SELECT COUNT(DISTINCT user_id)::int AS online FROM user_sessions WHERE ended_at IS NULL AND expires_at > now() AND last_seen_at > now() - interval '${w} minutes'`),
    one(`SELECT COUNT(*) FILTER (WHERE action='login' AND created_at > date_trunc('day', now()))::int AS logins_today,
                COUNT(*) FILTER (WHERE action='login_failed' AND created_at > now() - interval '24 hours')::int AS failed_24h FROM activity_logs`),
    one(`SELECT COUNT(*) FILTER (WHERE status='pending')::int AS pending, COUNT(*) FILTER (WHERE status='processing')::int AS processing,
                COUNT(*) FILTER (WHERE status='approved')::int AS approved FROM password_reset_requests`),
    one(`SELECT COUNT(*)::int AS total, COUNT(*) FILTER (WHERE payment_status='paid')::int AS paid FROM orders`),
    pool.query(`SELECT a.action, a.actor_role, a.created_at, au.name AS actor_name, tu.name AS target_name, a.detail
                  FROM activity_logs a LEFT JOIN users au ON au.id=a.actor_id LEFT JOIN users tu ON tu.id=a.target_user_id
                 ORDER BY a.created_at DESC, a.id DESC LIMIT 8`),
    pool.query(`SELECT id, name, email, role, created_at FROM users ORDER BY created_at DESC LIMIT 5`)
  ]);
  return { users, online: online.online, auth, resets, orders, recentActivity: recent.rows, latestUsers: latestUsers.rows, onlineWindowMinutes: w };
}));

module.exports = router;
