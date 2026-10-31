"use strict";
// Uji RBAC & validasi TANPA database sungguhan: pool.query/connect di-stub, sedangkan
// Express, middleware, route, JWT, dan bcrypt yang dipakai adalah kode asli.
process.env.JWT_SECRET = "test-secret-test-secret-test-secret";
process.env.NODE_ENV = "test";
const test = require("node:test");
const assert = require("node:assert/strict");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const http = require("http");

const pool = require("../db/pool");
const log = []; // semua SQL yang dijalankan
const sessions = new Map(); // sid -> baris sesi+user
const loginUsers = new Map(); // email -> baris user (untuk /login)

function fakeQuery(sql, params = []) {
  log.push({ sql, params });
  if (/FROM user_sessions s JOIN users u/.test(sql)) {
    const row = sessions.get(params[0]);
    return Promise.resolve({ rows: row ? [row] : [], rowCount: row ? 1 : 0 });
  }
  if (/FROM users WHERE LOWER\(email\) = \$1/.test(sql) && /password_hash/.test(sql)) {
    const u = loginUsers.get(params[0]);
    return Promise.resolve({ rows: u ? [u] : [], rowCount: u ? 1 : 0 });
  }
  if (/FROM users WHERE LOWER\(email\) = \$1 AND role = 'user'/.test(sql)) return Promise.resolve({ rows: [], rowCount: 0 });
  if (/INSERT INTO user_sessions/.test(sql)) return Promise.resolve({ rows: [{ id: "00000000-0000-4000-8000-0000000000aa", expires_at: new Date(Date.now() + 3600e3) }], rowCount: 1 });
  if (/FROM users WHERE id = \$1/.test(sql)) return Promise.resolve({ rows: [{ id: params[0], name: "X", email: "x@x.id", role: "user", status: "active" }], rowCount: 1 });
  return Promise.resolve({ rows: [], rowCount: 0 });
}
pool.query = fakeQuery;
pool.connect = async () => ({
  query: async (sql, params) => {
    if (/^(BEGIN|COMMIT|ROLLBACK)/.test(sql)) return { rows: [], rowCount: 0 };
    if (/INSERT INTO users/.test(sql)) {
      log.push({ sql, params, client: true });
      return { rows: [{ id: "11111111-1111-4111-8111-111111111111", name: params[0], email: params[1], role: "user", status: "active", phone: params[2], address: params[3], created_at: new Date() }], rowCount: 1 };
    }
    return fakeQuery(sql, params);
  },
  release() {}
});

const app = require("../server");
let server, base;
test.before(async () => {
  server = http.createServer(app);
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  base = `http://127.0.0.1:${server.address().port}`;
});
test.after(() => server.close());

const ID = { user: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", sales: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", super: "cccccccc-cccc-4ccc-8ccc-cccccccccccc" };
function makeSession(role, over = {}) {
  const sid = require("crypto").randomUUID();
  const uid = { user: ID.user, sales_admin: ID.sales, super_user: ID.super }[role];
  sessions.set(sid, { sid, ended_at: null, end_reason: null, expired: false, idle_sec: 5, id: uid, name: role, email: role + "@x.id", role, status: "active", ...over });
  return { token: jwt.sign({ userId: uid, sid }, process.env.JWT_SECRET, { expiresIn: 600 }), uid, sid };
}
const call = (path, { method = "GET", token, body } = {}) => fetch(base + path, {
  method, headers: { "Content-Type": "application/json", ...(token ? { Authorization: "Bearer " + token } : {}) },
  body: body ? JSON.stringify(body) : undefined
});

/* ---------- RBAC ---------- */
const OPERATOR_ENDPOINTS = ["/api/operator/overview", "/api/operator/users", "/api/operator/customers", "/api/operator/activity", "/api/operator/reset-requests"];
const SALES_ENDPOINTS = ["/api/orders/admin/all", "/api/services/admin/stats", "/api/services/admin/services"];

test("tanpa token: semua endpoint terlindungi menolak (401)", async () => {
  for (const p of [...OPERATOR_ENDPOINTS, ...SALES_ENDPOINTS, "/api/profile", "/api/orders/mine", "/api/auth/me"]) {
    assert.equal((await call(p)).status, 401, p);
  }
});

test("token lama tanpa sid / token palsu ditolak", async () => {
  const noSid = jwt.sign({ userId: ID.user, role: "super_user" }, process.env.JWT_SECRET);
  assert.equal((await call("/api/operator/overview", { token: noSid })).status, 401);
  const forged = jwt.sign({ userId: ID.user, sid: "x", role: "super_user" }, "secret-lain");
  assert.equal((await call("/api/operator/overview", { token: forged })).status, 401);
});

test("pengguna biasa: dilarang ke endpoint operator & admin penjualan (403)", async () => {
  const { token } = makeSession("user");
  for (const p of [...OPERATOR_ENDPOINTS, ...SALES_ENDPOINTS]) assert.equal((await call(p, { token })).status, 403, p);
});

test("role di token tidak dipercaya: role diambil dari database", async () => {
  const sid = require("crypto").randomUUID();
  sessions.set(sid, { sid, ended_at: null, expired: false, idle_sec: 1, id: ID.user, name: "u", email: "u@x.id", role: "user", status: "active" });
  const token = jwt.sign({ userId: ID.user, sid, role: "super_user" }, process.env.JWT_SECRET); // klaim role palsu
  assert.equal((await call("/api/operator/overview", { token })).status, 403);
});

test("Admin Penjualan: ditolak di endpoint Super User, diizinkan di endpoint penjualan", async () => {
  const { token } = makeSession("sales_admin");
  for (const p of OPERATOR_ENDPOINTS) assert.equal((await call(p, { token })).status, 403, p);
  assert.notEqual((await call("/api/orders/admin/all", { token })).status, 403);
  assert.notEqual((await call("/api/orders/admin/all", { token })).status, 401);
});

test("Super User: boleh ke endpoint operator, tidak ke endpoint penjualan/pelanggan", async () => {
  const { token } = makeSession("super_user");
  assert.notEqual((await call("/api/operator/users", { token })).status, 403);
  assert.equal((await call("/api/orders/admin/all", { token })).status, 403);
  assert.equal((await call("/api/orders/mine", { token })).status, 403);
  assert.equal((await call("/api/profile", { token })).status, 403);
});

test("Admin Penjualan tidak bisa membuat pesanan/profil pelanggan", async () => {
  const { token } = makeSession("sales_admin");
  assert.equal((await call("/api/orders", { method: "POST", token, body: { items: [] } })).status, 403);
  assert.equal((await call("/api/profile", { token })).status, 403);
});

test("sesi berakhir / idle / kedaluwarsa ditolak (401)", async () => {
  assert.equal((await call("/api/auth/me", { token: makeSession("user", { ended_at: new Date() }).token })).status, 401);
  assert.equal((await call("/api/auth/me", { token: makeSession("user", { expired: true }).token })).status, 401);
  assert.equal((await call("/api/auth/me", { token: makeSession("user", { idle_sec: 99 * 3600 }).token })).status, 401);
  assert.equal((await call("/api/operator/overview", { token: makeSession("super_user", { idle_sec: 31 * 60 }).token })).status, 401); // batas idle operator 30 menit
});

test("akun dinonaktifkan / diblokir ditolak (403) dan sesinya dicabut", async () => {
  for (const status of ["disabled", "blocked"]) {
    const { token } = makeSession("user", { status });
    const before = log.length;
    assert.equal((await call("/api/auth/me", { token })).status, 403);
    assert.ok(log.slice(before).some((l) => /UPDATE user_sessions SET ended_at = now\(\), end_reason = \$2/.test(l.sql) && l.params[1] === "revoked"));
  }
});

test("operator tidak dapat mengubah status/role akun sendiri", async () => {
  const { token, uid } = makeSession("super_user");
  assert.equal((await call(`/api/operator/users/${uid}/status`, { method: "PATCH", token, body: { status: "blocked" } })).status, 403);
  assert.equal((await call(`/api/operator/users/${uid}/role`, { method: "PATCH", token, body: { role: "user" } })).status, 403);
});

test("ID tidak valid & aksi tidak valid ditolak (400)", async () => {
  const { token } = makeSession("super_user");
  assert.equal((await call("/api/operator/users/bukan-uuid", { token })).status, 400);
  assert.equal((await call(`/api/operator/reset-requests/${ID.user}`, { method: "PATCH", token, body: { action: "hapus-semua" } })).status, 400);
  assert.equal((await call("/api/operator/staff", { method: "POST", token, body: { role: "super_user", name: "A", email: "bukan-email", password: "12345678" } })).status, 400);
  assert.equal((await call("/api/operator/staff", { method: "POST", token, body: { role: "user", name: "Abc", email: "a@b.id", password: "12345678" } })).status, 400);
});

/* ---------- login terpisah per role ---------- */
test("login: pintu pengguna menolak akun internal & sebaliknya, dengan pesan sama", async () => {
  const hash = bcrypt.hashSync("Password123", 4);
  const mk = (role) => ({ id: ID.user, name: "N", email: role + "@x.id", role, status: "active", password_hash: hash, phone: "", address: "", avatar_url: null, created_at: new Date() });
  loginUsers.set("user@x.id", mk("user")); loginUsers.set("sales@x.id", mk("sales_admin")); loginUsers.set("super@x.id", mk("super_user"));
  const login = (path, email) => call(path, { method: "POST", body: { email, password: "Password123" } });

  assert.equal((await login("/api/auth/login", "user@x.id")).status, 200);
  assert.equal((await login("/api/auth/admin-login", "sales@x.id")).status, 200);
  assert.equal((await login("/api/auth/operator-login", "super@x.id")).status, 200);

  const bad = [["/api/auth/login", "sales@x.id"], ["/api/auth/login", "super@x.id"], ["/api/auth/admin-login", "user@x.id"],
               ["/api/auth/admin-login", "super@x.id"], ["/api/auth/operator-login", "sales@x.id"], ["/api/auth/operator-login", "user@x.id"]];
  const msgs = new Set();
  for (const [p, e] of bad) { const r = await login(p, e); assert.equal(r.status, 401, p + " " + e); msgs.add((await r.json()).error); }
  assert.equal(msgs.size, 1, "pesan kegagalan harus identik agar tidak membocorkan akun internal");
  const wrongPw = await call("/api/auth/login", { method: "POST", body: { email: "user@x.id", password: "salah" } });
  assert.equal(wrongPw.status, 401);
  assert.deepEqual([...msgs], [(await wrongPw.json()).error]);
});

test("login: akun nonaktif/diblokir tidak mendapat token", async () => {
  const hash = bcrypt.hashSync("Password123", 4);
  loginUsers.set("off@x.id", { id: ID.user, name: "N", email: "off@x.id", role: "user", status: "disabled", password_hash: hash, created_at: new Date() });
  const r = await call("/api/auth/login", { method: "POST", body: { email: "off@x.id", password: "Password123" } });
  assert.equal(r.status, 403);
  assert.equal((await r.json()).token, undefined);
});

test("login: pembatas percobaan (429 setelah 5 gagal)", async () => {
  let last;
  for (let i = 0; i < 7; i++) last = await call("/api/auth/login", { method: "POST", body: { email: "brute@x.id", password: "x" + i } });
  assert.equal(last.status, 429);
});

/* ---------- registrasi ---------- */
const validReg = { name: "Budi Santoso", email: "budi@example.com", phone: "081234567890", address: "Jl. Perintis Kemerdekaan No. 10, Makassar", password: "Password123" };
test("registrasi valid: role dipaksa 'user' walau body mengirim role admin", async () => {
  log.length = 0;
  const r = await call("/api/auth/register", { method: "POST", body: { ...validReg, email: "r1@example.com", role: "super_user", status: "blocked" } });
  assert.equal(r.status, 201);
  const body = await r.json();
  assert.equal(body.user.role, "user");
  const ins = log.find((l) => l.client && /INSERT INTO users/.test(l.sql));
  assert.ok(/'user','active'/.test(ins.sql), "role & status ditetapkan literal di SQL");
  assert.ok(!ins.params.includes("super_user") && !ins.params.includes("blocked"));
  assert.notEqual(ins.params[4], validReg.password, "password harus berupa hash");
  assert.match(ins.params[4], /^\$2[aby]\$/);
});

test("registrasi: nomor telepon menolak huruf & karakter non-angka", async () => {
  for (const phone of ["08abc12345", "+62812345678", "0812-3456-789", "0812 3456 789", "08123", "0812345678901234567", ""]) {
    const r = await call("/api/auth/register", { method: "POST", body: { ...validReg, email: "p@example.com", phone } });
    assert.equal(r.status, 400, "phone=" + phone);
  }
});
test("registrasi: nomor dengan 0 di depan disimpan sebagai string utuh", async () => {
  log.length = 0;
  await call("/api/auth/register", { method: "POST", body: { ...validReg, email: "z@example.com", phone: "0812345678" } });
  const ins = log.find((l) => l.client && /INSERT INTO users/.test(l.sql));
  assert.strictEqual(ins.params[2], "0812345678");
});
test("registrasi: validasi email, alamat, password", async () => {
  for (const patch of [{ email: "salah" }, { address: "" }, { address: "abc" }, { password: "pendek" }, { name: "A" }]) {
    assert.equal((await call("/api/auth/register", { method: "POST", body: { ...validReg, ...patch } })).status, 400, JSON.stringify(patch));
  }
});

/* ---------- lupa & reset password ---------- */
test("lupa password: respons sama untuk email terdaftar/tidak (tidak membocorkan akun)", async () => {
  const r = await call("/api/auth/forgot-password", { method: "POST", body: { email: "tidakada@example.com", phone: "081234567890" } });
  assert.equal(r.status, 202);
  assert.equal((await call("/api/auth/forgot-password", { method: "POST", body: { email: "x", phone: "081234567890" } })).status, 400);
  assert.equal((await call("/api/auth/forgot-password", { method: "POST", body: { email: "a@b.id", phone: "abc" } })).status, 400);
});
test("reset password: token tidak valid ditolak; password lemah ditolak", async () => {
  assert.equal((await call("/api/auth/reset-password", { method: "POST", body: { token: "abc", newPassword: "Password123" } })).status, 400);
  assert.equal((await call("/api/auth/reset-password", { method: "POST", body: { token: "a".repeat(64), newPassword: "short" } })).status, 400);
  assert.equal((await call("/api/auth/reset-password", { method: "POST", body: { token: "a".repeat(64), newPassword: "Password123" } })).status, 400); // hash tidak ada di DB
});
test("tidak ada endpoint registrasi admin publik", async () => {
  for (const p of ["/api/auth/admin-register", "/api/auth/operator-register", "/api/auth/staff-register"]) {
    assert.equal((await call(p, { method: "POST", body: { name: "x", email: "x@x.id", password: "Password123", registrationKey: "k", role: "super_user" } })).status, 404, p);
  }
});

/* ---------- validator unit ---------- */
test("validators", () => {
  const V = require("../utils/validators");
  assert.equal(V.validatePhone("081234567890").ok, true);
  assert.equal(V.validatePhone("08123abc").ok, false);
  assert.equal(V.normalizePhone("+62 812-3456-7890"), "081234567890");
  assert.equal(V.validateEmail(" A@B.CO ").value, "a@b.co");
  assert.equal(V.validatePassword("x".repeat(73)).ok, false);
});
