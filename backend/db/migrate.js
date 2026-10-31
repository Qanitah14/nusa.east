// Menjalankan migrasi 005 dan 006 (RBAC, sesi, log, reset password, kompatibilitas schema).
// Aman diulang. Tidak menghapus data/tabel apa pun.   Jalankan: npm run migrate
require("dotenv").config();
const fs = require("fs");
const path = require("path");
const pool = require("./pool");

(async () => {
  if (!process.env.DATABASE_URL) { console.error("DATABASE_URL belum diatur di backend/.env"); process.exit(1); }
  const client = await pool.connect();
  client.on("notice", (n) => console.log(`[${n.severity}] ${n.message}`));
  try {
    await client.query("BEGIN");
    for (const file of ["005_rbac_sessions_reset.sql", "006_auth_compatibility.sql"]) {
      const sql = fs.readFileSync(path.join(__dirname, "migrations", file), "utf8");
      await client.query(sql);
    }
    await client.query("COMMIT");
    const c = await client.query("SELECT role, COUNT(*)::int AS n FROM users GROUP BY role ORDER BY role");
    console.log("Migrasi 005 + 006 selesai. Jumlah akun per role:", c.rows.map((r) => `${r.role}=${r.n}`).join(", ") || "(kosong)");
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("Migrasi gagal, semua perubahan dibatalkan:", err.message);
    process.exitCode = 1;
  } finally { client.release(); await pool.end(); }
})();
