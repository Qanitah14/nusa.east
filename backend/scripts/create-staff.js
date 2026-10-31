// Membuat / memperbarui akun internal TANPA registrasi publik.
//   npm run create-staff -- --role super_user --email op@nusaeast.id --name "Operator" [--password "..."]
//   npm run create-staff -- --role sales_admin --email sales@nusaeast.id --name "Admin Penjualan"
// Bila --password tidak diberikan, password acak dibuat dan ditampilkan SEKALI.
require("dotenv").config();
const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const pool = require("../db/pool");
const V = require("../utils/validators");

function arg(name) { const i = process.argv.indexOf("--" + name); return i > -1 ? process.argv[i + 1] : undefined; }

(async () => {
  try {
    const role = arg("role");
    if (!["super_user", "sales_admin"].includes(role)) throw new Error("--role harus super_user atau sales_admin");
    const email = V.validateEmail(arg("email")), name = V.validateName(arg("name") || (role === "super_user" ? "Operator Nusa East" : "Admin Penjualan"));
    if (!email.ok) throw new Error(email.error);
    if (!name.ok) throw new Error(name.error);
    let password = arg("password"), generated = false;
    if (!password) { password = crypto.randomBytes(12).toString("base64url"); generated = true; }
    const pw = V.validatePassword(password);
    if (!pw.ok) throw new Error(pw.error);
    const hash = await bcrypt.hash(pw.value, 12);

    const ex = (await pool.query("SELECT id, role FROM users WHERE LOWER(email) = $1", [email.value])).rows[0];
    if (ex && ex.role === "user" && arg("convert") !== "yes") {
      throw new Error("Email ini milik akun pelanggan. Gunakan email lain, atau tambahkan --convert yes untuk menjadikannya akun internal.");
    }
    if (ex) {
      await pool.query("UPDATE users SET role=$2, status='active', password_hash=$3, name=$4, updated_at=now() WHERE id=$1", [ex.id, role, hash, name.value]);
      await pool.query("UPDATE user_sessions SET ended_at=now(), end_reason='revoked' WHERE user_id=$1 AND ended_at IS NULL", [ex.id]);
    } else {
      await pool.query("INSERT INTO users (name,email,password_hash,role,status) VALUES ($1,$2,$3,$4,'active')", [name.value, email.value, hash, role]);
    }
    await pool.query("INSERT INTO activity_logs (action, actor_role, detail) VALUES ('staff_provisioned_cli', 'system', $1)", [JSON.stringify({ email: email.value, role })]);
    console.log(`${ex ? "Akun diperbarui" : "Akun dibuat"}: ${email.value} (${role})`);
    if (generated) console.log(`Password sementara (catat sekarang, tidak ditampilkan lagi): ${password}`);
  } catch (err) { console.error("Gagal:", err.message); process.exitCode = 1; }
  finally { await pool.end(); }
})();
