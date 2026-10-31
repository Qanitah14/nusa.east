
require("dotenv").config();
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const pool = require("./pool");

function loadFrontendData() {
  const file = path.join(__dirname, "..", "..", "js", "data.js");
  const code = fs.readFileSync(file, "utf8") + "\n;NUSAEAST_DATA;";
  return vm.runInNewContext(code, {});
}

async function seedCatalog(client) {
  const data = loadFrontendData();
  let added = 0;

  for (const [i, s] of data.services.entries()) {
    const r = await client.query(
      `INSERT INTO services (id, name, billing_type, description, tag, icon, duration_label, sort_order, is_active)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,true) ON CONFLICT (id) DO NOTHING`,
      [s.id, s.name, s.type, s.short, s.tag, s.icon, data.packages[s.id]?.durationLabel || "", i + 1]);
    added += r.rowCount;
  }

  for (const [sid, group] of Object.entries(data.packages)) {
    for (const [i, t] of group.tiers.entries()) {
      const r = await client.query(
        `INSERT INTO packages (id, service_id, tier_name, price, eta_label, revision_limit, details, fit_text, is_highlighted, sort_order, is_active)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,true) ON CONFLICT (id) DO NOTHING`,
        [t.id, sid, t.name, t.price, t.eta || "", 1, JSON.stringify(t.rows), t.fit || "", !!t.highlight, i + 1]);
      added += r.rowCount;
    }
  }

  for (const [i, g] of data.singles.entries()) {
    const r = await client.query(
      `INSERT INTO single_services (id, service_id, name, unit_label, price, sort_order, is_active)
       VALUES ($1,$2,$3,$4,$5,$6,true) ON CONFLICT (id) DO NOTHING`,
      [g.id, g.service, g.name, g.unit, g.price, i + 1]);
    added += r.rowCount;
  }
  return added;
}


// Akun internal dibuat di tabel users (role sales_admin / super_user) — tanpa registrasi publik.
async function seedStaff(client, { role, emailEnv, nameEnv, passEnv, defaultEmail, defaultName }) {
  const email = String(process.env[emailEnv] || defaultEmail).trim().toLowerCase();
  const name = process.env[nameEnv] || defaultName;
  const exists = await client.query("SELECT id, role FROM users WHERE LOWER(email) = $1", [email]);
  let password = process.env[passEnv];
  let generated = false;
  if (!password) { password = crypto.randomBytes(9).toString("base64url"); generated = true; }
  if (password.length < 8) throw new Error(`${passEnv} minimal 8 karakter.`);
  const hash = await bcrypt.hash(password, 12);

  if (exists.rows[0]) {
    const current = exists.rows[0];
    // Do not silently turn a customer account into staff or vice versa.
    if (current.role !== role) {
      throw new Error(`Email ${email} sudah terdaftar dengan role '${current.role}', bukan '${role}'. Gunakan email internal yang berbeda atau lakukan perubahan role secara sengaja melalui prosedur admin.`);
    }
    // When an explicit ENV password is configured, synchronize its bcrypt hash
    // so the credentials in Vercel and the database stay aligned.
    if (process.env[passEnv]) {
      await client.query(
        `UPDATE users SET name=$1, password_hash=$2, status='active', updated_at=now() WHERE id=$3`,
        [name, hash, current.id]
      );
      return { email, role, note: `Akun ${role} disinkronkan dengan ENV ${passEnv}.` };
    }
    return { email, role, note: `Akun ${email} sudah ada (role: ${current.role}); password tidak diubah karena ${passEnv} belum diatur.` };
  }

  await client.query(
    `INSERT INTO users (name, email, password_hash, role, status) VALUES ($1, $2, $3, $4, 'active')`,
    [name, email, hash, role]
  );
  return { email, role, password: generated ? password : null, note: `Akun ${role} dibuat.` };
}

(async () => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const sql = fs.readFileSync(path.join(__dirname, "migrations", "003_admin_services.sql"), "utf8");
    await client.query(sql);
    const added = await seedCatalog(client);
    await client.query(fs.readFileSync(path.join(__dirname, "migrations", "005_rbac_sessions_reset.sql"), "utf8"));
    const staff = [
      await seedStaff(client, { role: "sales_admin", emailEnv: "ADMIN_EMAIL", nameEnv: "ADMIN_NAME", passEnv: "ADMIN_PASSWORD", defaultEmail: "admin@nusaeast.id", defaultName: "Admin Penjualan" }),
      await seedStaff(client, { role: "super_user", emailEnv: "SUPER_EMAIL", nameEnv: "SUPER_NAME", passEnv: "SUPER_PASSWORD", defaultEmail: "operator@nusaeast.id", defaultName: "Operator Nusa East" })
    ];
    await client.query("COMMIT");

    console.log(`Migrasi 003 selesai. Baris katalog baru: ${added}.`);
    for (const a of staff) {
      console.log(`${a.note}  Email: ${a.email}`);
      if (a.password) console.log(`  Password sementara ${a.role} (catat sekarang, tidak ditampilkan lagi): ${a.password}`);
    }
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("Seed gagal:", err.message);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
})();
