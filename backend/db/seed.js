
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


async function seedAdmin(client) {
  const email = String(
    process.env.ADMIN_EMAIL || "admin@nusaeast.id"
  ).trim().toLowerCase();

  const name = process.env.ADMIN_NAME || "Admin Nusa East";

  // Periksa apakah akun sudah ada di tabel admins
  const exists = await client.query(
    "SELECT id FROM admins WHERE LOWER(email) = $1",
    [email]
  );

  if (exists.rows[0]) {
    return {
      email,
      note: "Akun admin sudah ada, tidak diubah."
    };
  }

  // Ambil password dari environment atau buat password sementara
  let password = process.env.ADMIN_PASSWORD;
  let generated = false;

  if (!password) {
    password = crypto.randomBytes(9).toString("base64url");
    generated = true;
  }

  if (password.length < 8) {
    throw new Error("ADMIN_PASSWORD minimal 8 karakter.");
  }

  // Simpan admin ke tabel admins
  await client.query(
    `INSERT INTO admins (name, email, password_hash)
     VALUES ($1, $2, $3)`,
    [
      name,
      email,
      await bcrypt.hash(password, 12)
    ]
  );

  return {
    email,
    password: generated ? password : null,
    note: "Akun admin berhasil dibuat di tabel admins."
  };
}


(async () => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const sql = fs.readFileSync(path.join(__dirname, "migrations", "003_admin_services.sql"), "utf8");
    await client.query(sql);
    const added = await seedCatalog(client);
    const admin = await seedAdmin(client);
    await client.query("COMMIT");

    console.log(`Migrasi 003 selesai. Baris katalog baru: ${added}.`);
    console.log(`${admin.note}  Email: ${admin.email}`);
    if (admin.password) console.log(`Password sementara (catat sekarang, tidak ditampilkan lagi): ${admin.password}`);
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("Seed gagal:", err.message);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
})();
