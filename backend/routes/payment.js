const express = require("express");
const pool = require("../db/pool");
const { createTransaction, handleNotification } = require("../controllers/paymentGateway");
const { requireAuth, requireRole, ROLES } = require("../middleware/auth");

const router = express.Router();


// GET /api/payment/config — hanya mengirim Client Key (aman untuk frontend).
router.get("/config", (req, res) => {
  const clientKey = process.env.MIDTRANS_CLIENT_KEY;
  if (!clientKey) {
    return res.status(503).json({ error: "Midtrans belum dikonfigurasi. Isi MIDTRANS_CLIENT_KEY pada Environment Variables Vercel." });
  }

  res.set("Cache-Control", "no-store");
  return res.json({
    clientKey,
    isProduction: process.env.MIDTRANS_IS_PRODUCTION === "true"
  });
});

// POST /api/payment/create — dipanggil dari halaman checkout untuk mendapatkan Snap Token.
// Nominal & data pelanggan diambil dari database (bukan dari body) dan pesanan harus milik pemanggil.
router.post("/create", requireAuth, requireRole(ROLES.USER), async (req, res) => {
  try {
    const orderId = String(req.body.orderId || "");
    const r = await pool.query(
      `SELECT o.id, o.total, o.payment_status, u.name, u.email, u.phone
         FROM orders o JOIN users u ON u.id = o.user_id WHERE o.id = $1 AND o.user_id = $2`,
      [orderId, req.user.userId]
    );
    const o = r.rows[0];
    if (!o) return res.status(404).json({ error: "Order tidak ditemukan." });
    if (o.payment_status === "paid") return res.status(409).json({ error: "Pesanan ini sudah dibayar." });

    const existing = await pool.query(
      `SELECT raw_payload FROM payments
        WHERE order_id = $1 AND status = 'pending'
        ORDER BY created_at DESC LIMIT 1`,
      [orderId]
    );
    const saved = existing.rows[0]?.raw_payload || {};
    if (saved.snap_token) {
      return res.json({
        token: saved.snap_token,
        redirect_url: saved.redirect_url || null,
        reused: true
      });
    }

    const transaction = await createTransaction({
      orderId: o.id, grossAmount: Number(o.total),
      customer: { name: o.name, email: o.email, phone: o.phone }
    });
    await pool.query(
      `UPDATE orders SET payment_status = 'pending', status = 'Menunggu Pembayaran' WHERE id = $1`,
      [orderId]
    );
    res.json(transaction); // { token, redirect_url }
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Gagal membuat transaksi pembayaran." });
  }
});

// GET /api/payment/order/:id — status pembayaran milik pelanggan + token Snap yang masih tersimpan.
router.get("/order/:id", requireAuth, requireRole(ROLES.USER), async (req, res) => {
  try {
    const r = await pool.query(
      `SELECT o.id, o.total, o.payment_status,
              p.status AS gateway_status,
              p.raw_payload
         FROM orders o
         LEFT JOIN LATERAL (
           SELECT status, raw_payload
             FROM payments
            WHERE order_id = o.id
            ORDER BY created_at DESC
            LIMIT 1
         ) p ON true
        WHERE o.id = $1 AND o.user_id = $2`,
      [req.params.id, req.user.userId]
    );
    if (!r.rows.length) return res.status(404).json({ error: "Pesanan tidak ditemukan." });
    const row = r.rows[0];
    const payload = row.raw_payload || {};
    res.set("Cache-Control", "no-store");
    res.json({
      orderId: row.id,
      total: Number(row.total),
      paymentStatus: row.payment_status,
      token: row.payment_status === "pending" ? payload.snap_token || null : null,
      redirectUrl: row.payment_status === "pending" ? payload.redirect_url || null : null,
      expiryTime: payload.expiry_time || null
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Gagal mengambil status pembayaran." });
  }
});

// POST /api/payment/notification — webhook dari Midtrans (diverifikasi ulang ke Midtrans di handleNotification).
router.post("/notification", async (req, res) => {
  try {
    const result = await handleNotification(req.body);
    res.json(result);
  } catch (err) {
    console.error("[MIDTRANS] Notification error:", err);
    // Midtrans akan mencoba mengirim ulang jika menerima respons non-2xx.
    res.status(400).json({ error: err.message || "Gagal memproses notifikasi." });
  }
});

module.exports = router;
