"use strict";
// Menjalankan migrasi 006 otomatis saat backend pertama kali menerima request, sehingga server yang
// sudah online (mis. Vercel) langsung memakai struktur tabel baru tanpa perlu menjalankan skrip manual.
// Aman: idempoten, satu transaksi, dikunci advisory-lock agar instance serverless tidak saling bentrok.
// Matikan dengan AUTO_MIGRATE=false bila Anda ingin menjalankan `npm run migrate` sendiri.
const fs = require("fs");
const path = require("path");
const pool = require("../db/pool");

const FILE = path.join(__dirname, "..", "db", "migrations", "006_separate_account_tables.sql");
let ready = null;

async function isMigrated(db) {
  const r = await db.query(
    `SELECT to_regclass('public.operators') IS NOT NULL AS has_operators,
            to_regclass('public.all_accounts') IS NOT NULL AS has_view,
            EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='user_sessions' AND column_name='account_id') AS sessions_ok,
            EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='activity_logs' AND column_name='target_id') AS logs_ok,
            EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='password_reset_requests' AND column_name='account_id') AS resets_ok`);
  const x = r.rows[0];
  return x.has_operators && x.has_view && x.sessions_ok && x.logs_ok && x.resets_ok;
}

async function run() {
  const client = await pool.connect();
  try {
    if (await isMigrated(client)) return true;
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(7420061)");   // satu instance saja yang migrasi
    if (!(await isMigrated(client))) {
      client.on("notice", (n) => console.log(`[migrate ${n.severity}] ${n.message}`));
      await client.query(fs.readFileSync(FILE, "utf8"));
      console.log("Migrasi 006 (pisah tabel users/admins/operators) berhasil diterapkan.");
    }
    await client.query("COMMIT");
    return true;
  } catch (err) {
    try { await client.query("ROLLBACK"); } catch (_) {}
    throw err;
  } finally { client.release(); }
}

// Dipanggil sebagai middleware: menunggu migrasi selesai sekali, lalu lolos.
function ensureSchema() {
  if (process.env.AUTO_MIGRATE === "false" || !process.env.DATABASE_URL) return Promise.resolve(true);
  if (!ready) ready = run().catch((err) => { ready = null; throw err; });  // gagal -> coba lagi di request berikutnya
  return ready;
}
const middleware = async (req, res, next) => {
  if (req.path === "/health") return next();
  try { await ensureSchema(); next(); }
  catch (err) {
    console.error("Migrasi otomatis gagal:", err.message);
    res.status(503).json({ error: "Struktur database belum siap. Jalankan 'npm run migrate' atau periksa log server." });
  }
};

module.exports = { ensureSchema, middleware, isMigrated };
