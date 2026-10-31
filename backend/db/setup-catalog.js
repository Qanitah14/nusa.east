require("dotenv").config();
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const pool = require("./pool");

async function main() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL belum diatur. Isi backend/.env terlebih dahulu.");
  }

  for (const migrationFile of ["001_catalog_admin_columns.sql", "002_single_product_details_reviews.sql", "003_admin_services.sql", "004_service_images.sql"]) {
    const migration = fs.readFileSync(path.join(__dirname, "migrations", migrationFile), "utf8");
    await pool.query(migration);
  }
  console.log("Skema katalog dan ulasan produk berhasil diselaraskan.");

  const dataPath = path.resolve(__dirname, "../../js/data.js");
  let source = fs.readFileSync(dataPath, "utf8");
  source = source.replace("const NUSAEAST_DATA =", "globalThis.NUSAEAST_DATA =");
  const sandbox = {};
  vm.runInNewContext(source, sandbox, { filename: dataPath, timeout: 2000 });
  const data = sandbox.NUSAEAST_DATA;
  if (!data || !Array.isArray(data.services) || !data.packages) {
    throw new Error("Data katalog dari js/data.js tidak dapat dibaca. Tidak ada data yang diubah.");
  }

  const client = await pool.connect();
  let counts = { services: 0, packages: 0, singles: 0, addons: 0 };
  try {
    await client.query("BEGIN");

    for (let i = 0; i < data.services.length; i++) {
      const s = data.services[i];
      const duration = data.packages[s.id]?.durationLabel || "";
      const imageMap = {
        smm: "/images/service-social.jpg",
        content: "/images/service-content.jpg",
        ecommerce: "/images/service-ecommerce.jpg",
        brand: "/images/service-brand.jpg"
      };
      const result = await client.query(
        `INSERT INTO services (id, name, billing_type, description, tag, icon, image_url, duration_label, sort_order, is_active)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,TRUE)
         ON CONFLICT (id) DO NOTHING`,
        [s.id, s.name, s.type || "project", s.short || "", s.tag || "", s.icon || "", imageMap[s.id] || null, duration, i + 1]
      );
      counts.services += result.rowCount;
      // Hanya isi metadata yang kosong pada data lama; nama, deskripsi, status, dan gambar yang sudah diedit tetap dipertahankan.
      await client.query(
        `UPDATE services SET
           tag = CASE WHEN tag = '' THEN $2 ELSE tag END,
           icon = CASE WHEN icon = '' THEN $3 ELSE icon END,
           duration_label = CASE WHEN duration_label = '' THEN $4 ELSE duration_label END,
           sort_order = CASE WHEN sort_order = 0 THEN $5 ELSE sort_order END
         WHERE id = $1`,
        [s.id, s.tag || "", s.icon || "", duration, i + 1]
      );
    }

    let packageOrder = 0;
    for (const service of data.services) {
      const group = data.packages[service.id];
      for (const p of (group?.tiers || [])) {
        packageOrder++;
        const result = await client.query(
          `INSERT INTO packages (id, service_id, tier_name, price, eta_label, revision_limit, details, fit_text, is_highlighted, sort_order, is_active)
           VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9,$10,TRUE)
           ON CONFLICT (id) DO NOTHING`,
          [p.id, service.id, p.name, p.price, p.eta || group.durationLabel || "", 1, JSON.stringify(p.rows || {}), p.fit || "", Boolean(p.highlight), packageOrder]
        );
        counts.packages += result.rowCount;
      }
    }

    for (let i = 0; i < (data.singles || []).length; i++) {
      const s = data.singles[i];
      const result = await client.query(
        `INSERT INTO single_services (id, service_id, name, unit_label, price, image_url, description, sort_order, is_active)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,TRUE)
         ON CONFLICT (id) DO NOTHING`,
        [s.id, s.service, s.name, s.unit || "", s.price, s.image || null, s.description || `Layanan ${s.name} dari Nusa East untuk UMKM dan brand lokal.`, i + 1]
      );
      counts.singles += result.rowCount;
      await client.query(
        `UPDATE single_services SET
           image_url = CASE WHEN image_url IS NULL OR image_url = '' THEN $2 ELSE image_url END,
           description = CASE WHEN description IS NULL OR description = '' THEN $3 ELSE description END,
           sort_order = CASE WHEN sort_order = 0 THEN $4 ELSE sort_order END
         WHERE id = $1`,
        [s.id, s.image || null, s.description || `Layanan ${s.name} dari Nusa East untuk UMKM dan brand lokal.`, i + 1]
      );
    }

    for (const a of (data.addons || [])) {
      const result = await client.query(
        `INSERT INTO addons (id, name, price, percent, note)
         VALUES ($1,$2,$3,$4,$5)
         ON CONFLICT (id) DO NOTHING`,
        [a.id, a.name, a.price ?? null, a.percent ?? null, a.note || null]
      );
      counts.addons += result.rowCount;
    }

    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }

  console.log("Katalog bawaan sudah disinkronkan tanpa menimpa item yang sudah ada.");
  console.log(`Item baru ditambahkan: layanan ${counts.services}, paket ${counts.packages}, layanan satuan ${counts.singles}, add-on ${counts.addons}.`);
  console.log("Buka Admin > Layanan / Paket / Layanan Satuan untuk mengedit data dari database.");
}

main()
  .catch((err) => {
    console.error("Gagal menyiapkan katalog:", err.message);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
