const express = require("express");
const pool = require("../db/pool");
const { createTransaction, handleNotification, syncTransactionStatus } = require("../controllers/paymentGateway");
const { requireAuth, requireRole, ROLES } = require("../middleware/auth");

const router = express.Router();

// GET /api/payment/config — Client Key saja yang boleh dikirim ke frontend.
router.get("/config", (req, res) => {
    const clientKey = process.env.MIDTRANS_CLIENT_KEY;
    if (!clientKey) {
        return res.status(503).json({ error: "Midtrans belum dikonfigurasi. Periksa Environment Variables Vercel." });
    }
    res.set("Cache-Control", "no-store");
    return res.json({ clientKey, isProduction: process.env.MIDTRANS_IS_PRODUCTION === "true" });
});

// POST /api/payment/create — membuat Snap Token untuk pesanan milik pengguna.
router.post("/create", requireAuth, requireRole(ROLES.USER), async (req, res) => {
    try {
        const orderId = String(req.body.orderId || "");
        if (!orderId) return res.status(400).json({ error: "Nomor pesanan wajib diisi." });

        const result = await pool.query(
            `SELECT o.id, o.total, o.payment_status, u.name, u.email, u.phone
               FROM orders o JOIN users u ON u.id = o.user_id
              WHERE o.id = $1 AND o.user_id = $2`,
            [orderId, req.user.userId]
        );
        const order = result.rows[0];
        if (!order) return res.status(404).json({ error: "Order tidak ditemukan." });
        if (order.payment_status === "paid") return res.status(409).json({ error: "Pesanan ini sudah dibayar." });

        // Periksa status gateway terlebih dahulu agar transaksi yang sebenarnya sudah lunas tidak dibuat ulang.
        try {
            const synced = await syncTransactionStatus(orderId);
            if (synced.paymentStatus === "paid") {
                return res.status(409).json({ error: "Pesanan ini sudah dibayar.", paymentStatus: "paid" });
            }
        } catch (statusError) {
            // Order baru belum memiliki transaksi Midtrans; lanjutkan membuat transaksi.
            if (statusError.statusCode !== 404) console.warn("[MIDTRANS] Pemeriksaan sebelum create:", statusError.message);
        }

        const existing = await pool.query(
            `SELECT raw_payload FROM payments
              WHERE order_id = $1 AND status = 'pending'
              ORDER BY created_at DESC LIMIT 1`,
            [orderId]
        );
        const saved = existing.rows[0]?.raw_payload || {};
        if (saved.snap_token) {
            return res.json({ token: saved.snap_token, redirect_url: saved.redirect_url || null, reused: true });
        }

        const transaction = await createTransaction({
            orderId: order.id,
            grossAmount: Number(order.total),
            customer: { name: order.name, email: order.email, phone: order.phone }
        });
        await pool.query(
            `UPDATE orders SET payment_status = 'pending', status = 'Menunggu Pembayaran' WHERE id = $1 AND payment_status <> 'paid'`,
            [orderId]
        );
        return res.json(transaction);
    } catch (error) {
        console.error("[MIDTRANS] Gagal membuat transaksi:", error);
        return res.status(500).json({ error: error.message || "Gagal membuat transaksi pembayaran." });
    }
});

// GET /api/payment/order/:id — sinkronkan ke Midtrans setiap kali status diminta.
router.get("/order/:id", requireAuth, requireRole(ROLES.USER), async (req, res) => {
    try {
        const owned = await pool.query(
            `SELECT id FROM orders WHERE id = $1 AND user_id = $2 LIMIT 1`,
            [req.params.id, req.user.userId]
        );
        if (!owned.rows.length) return res.status(404).json({ error: "Pesanan tidak ditemukan." });

        let syncError = null;
        try {
            await syncTransactionStatus(req.params.id);
        } catch (error) {
            // Transaksi belum ada di Midtrans atau gateway sedang tidak tersedia; tetap tampilkan status database.
            syncError = error.message;
            console.warn("[MIDTRANS] Status belum dapat disinkronkan:", req.params.id, syncError);
        }

        const result = await pool.query(
            `SELECT o.id, o.total, o.payment_status, p.status AS gateway_status, p.raw_payload
               FROM orders o
               LEFT JOIN LATERAL (
                   SELECT status, raw_payload FROM payments
                    WHERE order_id = o.id AND gateway = 'midtrans'
                    ORDER BY created_at DESC LIMIT 1
               ) p ON true
              WHERE o.id = $1 AND o.user_id = $2`,
            [req.params.id, req.user.userId]
        );
        const row = result.rows[0];
        const payload = row.raw_payload || {};
        res.set("Cache-Control", "no-store, no-cache, must-revalidate");
        return res.json({
            orderId: row.id,
            total: Number(row.total),
            paymentStatus: row.payment_status,
            gatewayStatus: row.gateway_status || null,
            token: row.payment_status === "pending" ? payload.snap_token || null : null,
            redirectUrl: row.payment_status === "pending" ? payload.redirect_url || null : null,
            expiryTime: payload.expiry_time || null,
            syncError
        });
    } catch (error) {
        console.error("[MIDTRANS] Gagal mengambil status pesanan:", error);
        return res.status(500).json({ error: "Gagal mengambil status pembayaran." });
    }
});

// POST /api/payment/notification — URL ini didaftarkan di Midtrans Dashboard.
router.post("/notification", async (req, res) => {
    try {
        const result = await handleNotification(req.body);
        return res.status(200).json(result);
    } catch (error) {
        console.error("[MIDTRANS] Notification error:", error);
        // Respons non-2xx membuat Midtrans mencoba mengirim notifikasi ulang.
        return res.status(500).json({ error: error.message || "Gagal memproses notifikasi." });
    }
});

module.exports = router;
