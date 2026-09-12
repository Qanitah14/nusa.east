const express = require("express");
const { createTransaction, handleNotification } = require("../controllers/paymentGateway");
const { requireAuth } = require("./auth");

const router = express.Router();

// POST /api/payment/create — dipanggil dari halaman checkout untuk mendapatkan Snap Token
router.post("/create", requireAuth, async (req, res) => {
  try {
    const { orderId, grossAmount, customer } = req.body;
    const transaction = await createTransaction({ orderId, grossAmount, customer });
    res.json(transaction); // { token, redirect_url }
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Gagal membuat transaksi pembayaran." });
  }
});

// POST /api/payment/notification — webhook dari Midtrans (didaftarkan di dashboard Midtrans)
// URL ini HARUS bisa diakses publik (pakai domain asli / ngrok saat development).
router.post("/notification", async (req, res) => {
  try {
    const result = await handleNotification(req.body);
    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Gagal memproses notifikasi." });
  }
});

module.exports = router;
