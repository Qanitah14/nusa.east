const express = require("express");
const pool = require("../db/pool");
const { createTransaction, handleNotification } = require("../controllers/paymentGateway");
const { requireAuth, requireRole, ROLES } = require("../middleware/auth");

const router = express.Router();

// GET /api/payment/config — hanya mengirim Client Key (bukan Server Key) ke browser.
router.get("/config", (req, res) => {
  const clientKey = process.env.MIDTRANS_CLIENT_KEY;
  const production = process.env.MIDTRANS_IS_PRODUCTION === "true";
  if (!clientKey) return res.status(503).json({ error: "Client Key Midtrans belum dikonfigurasi pada backend." });
  if (production && !clientKey.startsWith("Mid-client-")) {
    return res.status(503).json({ error: "MIDTRANS_CLIENT_KEY bukan Client Key Production yang valid." });
  }
  res.set("Cache-Control", "no-store");
  res.json({ clientKey, isProduction: production });
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
    const transaction = await createTransaction({
      orderId: o.id, grossAmount: Number(o.total),
      customer: { name: o.name, email: o.email, phone: o.phone }
    });
    res.json(transaction); // { token, redirect_url }
  } catch (err) {
    console.error("Midtrans create transaction:", err.message);
    res.status(err.status || 500).json({ error: err.status ? err.message : "Gagal membuat transaksi pembayaran. Periksa konfigurasi Midtrans backend." });
  }
});

// POST /api/payment/notification — webhook dari Midtrans (diverifikasi ulang ke Midtrans di handleNotification).
router.post("/notification", async (req, res) => {
  try {
    const result = await handleNotification(req.body);
    res.json(result);
  } catch (err) {
    console.error("Midtrans notification:", err.message);
    res.status(err.status || 500).json({ error: "Gagal memproses notifikasi." });
  }
});

module.exports = router;
