const express = require("express");
const pool = require("../db/pool");
const { requireAuth, requireAdmin } = require("./auth");

const router = express.Router();

function generateOrderId() {
  const year = new Date().getFullYear();
  const rand = Math.floor(1000 + Math.random() * 9000);
  return `NE-${year}-${rand}`;
}

// Urutan tahap project — harus sama dengan STATUS_STEPS di frontend (js/orders.js)
const STATUS_STEPS = [
  "Pesanan Dibuat", "Pembayaran Berhasil", "Brief Diisi", "Brief & Bahan Lengkap",
  "Project Dimulai", "Produksi", "Preview Dikirim", "Revisi", "Finalisasi", "Project Selesai"
];

// ---------- ADMIN: daftar & detail pesanan ----------
// GET /api/orders/admin/all — semua pesanan (terbaru dulu)
router.get("/admin/all", requireAuth, requireAdmin, async (req, res) => {
  try {
    const r = await pool.query(
      `SELECT o.id, o.total, o.payment_method, o.payment_status, o.status, o.created_at,
              u.name AS customer, u.email,
              (SELECT COUNT(*)::int FROM order_items i WHERE i.order_id = o.id) AS item_count
         FROM orders o LEFT JOIN users u ON u.id = o.user_id
        ORDER BY o.created_at DESC LIMIT 500`
    );
    res.json(r.rows.map((o) => ({ ...o, total: Number(o.total) })));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Gagal mengambil daftar pesanan." });
  }
});

// GET /api/orders/admin/:id — detail pesanan + item + timeline + brief
router.get("/admin/:id", requireAuth, requireAdmin, async (req, res) => {
  try {
    const o = await pool.query(
      `SELECT o.*, u.name AS customer, u.email, u.phone
         FROM orders o LEFT JOIN users u ON u.id = o.user_id WHERE o.id = $1`, [req.params.id]);
    if (!o.rows.length) return res.status(404).json({ error: "Order tidak ditemukan." });
    const items = await pool.query("SELECT name, price, qty, line_total FROM order_items WHERE order_id = $1", [req.params.id]);
    const log = await pool.query("SELECT step, note, created_at FROM project_status_log WHERE order_id = $1 ORDER BY created_at ASC", [req.params.id]);
    const brief = await pool.query("SELECT * FROM project_briefs WHERE order_id = $1 LIMIT 1", [req.params.id]);
    res.json({ ...o.rows[0], total: Number(o.rows[0].total), items: items.rows, log: log.rows, brief: brief.rows[0] || null });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Terjadi kesalahan pada server." });
  }
});

// POST /api/orders — buat order baru dari isi keranjang
router.post("/", requireAuth, async (req, res) => {
  const client = await pool.connect();
  try {
    const { items, total, paymentMethod } = req.body;
    const orderId = generateOrderId();

    await client.query("BEGIN");
    await client.query(
      `INSERT INTO orders (id, user_id, total, payment_method) VALUES ($1, $2, $3, $4)`,
      [orderId, req.user.userId, total, paymentMethod]
    );
    for (const item of items) {
      await client.query(
        `INSERT INTO order_items (order_id, item_type, item_ref_id, name, price, qty, line_total)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [orderId, item.type, item.id, item.name, item.price, item.qty || 1, item.lineTotal]
      );
    }
    await client.query(
      `INSERT INTO project_status_log (order_id, step) VALUES ($1, 'Pesanan Dibuat')`,
      [orderId]
    );
    await client.query("COMMIT");

    res.status(201).json({ orderId });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error(err);
    res.status(500).json({ error: "Gagal membuat pesanan." });
  } finally {
    client.release();
  }
});

// GET /api/orders/:id — detail order + timeline
router.get("/:id", requireAuth, async (req, res) => {
  try {
    const order = await pool.query("SELECT * FROM orders WHERE id = $1", [req.params.id]);
    if (order.rows.length === 0) return res.status(404).json({ error: "Order tidak ditemukan." });

    const items = await pool.query("SELECT * FROM order_items WHERE order_id = $1", [req.params.id]);
    const log = await pool.query("SELECT * FROM project_status_log WHERE order_id = $1 ORDER BY created_at ASC", [req.params.id]);

    res.json({ ...order.rows[0], items: items.rows, log: log.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Terjadi kesalahan pada server." });
  }
});

// POST /api/orders/:id/brief — submit brief project
// Tenggat pengerjaan (work_started_at) BARU diisi di sini, bukan saat checkout —
// sesuai aturan: tenggat dihitung setelah pembayaran + brief + bahan lengkap.
router.post("/:id/brief", requireAuth, async (req, res) => {
  try {
    const { brandName, contactName, whatsapp, audience, tone, briefDetail } = req.body;
    await pool.query(
      `INSERT INTO project_briefs (order_id, brand_name, contact_name, whatsapp, audience, tone, brief_detail, materials_received)
       VALUES ($1,$2,$3,$4,$5,$6,$7, true)`,
      [req.params.id, brandName, contactName, whatsapp, audience, tone, briefDetail]
    );
    await pool.query(`UPDATE orders SET work_started_at = now(), status = 'Project Dimulai' WHERE id = $1`, [req.params.id]);
    await pool.query(`INSERT INTO project_status_log (order_id, step) VALUES ($1, 'Brief & Bahan Lengkap')`, [req.params.id]);
    await pool.query(`INSERT INTO project_status_log (order_id, step) VALUES ($1, 'Project Dimulai')`, [req.params.id]);

    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Gagal menyimpan brief." });
  }
});

// POST /api/orders/:id/status — update tahap project (HANYA admin).
// Tracking project baru bisa dijalankan setelah pembayaran berhasil (payment_status = 'paid').
router.post("/:id/status", requireAuth, requireAdmin, async (req, res) => {
  try {
    const { step, note } = req.body;
    if (!STATUS_STEPS.includes(step)) return res.status(400).json({ error: "Tahap project tidak valid." });

    const found = await pool.query("SELECT payment_status FROM orders WHERE id = $1", [req.params.id]);
    if (!found.rows.length) return res.status(404).json({ error: "Order tidak ditemukan." });
    if (found.rows[0].payment_status !== "paid") {
      return res.status(409).json({ error: "Pembayaran belum berhasil, tracking project belum bisa dijalankan." });
    }

    await pool.query(`UPDATE orders SET status = $1 WHERE id = $2`, [step, req.params.id]);
    await pool.query(`INSERT INTO project_status_log (order_id, step, note) VALUES ($1, $2, $3)`, [req.params.id, step, note || null]);
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Gagal update status." });
  }
});

// POST /api/orders/:id/revision — ajukan revisi (dicek terhadap revision_limit)
router.post("/:id/revision", requireAuth, async (req, res) => {
  try {
    const orderRes = await pool.query("SELECT revision_used, revision_limit FROM orders WHERE id = $1", [req.params.id]);
    const order = orderRes.rows[0];
    if (!order) return res.status(404).json({ error: "Order tidak ditemukan." });
    if (order.revision_used >= order.revision_limit) {
      return res.status(400).json({ error: "Batas revisi sudah tercapai." });
    }

    await pool.query(`INSERT INTO revisions (order_id, note) VALUES ($1, $2)`, [req.params.id, req.body.note]);
    await pool.query(`UPDATE orders SET revision_used = revision_used + 1, status = 'Revisi' WHERE id = $1`, [req.params.id]);
    await pool.query(`INSERT INTO project_status_log (order_id, step, note) VALUES ($1, 'Revisi', $2)`, [req.params.id, req.body.note]);

    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Gagal mengajukan revisi." });
  }
});

module.exports = router;
