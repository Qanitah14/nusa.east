
const express = require("express");
const pool = require("../db/pool");

const {
    createTransaction,
    handleNotification,
    syncTransactionStatus
} = require("../controllers/paymentGateway");

const {
    requireAuth,
    requireRole,
    ROLES
} = require("../middleware/auth");

const router = express.Router();

/* =====================================================
   1. KONFIGURASI MIDTRANS UNTUK FRONTEND
   GET /api/payment/config
===================================================== */

router.get("/config", (req, res) => {
    const clientKey = process.env.MIDTRANS_CLIENT_KEY;

    if (!clientKey) {
        return res.status(503).json({
            error: "MIDTRANS_CLIENT_KEY belum dikonfigurasi."
        });
    }

    res.set("Cache-Control", "no-store");

    return res.json({
        clientKey,
        isProduction:
            process.env.MIDTRANS_IS_PRODUCTION === "true"
    });
});

/* =====================================================
   2. MEMBUAT TRANSAKSI PEMBAYARAN
   POST /api/payment/create
===================================================== */

router.post(
    "/create",
    requireAuth,
    requireRole(ROLES.USER),
    async (req, res) => {
        try {
            const orderId = String(req.body.orderId || "");

            if (!orderId) {
                return res.status(400).json({
                    error: "Nomor pesanan wajib diisi."
                });
            }

            const result = await pool.query(
                `SELECT
                    o.id,
                    o.total,
                    o.payment_status,
                    u.name,
                    u.email,
                    u.phone
                 FROM orders o
                 JOIN users u ON u.id = o.user_id
                 WHERE o.id = $1
                   AND o.user_id = $2`,
                [orderId, req.user.userId]
            );

            const order = result.rows[0];

            if (!order) {
                return res.status(404).json({
                    error: "Pesanan tidak ditemukan."
                });
            }

            if (order.payment_status === "paid") {
                return res.status(409).json({
                    error: "Pesanan ini sudah dibayar.",
                    paymentStatus: "paid"
                });
            }

            // Periksa status transaksi yang sudah ada.
            const existingPayment = await pool.query(
                `SELECT raw_payload
                 FROM payments
                 WHERE order_id = $1
                   AND gateway = 'midtrans'
                   AND status = 'pending'
                 ORDER BY created_at DESC
                 LIMIT 1`,
                [orderId]
            );

            if (existingPayment.rows.length) {
                try {
                    const synced =
                        await syncTransactionStatus(orderId);

                    if (synced.paymentStatus === "paid") {
                        return res.status(409).json({
                            error: "Pesanan ini sudah dibayar.",
                            paymentStatus: "paid"
                        });
                    }
                } catch (syncError) {
                    console.warn(
                        "[MIDTRANS] Pemeriksaan transaksi:",
                        syncError.message
                    );
                }

                // Ambil ulang status setelah sinkronisasi.
                const latest = await pool.query(
                    `SELECT payment_status
                     FROM orders
                     WHERE id = $1`,
                    [orderId]
                );

                if (latest.rows[0]?.payment_status === "paid") {
                    return res.status(409).json({
                        error: "Pesanan ini sudah dibayar.",
                        paymentStatus: "paid"
                    });
                }

                // Gunakan token lama jika masih tersedia.
                const saved =
                    existingPayment.rows[0].raw_payload || {};

                if (saved.snap_token) {
                    return res.json({
                        token: saved.snap_token,
                        redirect_url: saved.redirect_url || null,
                        reused: true
                    });
                }
            }

            // Buat transaksi baru jika belum ada token.
            const transaction = await createTransaction({
                orderId: order.id,
                grossAmount: Number(order.total),
                customer: {
                    name: order.name,
                    email: order.email,
                    phone: order.phone
                }
            });

            await pool.query(
                `UPDATE orders
                 SET payment_status = 'pending',
                     status = 'Menunggu Pembayaran'
                 WHERE id = $1
                   AND payment_status <> 'paid'`,
                [orderId]
            );

            return res.json(transaction);

        } catch (error) {
            console.error(
                "[MIDTRANS] Gagal membuat transaksi:",
                error
            );

            return res.status(500).json({
                error: error.message ||
                    "Gagal membuat transaksi pembayaran."
            });
        }
    }
);

/* =====================================================
   3. MEMERIKSA STATUS PESANAN
   GET /api/payment/order/:id
===================================================== */

router.get(
    "/order/:id",
    requireAuth,
    requireRole(ROLES.USER),
    async (req, res) => {
        try {
            const orderId = req.params.id;

            const owned = await pool.query(
                `SELECT id
                 FROM orders
                 WHERE id = $1
                   AND user_id = $2
                 LIMIT 1`,
                [orderId, req.user.userId]
            );

            if (!owned.rows.length) {
                return res.status(404).json({
                    error: "Pesanan tidak ditemukan."
                });
            }

            let syncError = null;

            // Ambil status resmi dari Midtrans.
            try {
                await syncTransactionStatus(orderId);
            } catch (error) {
                syncError = error.message;

                console.warn(
                    "[MIDTRANS] Status belum dapat disinkronkan:",
                    orderId,
                    syncError
                );
            }

            // Baca kembali status terbaru dari database.
            const result = await pool.query(
                `SELECT
                    o.id,
                    o.total,
                    o.payment_status,
                    p.status AS gateway_status,
                    p.raw_payload
                 FROM orders o
                 LEFT JOIN LATERAL (
                    SELECT status, raw_payload
                    FROM payments
                    WHERE order_id = o.id
                      AND gateway = 'midtrans'
                    ORDER BY created_at DESC
                    LIMIT 1
                 ) p ON true
                 WHERE o.id = $1
                   AND o.user_id = $2`,
                [orderId, req.user.userId]
            );

            const row = result.rows[0];
            const payload = row.raw_payload || {};

            res.set(
                "Cache-Control",
                "no-store, no-cache, must-revalidate"
            );

            return res.json({
                orderId: row.id,
                total: Number(row.total),
                paymentStatus: row.payment_status,
                gatewayStatus: row.gateway_status || null,
                token:
                    row.payment_status === "pending"
                        ? payload.snap_token || null
                        : null,
                redirectUrl:
                    row.payment_status === "pending"
                        ? payload.redirect_url || null
                        : null,
                expiryTime: payload.expiry_time || null,
                syncError
            });

        } catch (error) {
            console.error(
                "[MIDTRANS] Gagal mengambil status pesanan:",
                error
            );

            return res.status(500).json({
                error: "Gagal mengambil status pembayaran."
            });
        }
    }
);

/* =====================================================
   4. TES ENDPOINT NOTIFIKASI
   GET /api/payment/notification
===================================================== */

router.get("/notification", (req, res) => {
    res.set("Cache-Control", "no-store");

    return res.status(200).json({
        endpoint: "/api/payment/notification",
        status: "ready",
        acceptedMethod: "POST",
        message:
            "Endpoint aktif. Midtrans mengirim notifikasi menggunakan POST."
    });
});

/* =====================================================
   5. WEBHOOK MIDTRANS
   POST /api/payment/notification
===================================================== */

router.post("/notification", async (req, res) => {
    try {
        console.log(
            "[MIDTRANS] Notifikasi diterima:",
            req.body?.order_id,
            req.body?.transaction_status
        );

        const result = await handleNotification(req.body);

        console.log(
            "[MIDTRANS] Notifikasi berhasil:",
            result
        );

        return res.status(200).json({
            success: true,
            message: "Notifikasi Midtrans berhasil diproses.",
            ...result
        });

    } catch (error) {
        console.error(
            "[MIDTRANS] Notification error:",
            error
        );

        return res.status(500).json({
            success: false,
            error: error.message ||
                "Gagal memproses notifikasi Midtrans."
        });
    }
});

module.exports = router;
