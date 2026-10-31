// Memindahkan foto dari tabel lama user_avatars (BYTEA) ke FILE + users.avatar_url.
//   npm run migrate-avatars               -> salin file & isi avatar_url (tabel lama TIDAK dihapus)
//   npm run migrate-avatars -- --drop-table -> setelah semua terverifikasi, hapus tabel user_avatars
// Jalankan di server tempat folder AVATAR_UPLOAD_DIR bersifat PERSISTEN.
require("dotenv").config();
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const pool = require("../db/pool");
const { AVATAR_DIR } = require("../routes/profile");
const EXT = { "image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp" };

(async () => {
  const drop = process.argv.includes("--drop-table");
  const client = await pool.connect();
  try {
    const exists = (await client.query("SELECT to_regclass('public.user_avatars') AS t")).rows[0].t;
    if (!exists) { console.log("Tabel user_avatars tidak ada; tidak ada yang dimigrasikan."); return; }
    const rows = (await client.query(
      `SELECT a.user_id, a.mime_type, a.image_data FROM user_avatars a JOIN users u ON u.id = a.user_id WHERE u.avatar_url IS NULL`)).rows;
    let done = 0;
    for (const r of rows) {
      const ext = EXT[r.mime_type] || ".jpg";
      const name = `u${r.user_id.slice(0, 8)}-${Date.now()}-${crypto.randomBytes(8).toString("hex")}${ext}`;
      await fs.promises.writeFile(path.join(AVATAR_DIR, name), r.image_data, { flag: "wx" });
      await client.query("UPDATE users SET avatar_url = $1, updated_at = now() WHERE id = $2", ["/uploads/avatars/" + name, r.user_id]);
      done++;
    }
    console.log(`Foto dipindahkan ke file: ${done} (folder: ${AVATAR_DIR})`);

    // Verifikasi: setiap baris user_avatars harus punya avatar_url yang filenya ada di disk.
    const all = (await client.query(`SELECT u.id, u.avatar_url FROM user_avatars a JOIN users u ON u.id = a.user_id`)).rows;
    const missing = all.filter((x) => !x.avatar_url || !fs.existsSync(path.join(AVATAR_DIR, path.basename(x.avatar_url))));
    if (missing.length) { console.error(`Verifikasi GAGAL untuk ${missing.length} akun; tabel lama dipertahankan.`); process.exitCode = 1; return; }
    console.log(`Verifikasi OK (${all.length} foto).`);
    if (drop) { await client.query("DROP TABLE user_avatars"); console.log("Tabel user_avatars dihapus."); }
    else console.log("Tabel user_avatars masih ada. Setelah yakin, jalankan lagi dengan --drop-table.");
  } catch (err) { console.error("Migrasi foto gagal:", err.message); process.exitCode = 1; }
  finally { client.release(); await pool.end(); }
})();
