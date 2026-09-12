const express = require("express");
const pool = require("../db/pool");
const { requireAuth } = require("./auth");

const router = express.Router();
const STATUS_STEPS = ["Pesanan Dibuat","Pembayaran Berhasil","Brief Diisi","Brief & Bahan Lengkap","Project Dimulai","Produksi","Preview Dikirim","Revisi","Finalisasi","Project Selesai"];

function generateOrderId() {
  const year = new Date().getFullYear();
  const rand = Math.floor(1000 + Math.random() * 9000);
  return `NE-${year}-${rand}`;
}

// GET /api/orders/cart — keranjang milik user login
router.get("/cart", requireAuth, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT * FROM cart_items WHERE user_id = $1 ORDER BY created_at ASC`,
      [req.user.userId]
    );
    res.json(result.rows.map(row => ({
      cartId: row.id, id: row.item_ref_id, type: row.item_type, name: row.name,
      price: Number(row.price), qty: row.qty, meta: row.meta, selected: row.selected
    })));
  } catch (err) { console.error(err); res.status(500).json({ error: "Gagal mengambil keranjang." }); }
});

// POST /api/orders/cart — tambah item / tambah qty item yang sama
router.post("/cart", requireAuth, async (req, res) => {
  try {
    const { id, type, name, price, qty = 1, meta = null } = req.body;
    if (!id || !type || !name || price == null) return res.status(400).json({ error: "Data item tidak lengkap." });
    const result = await pool.query(
      `INSERT INTO cart_items (user_id,item_type,item_ref_id,name,price,qty,meta,selected)
       VALUES ($1,$2,$3,$4,$5,$6,$7,true)
       ON CONFLICT (user_id,item_type,item_ref_id) DO UPDATE SET
         qty=cart_items.qty+EXCLUDED.qty, price=EXCLUDED.price, name=EXCLUDED.name,
         meta=EXCLUDED.meta, selected=true, updated_at=now()
       RETURNING *`,
      [req.user.userId, type, id, name, price, Math.max(1, Number(qty) || 1), meta]
    );
    res.status(201).json({ success: true, item: result.rows[0] });
  } catch (err) { console.error(err); res.status(500).json({ error: "Gagal menambahkan item ke keranjang." }); }
});

// PATCH /api/orders/cart/:cartId — update qty / checkbox
router.patch("/cart/:cartId", requireAuth, async (req, res) => {
  try {
    const current = await pool.query(`SELECT * FROM cart_items WHERE id=$1 AND user_id=$2`, [req.params.cartId, req.user.userId]);
    if (!current.rows[0]) return res.status(404).json({ error: "Item keranjang tidak ditemukan." });
    const row = current.rows[0];
    const qty = req.body.qty !== undefined ? Math.max(1, Number(req.body.qty) || 1) : row.qty;
    const selected = req.body.selected !== undefined ? Boolean(req.body.selected) : row.selected;
    await pool.query(`UPDATE cart_items SET qty=$1, selected=$2, updated_at=now() WHERE id=$3 AND user_id=$4`, [qty, selected, req.params.cartId, req.user.userId]);
    res.json({ success: true });
  } catch (err) { console.error(err); res.status(500).json({ error: "Gagal memperbarui keranjang." }); }
});

// DELETE selected harus didefinisikan sebelum /cart/:cartId
router.delete("/cart/selected/all", requireAuth, async (req, res) => {
  try { await pool.query(`DELETE FROM cart_items WHERE user_id=$1 AND selected=true`, [req.user.userId]); res.json({ success: true }); }
  catch (err) { console.error(err); res.status(500).json({ error: "Gagal membersihkan item terpilih." }); }
});
router.delete("/cart/all", requireAuth, async (req, res) => {
  try { await pool.query(`DELETE FROM cart_items WHERE user_id=$1`, [req.user.userId]); res.json({ success: true }); }
  catch (err) { console.error(err); res.status(500).json({ error: "Gagal membersihkan keranjang." }); }
});
router.delete("/cart/:cartId", requireAuth, async (req, res) => {
  try { await pool.query(`DELETE FROM cart_items WHERE id=$1 AND user_id=$2`, [req.params.cartId, req.user.userId]); res.json({ success: true }); }
  catch (err) { console.error(err); res.status(500).json({ error: "Gagal menghapus item." }); }
});

// POST /api/orders — buat order baru dari isi keranjang
router.post("/", requireAuth, async (req, res) => {
  const client = await pool.connect();
  try {
    const { items, total, paymentMethod } = req.body;
    if (!Array.isArray(items) || items.length === 0) return res.status(400).json({ error: "Item pesanan kosong." });
    const orderId = generateOrderId();

    await client.query("BEGIN");
    await client.query(
      `INSERT INTO orders (id, user_id, total, payment_method, payment_status, status) VALUES ($1, $2, $3, $4, 'paid', 'Pembayaran Berhasil')`,
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
      `INSERT INTO project_status_log (order_id, step) VALUES ($1, 'Pesanan Dibuat')`, [orderId]
    );
    await client.query(`INSERT INTO project_status_log (order_id, step) VALUES ($1, 'Pembayaran Berhasil')`, [orderId]);
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
    const order = await pool.query("SELECT * FROM orders WHERE id = $1 AND user_id = $2", [req.params.id, req.user.userId]);
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
    const owned = await pool.query("SELECT id FROM orders WHERE id=$1 AND user_id=$2", [req.params.id, req.user.userId]);
    if (!owned.rows[0]) return res.status(404).json({ error: "Order tidak ditemukan." });
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
    const owned = await pool.query("SELECT id FROM orders WHERE id=$1 AND user_id=$2", [req.params.id, req.user.userId]);
    if (!owned.rows[0]) return res.status(404).json({ error: "Order tidak ditemukan." });
    const { step, note } = req.body;
    if (!STATUS_STEPS.includes(step)) return res.status(400).json({ error: "Status tidak valid." });
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
    const orderRes = await pool.query("SELECT revision_used, revision_limit FROM orders WHERE id = $1 AND user_id = $2", [req.params.id, req.user.userId]);
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
