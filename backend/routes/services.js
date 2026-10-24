// Layanan (services), paket (packages), dan layanan satuan (single_services).
// Baca (katalog) = publik, hanya yang aktif. Ubah = admin.
const express = require("express");
const pool = require("../db/pool");
const { requireAuth, requireAdmin } = require("./auth");
const { uploadImage, removeUploadedFile } = require("../middleware/upload");
const { slugify } = require("../utils/slugify");

const router = express.Router();
const admin = [requireAuth, requireAdmin];
const serviceImage = uploadImage("service_images", "image");

class HttpError extends Error {
  constructor(message, status = 400) { super(message); this.status = status; }
}
const handle = (fallback, fn, status = 200) => async (req, res) => {
  try { res.status(status).json(await fn(req)); }
  catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    console.error(err);
    res.status(500).json({ error: fallback });
  }
};

const toBool = (v, def = true) => (v === undefined || v === null || v === "" ? def : v === true || v === "true" || v === "1" || v === "on");
const toInt = (v, def = 0) => (Number.isFinite(Number(v)) && v !== "" && v !== null && v !== undefined ? Math.trunc(Number(v)) : def);
const toPrice = (v) => (v !== undefined && v !== "" && v !== null && Number.isFinite(Number(v)) && Number(v) >= 0 ? Number(v) : null);
const BILLING = ["subscription", "project"];

/* ---------- mapper DB -> bentuk yang sama dengan NUSAEAST_DATA di frontend ---------- */
const mapService = (r) => ({
  id: r.id, name: r.name, tag: r.tag || "", type: r.billing_type, short: r.description || "",
  icon: r.icon || "", image: r.image_url || null, durationLabel: r.duration_label || "",
  sortOrder: r.sort_order, isActive: r.is_active
});
const mapPackage = (r) => ({
  id: r.id, serviceId: r.service_id, name: r.tier_name, price: Number(r.price), eta: r.eta_label || "",
  revisionLimit: r.revision_limit, rows: r.details || {}, fit: r.fit_text || "",
  highlight: r.is_highlighted, sortOrder: r.sort_order, isActive: r.is_active
});
const mapSingle = (r) => ({
  id: r.id, service: r.service_id, name: r.name, unit: r.unit_label || "", price: Number(r.price),
  image: r.image_url || null, description: r.description || "",
  rating: Number(r.average_rating || 0), reviewCount: Number(r.review_count || 0),
  sortOrder: r.sort_order, isActive: r.is_active
});

/* rows (fitur paket) dikirim sebagai objek JSON atau string JSON dari form */
function parseRows(v) {
  if (v === undefined) return undefined;
  let obj = v;
  if (typeof v === "string") {
    try { obj = JSON.parse(v || "{}"); } catch { throw new HttpError("Format fitur paket tidak valid."); }
  }
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) throw new HttpError("Fitur paket harus berupa objek.");
  const clean = {};
  for (const [k, val] of Object.entries(obj)) {
    const key = String(k).trim().slice(0, 80);
    if (!key) continue;
    clean[key] = typeof val === "boolean" ? val : String(val).slice(0, 80);
  }
  return clean;
}

async function ensureService(id) {
  const r = await pool.query("SELECT 1 FROM services WHERE id = $1", [id]);
  if (!r.rowCount) throw new HttpError("Layanan tidak ditemukan.", 404);
}

/* ======================= PUBLIK ======================= */
// GET /api/services/catalog — satu payload lengkap untuk halaman pengguna
router.get("/catalog", handle("Gagal mengambil katalog.", async () => {
  const [s, p, g] = await Promise.all([
    pool.query("SELECT * FROM services WHERE is_active = true ORDER BY sort_order, name"),
    pool.query("SELECT * FROM packages WHERE is_active = true ORDER BY sort_order, price"),
    pool.query(`SELECT ss.*, COALESCE(ss.image_url, '') AS image_url, COALESCE(ss.description, '') AS description,
      COALESCE(rv.average_rating, 0) AS average_rating, COALESCE(rv.review_count, 0) AS review_count
      FROM single_services ss
      LEFT JOIN (SELECT single_service_id, AVG(rating)::numeric(3,2) AS average_rating, COUNT(*)::int AS review_count
                 FROM single_service_reviews GROUP BY single_service_id) rv ON rv.single_service_id = ss.id
      WHERE ss.is_active = true ORDER BY ss.sort_order, ss.name`)
  ]);
  const services = s.rows.map(mapService);
  const packages = {};
  for (const svc of services) {
    packages[svc.id] = {
      durationLabel: svc.durationLabel || "Estimasi Pengerjaan per Project",
      tiers: p.rows.filter((x) => x.service_id === svc.id).map(mapPackage)
    };
  }
  const active = new Set(services.map((x) => x.id));
  return { services, packages, singles: g.rows.filter((x) => active.has(x.service_id)).map(mapSingle) };
}));

/* ======================= ADMIN: ringkasan ======================= */
router.get("/admin/stats", ...admin, handle("Gagal mengambil ringkasan.", async () => {
  const q = (sql) => pool.query(sql).then((r) => r.rows[0]);
  const [svc, pkg, sng, ord, usr] = await Promise.all([
    q("SELECT COUNT(*)::int AS total, COUNT(*) FILTER (WHERE is_active)::int AS active FROM services"),
    q("SELECT COUNT(*)::int AS total, COUNT(*) FILTER (WHERE is_active)::int AS active FROM packages"),
    q("SELECT COUNT(*)::int AS total, COUNT(*) FILTER (WHERE is_active)::int AS active FROM single_services"),
    q("SELECT COUNT(*)::int AS total, COALESCE(SUM(total) FILTER (WHERE payment_status = 'paid'), 0)::float AS revenue FROM orders"),
    q("SELECT COUNT(*)::int AS total FROM users WHERE role = 'client'")
  ]);
  const recent = await pool.query(
  `SELECT
      o.id,
      o.total,
      o.status,
      o.payment_status,
      o.created_at,
      u.name AS customer
   FROM orders o
   LEFT JOIN users u ON u.id = o.user_id
   ORDER BY o.created_at DESC
   LIMIT 5`
);
  return { services: svc, packages: pkg, singles: sng, orders: ord, clients: usr.total, recentOrders: recent.rows };
}));

/* ======================= ADMIN: services ======================= */
router.get("/admin/services", ...admin, handle("Gagal mengambil layanan.", async () => {
  const r = await pool.query(
    `SELECT s.*,
       (SELECT COUNT(*)::int FROM packages p WHERE p.service_id = s.id) AS package_count,
       (SELECT COUNT(*)::int FROM single_services g WHERE g.service_id = s.id) AS single_count
     FROM services s ORDER BY s.sort_order, s.name`);
  return r.rows.map((x) => ({ ...mapService(x), packageCount: x.package_count, singleCount: x.single_count }));
}));

router.post("/admin/services", ...admin, serviceImage, handle("Gagal menambah layanan.", async (req) => {
  const image = req.file?.publicUrl || null;
  try {
    const b = req.body;
    const name = String(b.name || "").trim();
    if (!name || name.length > 150) throw new HttpError("Nama layanan wajib diisi (maks 150 karakter).");
    const type = b.type || "project";
    if (!BILLING.includes(type)) throw new HttpError("Jenis penagihan harus subscription atau project.");
    const id = slugify(b.id || name).slice(0, 30);
    if (!id) throw new HttpError("ID layanan tidak valid.");
    const dup = await pool.query("SELECT 1 FROM services WHERE id = $1", [id]);
    if (dup.rowCount) throw new HttpError("ID layanan sudah dipakai. Ganti nama atau ID-nya.", 409);
    const max = await pool.query("SELECT COALESCE(MAX(sort_order), 0) + 1 AS n FROM services");
    const r = await pool.query(
      `INSERT INTO services (id, name, billing_type, description, tag, icon, image_url, duration_label, sort_order, is_active)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
      [id, name, type, b.short || "", b.tag || "", b.icon || "", image, b.durationLabel || "",
       b.sortOrder !== undefined ? toInt(b.sortOrder) : max.rows[0].n, toBool(b.isActive)]);
    return mapService(r.rows[0]);
  } catch (e) { removeUploadedFile(image); throw e; }
}, 201));

router.put("/admin/services/:id", ...admin, serviceImage, handle("Gagal memperbarui layanan.", async (req) => {
  const image = req.file?.publicUrl || null;
  try {
    const cur = (await pool.query("SELECT * FROM services WHERE id = $1", [req.params.id])).rows[0];
    if (!cur) throw new HttpError("Layanan tidak ditemukan.", 404);
    const b = req.body;
    const name = b.name !== undefined ? String(b.name).trim() : cur.name;
    if (!name || name.length > 150) throw new HttpError("Nama layanan tidak valid.");
    const type = b.type ?? cur.billing_type;
    if (!BILLING.includes(type)) throw new HttpError("Jenis penagihan tidak valid.");
    const removeImg = toBool(b.removeImage, false);
    const nextImage = image || (removeImg ? null : cur.image_url);
    const r = await pool.query(
      `UPDATE services SET name=$1, billing_type=$2, description=$3, tag=$4, icon=$5, image_url=$6,
         duration_label=$7, sort_order=$8, is_active=$9 WHERE id=$10 RETURNING *`,
      [name, type, b.short ?? cur.description, b.tag ?? cur.tag, b.icon ?? cur.icon, nextImage,
       b.durationLabel ?? cur.duration_label, b.sortOrder !== undefined ? toInt(b.sortOrder) : cur.sort_order,
       toBool(b.isActive, cur.is_active), cur.id]);
    if (nextImage !== cur.image_url) removeUploadedFile(cur.image_url);
    return mapService(r.rows[0]);
  } catch (e) { removeUploadedFile(image); throw e; }
}));

router.delete("/admin/services/:id", ...admin, handle("Gagal menghapus layanan.", async (req) => {
  const used = await pool.query(
    `SELECT (SELECT COUNT(*) FROM packages WHERE service_id=$1) + (SELECT COUNT(*) FROM single_services WHERE service_id=$1) AS n`,
    [req.params.id]);
  if (Number(used.rows[0].n) > 0) {
    throw new HttpError("Layanan masih punya paket/layanan satuan. Hapus itu dulu, atau nonaktifkan layanan ini.", 409);
  }
  const r = await pool.query("DELETE FROM services WHERE id = $1 RETURNING image_url", [req.params.id]);
  if (!r.rows[0]) throw new HttpError("Layanan tidak ditemukan.", 404);
  removeUploadedFile(r.rows[0].image_url);
  return { success: true };
}));

/* ======================= ADMIN: packages ======================= */
router.get("/admin/packages", ...admin, handle("Gagal mengambil paket.", async (req) => {
  const r = await pool.query(
    `SELECT * FROM packages WHERE ($1::text IS NULL OR service_id = $1) ORDER BY service_id, sort_order, price`,
    [req.query.service || null]);
  return r.rows.map(mapPackage);
}));

async function writePackage(req, existing) {
  const b = req.body;
  const serviceId = b.serviceId ?? existing?.service_id;
  if (!serviceId) throw new HttpError("Layanan wajib dipilih.");
  await ensureService(serviceId);
  const name = String(b.name ?? existing?.tier_name ?? "").trim();
  if (!name || name.length > 50) throw new HttpError("Nama paket wajib diisi (maks 50 karakter).");
  const price = b.price !== undefined ? toPrice(b.price) : Number(existing?.price);
  if (price === null || Number.isNaN(price)) throw new HttpError("Harga tidak valid.");
  const rows = parseRows(b.rows);
  return {
    serviceId, name, price,
    eta: b.eta ?? existing?.eta_label ?? "",
    revisionLimit: b.revisionLimit !== undefined ? Math.max(0, toInt(b.revisionLimit, 1)) : existing?.revision_limit ?? 1,
    rows: rows ?? existing?.details ?? {},
    fit: b.fit ?? existing?.fit_text ?? "",
    highlight: toBool(b.highlight, existing?.is_highlighted ?? false),
    sortOrder: b.sortOrder !== undefined ? toInt(b.sortOrder) : existing?.sort_order ?? 0,
    isActive: toBool(b.isActive, existing?.is_active ?? true)
  };
}

router.post("/admin/packages", ...admin, handle("Gagal menambah paket.", async (req) => {
  const p = await writePackage(req, null);
  const id = slugify(req.body.id || `${p.serviceId}-${p.name}`).slice(0, 50);
  const dup = await pool.query("SELECT 1 FROM packages WHERE id = $1", [id]);
  if (dup.rowCount) throw new HttpError("ID paket sudah dipakai. Ganti nama paketnya.", 409);
  const r = await pool.query(
    `INSERT INTO packages (id, service_id, tier_name, price, eta_label, revision_limit, details, fit_text, is_highlighted, sort_order, is_active)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
    [id, p.serviceId, p.name, p.price, p.eta, p.revisionLimit, JSON.stringify(p.rows), p.fit, p.highlight, p.sortOrder, p.isActive]);
  return mapPackage(r.rows[0]);
}, 201));

router.put("/admin/packages/:id", ...admin, handle("Gagal memperbarui paket.", async (req) => {
  const cur = (await pool.query("SELECT * FROM packages WHERE id = $1", [req.params.id])).rows[0];
  if (!cur) throw new HttpError("Paket tidak ditemukan.", 404);
  const p = await writePackage(req, cur);
  const r = await pool.query(
    `UPDATE packages SET service_id=$1, tier_name=$2, price=$3, eta_label=$4, revision_limit=$5, details=$6,
       fit_text=$7, is_highlighted=$8, sort_order=$9, is_active=$10 WHERE id=$11 RETURNING *`,
    [p.serviceId, p.name, p.price, p.eta, p.revisionLimit, JSON.stringify(p.rows), p.fit, p.highlight, p.sortOrder, p.isActive, cur.id]);
  return mapPackage(r.rows[0]);
}));

router.delete("/admin/packages/:id", ...admin, handle("Gagal menghapus paket.", async (req) => {
  const r = await pool.query("DELETE FROM packages WHERE id = $1", [req.params.id]);
  if (!r.rowCount) throw new HttpError("Paket tidak ditemukan.", 404);
  return { success: true };
}));

/* ======================= ULASAN PRODUK LAYANAN SATUAN ======================= */
router.get("/singles/:id/reviews", handle("Gagal mengambil ulasan.", async (req) => {
  const product = await pool.query("SELECT id FROM single_services WHERE id = $1 AND is_active = TRUE", [req.params.id]);
  if (!product.rowCount) throw new HttpError("Layanan satuan tidak ditemukan.", 404);
  const [summary, reviews] = await Promise.all([
    pool.query("SELECT COALESCE(AVG(rating),0)::numeric(3,2) AS average, COUNT(*)::int AS count FROM single_service_reviews WHERE single_service_id=$1", [req.params.id]),
    pool.query(`SELECT r.id, r.rating, r.comment, r.created_at, u.name AS reviewer_name
                FROM single_service_reviews r JOIN users u ON u.id=r.user_id
                WHERE r.single_service_id=$1 ORDER BY r.created_at DESC LIMIT 50`, [req.params.id])
  ]);
  return { average: Number(summary.rows[0].average), count: summary.rows[0].count, reviews: reviews.rows };
}));

router.post("/singles/:id/reviews", requireAuth, handle("Gagal menyimpan ulasan.", async (req) => {
  const product = await pool.query("SELECT id FROM single_services WHERE id = $1 AND is_active = TRUE", [req.params.id]);
  if (!product.rowCount) throw new HttpError("Layanan satuan tidak ditemukan.", 404);
  const rating = Number(req.body.rating);
  const comment = String(req.body.comment || "").trim();
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) throw new HttpError("Rating harus antara 1 sampai 5.");
  if (comment.length < 3 || comment.length > 1200) throw new HttpError("Komentar harus 3–1200 karakter.");
  const result = await pool.query(
    `INSERT INTO single_service_reviews (single_service_id, user_id, rating, comment)
     VALUES ($1,$2,$3,$4)
     ON CONFLICT (single_service_id, user_id) DO UPDATE SET rating=EXCLUDED.rating, comment=EXCLUDED.comment, created_at=NOW()
     RETURNING id, rating, comment, created_at`, [req.params.id, req.user.userId, rating, comment]);
  return { success: true, review: result.rows[0] };
}, 201));

/* ======================= ADMIN: single services ======================= */
router.get("/admin/singles", ...admin, handle("Gagal mengambil layanan satuan.", async (req) => {
  const r = await pool.query(
    `SELECT * FROM single_services WHERE ($1::text IS NULL OR service_id = $1) ORDER BY service_id, sort_order, name`,
    [req.query.service || null]);
  return r.rows.map(mapSingle);
}));

async function writeSingle(req, existing) {
  const b = req.body;
  const serviceId = b.serviceId ?? existing?.service_id;
  if (!serviceId) throw new HttpError("Layanan wajib dipilih.");
  await ensureService(serviceId);
  const name = String(b.name ?? existing?.name ?? "").trim();
  if (!name || name.length > 150) throw new HttpError("Nama layanan satuan wajib diisi (maks 150 karakter).");
  const price = b.price !== undefined ? toPrice(b.price) : Number(existing?.price);
  if (price === null || Number.isNaN(price)) throw new HttpError("Harga tidak valid.");
  return {
    serviceId, name, price,
    unit: b.unit ?? existing?.unit_label ?? "",
    image: b.image ?? existing?.image_url ?? "",
    description: b.description ?? existing?.description ?? "",
    sortOrder: b.sortOrder !== undefined ? toInt(b.sortOrder) : existing?.sort_order ?? 0,
    isActive: toBool(b.isActive, existing?.is_active ?? true)
  };
}

router.post("/admin/singles", ...admin, handle("Gagal menambah layanan satuan.", async (req) => {
  const s = await writeSingle(req, null);
  const id = slugify(req.body.id || `single-${s.name}`).slice(0, 50);
  const dup = await pool.query("SELECT 1 FROM single_services WHERE id = $1", [id]);
  if (dup.rowCount) throw new HttpError("ID layanan satuan sudah dipakai. Ganti namanya.", 409);
  const r = await pool.query(
    `INSERT INTO single_services (id, service_id, name, unit_label, price, image_url, description, sort_order, is_active)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
    [id, s.serviceId, s.name, s.unit, s.price, s.image || null, s.description || "", s.sortOrder, s.isActive]);
  return mapSingle(r.rows[0]);
}, 201));

router.put("/admin/singles/:id", ...admin, handle("Gagal memperbarui layanan satuan.", async (req) => {
  const cur = (await pool.query("SELECT * FROM single_services WHERE id = $1", [req.params.id])).rows[0];
  if (!cur) throw new HttpError("Layanan satuan tidak ditemukan.", 404);
  const s = await writeSingle(req, cur);
  const r = await pool.query(
    `UPDATE single_services SET service_id=$1, name=$2, unit_label=$3, price=$4, image_url=$5, description=$6, sort_order=$7, is_active=$8
     WHERE id=$9 RETURNING *`,
    [s.serviceId, s.name, s.unit, s.price, s.image || null, s.description || "", s.sortOrder, s.isActive, cur.id]);
  return mapSingle(r.rows[0]);
}));

router.delete("/admin/singles/:id", ...admin, handle("Gagal menghapus layanan satuan.", async (req) => {
  const r = await pool.query("DELETE FROM single_services WHERE id = $1", [req.params.id]);
  if (!r.rowCount) throw new HttpError("Layanan satuan tidak ditemukan.", 404);
  return { success: true };
}));

module.exports = router;
