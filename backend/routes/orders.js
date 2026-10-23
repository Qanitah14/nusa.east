const express = require("express");
const pool = require("../db/pool");
const { requireAuth } = require("./auth");

const router = express.Router();

function generateOrderId() {
  const year = new Date().getFullYear();
  const rand = Math.floor(1000 + Math.random() * 9000);
  return `NE-${year}-${rand}`;
}

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

// POST /api/orders/:id/status — update status (dipakai tim internal/admin)
router.post("/:id/status", requireAuth, async (req, res) => {
  try {
    const { step, note } = req.body;
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
