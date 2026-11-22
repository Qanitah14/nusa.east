
const express = require("express");
const multer = require("multer");
const pool = require("../db/pool");

const {
    createTransaction,
    handleNotification,
    syncTransactionStatus
} = require("../controllers/paymentGateway");

const {
    requireAuth,
    requireRole,
    requireAdmin,
    ROLES
} = require("../middleware/auth");

const router = express.Router();
const proofUpload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 3 * 1024 * 1024, files: 1 },
    fileFilter(req, file, cb) {
        if (!["image/jpeg", "image/png", "image/webp"].includes(file.mimetype)) {
            return cb(new Error("Bukti harus berupa JPG, PNG, atau WebP."));
        }
        cb(null, true);
    }
});
function validProofImage(buffer, mime) {
    if (!buffer || buffer.length < 12) return false;
    if (mime === "image/jpeg") return buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
    if (mime === "image/png") return buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
    if (mime === "image/webp") return buffer.toString("ascii", 0, 4) === "RIFF" && buffer.toString("ascii", 8, 12) === "WEBP";
    return false;
}
function handleProofUpload(req, res, next) {
    proofUpload.single("proof")(req, res, (err) => {
        if (!err) return next();
        if (err instanceof multer.MulterError && err.code === "LIMIT_FILE_SIZE") return res.status(413).json({ error: "Ukuran bukti maksimal 3 MB." });
        return res.status(400).json({ error: err.message || "File bukti tidak dapat diproses." });
    });
}

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
                    o.payment_method,
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

            if (order.payment_method === "manual_transfer") {
                return res.status(409).json({ error: "Pesanan ini menggunakan transfer rekening manual." });
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
                `SELECT o.id, o.payment_method,
                        (SELECT gateway FROM payments WHERE order_id=o.id ORDER BY created_at DESC LIMIT 1) AS gateway
                 FROM orders o
                 WHERE o.id = $1 AND o.user_id = $2
                 LIMIT 1`,
                [orderId, req.user.userId]
            );

            if (!owned.rows.length) {
                return res.status(404).json({
                    error: "Pesanan tidak ditemukan."
                });
            }

            let syncError = null;

            // Sinkronkan status hanya untuk transaksi Midtrans.
            try {
                if (owned.rows[0].gateway === "midtrans") await syncTransactionStatus(orderId);
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
                    p.gateway,
                    p.raw_payload,
                    mp.review_status AS proof_status,
                    mp.review_note AS proof_note
                 FROM orders o
                 LEFT JOIN LATERAL (
                    SELECT status, gateway, raw_payload
                    FROM payments
                    WHERE order_id = o.id
                    ORDER BY created_at DESC
                    LIMIT 1
                 ) p ON true
                 LEFT JOIN manual_payment_proofs mp ON mp.order_id = o.id
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
                gateway: row.gateway || null,
                proofStatus: row.proof_status || null,
                proofNote: row.proof_note || null,
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
   TRANSFER BANK MANUAL — UPLOAD BUKTI PELANGGAN
===================================================== */
router.post("/manual/:orderId/proof", requireAuth, requireRole(ROLES.USER), handleProofUpload, async (req, res) => {
    const orderId = String(req.params.orderId || "");
    let client;
    try {
        if (!req.file) return res.status(400).json({ error: "Silakan unggah bukti transfer." });
        if (!validProofImage(req.file.buffer, req.file.mimetype)) return res.status(400).json({ error: "Isi file tidak sesuai format gambar." });
        client = await pool.connect();
        await client.query("BEGIN");
        const orderResult = await client.query(
            `SELECT id, total, payment_status, payment_method FROM orders WHERE id = $1 AND user_id = $2 FOR UPDATE`,
            [orderId, req.user.userId]
        );
        if (!orderResult.rows.length) { await client.query("ROLLBACK"); return res.status(404).json({ error: "Pesanan tidak ditemukan." }); }
        const o = orderResult.rows[0];
        if (o.payment_method !== "manual_transfer") { await client.query("ROLLBACK"); return res.status(409).json({ error: "Pesanan ini bukan transfer rekening manual." }); }
        if (o.payment_status === "paid") { await client.query("ROLLBACK"); return res.status(409).json({ error: "Pesanan sudah dibayar." }); }
        if (!["pending", "pending_verification"].includes(o.payment_status)) { await client.query("ROLLBACK"); return res.status(409).json({ error: "Pesanan tidak lagi dapat menerima bukti transfer." }); }
        const existing = await client.query(`SELECT review_status FROM manual_payment_proofs WHERE order_id = $1 FOR UPDATE`, [orderId]);
        if (existing.rows[0] && existing.rows[0].review_status !== "rejected") {
            await client.query("ROLLBACK"); return res.status(409).json({ error: "Bukti transfer sudah diterima dan sedang menunggu verifikasi." });
        }
        await client.query(
            `INSERT INTO manual_payment_proofs (order_id,user_id,file_name,mime_type,file_size,image_data,review_status,review_note,submitted_at,reviewed_at,reviewed_by)
             VALUES ($1,$2,$3,$4,$5,$6,'pending_verification',NULL,now(),NULL,NULL)
             ON CONFLICT (order_id) DO UPDATE SET file_name=EXCLUDED.file_name,mime_type=EXCLUDED.mime_type,file_size=EXCLUDED.file_size,image_data=EXCLUDED.image_data,review_status='pending_verification',review_note=NULL,submitted_at=now(),reviewed_at=NULL,reviewed_by=NULL`,
            [orderId, req.user.userId, req.file.originalname.slice(0,255), req.file.mimetype, req.file.size, req.file.buffer]
        );
        await client.query(`UPDATE payments SET status='pending_verification', raw_payload=COALESCE(raw_payload,'{}'::jsonb) || $2::jsonb WHERE order_id=$1 AND gateway='manual'`,
            [orderId, JSON.stringify({ proof_submitted_at: new Date().toISOString(), bank: "BSI" })]);
        await client.query(`UPDATE orders SET payment_status='pending_verification',status='Menunggu Verifikasi Pembayaran' WHERE id=$1 AND payment_status <> 'paid'`, [orderId]);
        await client.query("COMMIT");
        return res.status(201).json({ success: true, orderId, paymentStatus: "pending_verification", message: "Bukti transfer berhasil dikirim. Menunggu verifikasi Admin Penjualan." });
    } catch (error) {
        if (client) { try { await client.query("ROLLBACK"); } catch (_) {} }
        console.error("[MANUAL PAYMENT] Upload bukti gagal:", error);
        return res.status(500).json({ error: "Bukti transfer gagal disimpan." });
    } finally {
        if (client) client.release();
    }
});

/* Admin Penjualan: daftar bukti yang perlu diverifikasi */
router.get("/manual/admin/pending", requireAuth, requireRole(ROLES.SALES, ROLES.SUPER), async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT p.order_id, p.file_name, p.mime_type, p.file_size, p.submitted_at, o.total, u.name AS customer, u.email
             FROM manual_payment_proofs p JOIN orders o ON o.id=p.order_id LEFT JOIN users u ON u.id=p.user_id
             WHERE p.review_status='pending_verification' AND o.payment_status='pending_verification' ORDER BY p.submitted_at ASC LIMIT 200`
        );
        res.json(result.rows.map(r => ({ ...r, total: Number(r.total), proofUrl: `/api/payment/manual/admin/${encodeURIComponent(r.order_id)}/proof` })));
    } catch (error) {
        console.error("[MANUAL PAYMENT] Daftar verifikasi gagal:", error);
        res.status(500).json({ error: "Gagal mengambil bukti transfer." });
    }
});

/* Admin Penjualan: buka bukti transfer (akses terbatas, bukan URL publik) */
router.get("/manual/admin/:orderId/proof", requireAuth, requireRole(ROLES.SALES, ROLES.SUPER), async (req, res) => {
    try {
        const result = await pool.query(`SELECT file_name,mime_type,image_data FROM manual_payment_proofs WHERE order_id=$1`, [req.params.orderId]);
        if (!result.rows.length) return res.status(404).json({ error: "Bukti transfer tidak ditemukan." });
        const proof = result.rows[0];
        res.set("Cache-Control", "no-store");
        res.set("Content-Type", proof.mime_type);
        res.set("Content-Disposition", "inline");
        return res.send(proof.image_data);
    } catch (error) {
        console.error("[MANUAL PAYMENT] Gagal membuka bukti:", error);
        res.status(500).json({ error: "Bukti transfer tidak dapat dibuka." });
    }
});

/* Admin Penjualan: approve / reject bukti */
router.post("/manual/admin/:orderId/review", requireAuth, requireRole(ROLES.SALES, ROLES.SUPER), async (req, res) => {
    const orderId = String(req.params.orderId || "");
    const decision = String(req.body.decision || "");
    const note = String(req.body.note || "").trim().slice(0,500);
    if (!["approve","reject"].includes(decision)) return res.status(400).json({ error: "Keputusan verifikasi tidak valid." });
    const client = await pool.connect();
    try {
        await client.query("BEGIN");
        const proof = await client.query(`SELECT id,review_status FROM manual_payment_proofs WHERE order_id=$1 FOR UPDATE`, [orderId]);
        if (!proof.rows.length) { await client.query("ROLLBACK"); return res.status(404).json({ error: "Bukti transfer tidak ditemukan." }); }
        if (proof.rows[0].review_status !== "pending_verification") { await client.query("ROLLBACK"); return res.status(409).json({ error: "Bukti ini sudah diproses." }); }
        const order = await client.query(`SELECT id,total,payment_status,payment_method FROM orders WHERE id=$1 FOR UPDATE`, [orderId]);
        if (!order.rows.length) { await client.query("ROLLBACK"); return res.status(404).json({ error: "Pesanan tidak ditemukan." }); }
        if (order.rows[0].payment_method !== "manual_transfer" || order.rows[0].payment_status !== "pending_verification") {
            await client.query("ROLLBACK"); return res.status(409).json({ error: "Pesanan tidak lagi menunggu verifikasi transfer." });
        }
        const paid = decision === "approve";
        const nextPaymentStatus = paid ? "paid" : "pending";
        await client.query(`UPDATE manual_payment_proofs SET review_status=$2,reviewed_at=now(),reviewed_by=$3,review_note=$4 WHERE order_id=$1`, [orderId, paid ? "approved" : "rejected", req.user.userId, note || null]);
        await client.query(`UPDATE payments SET status=$2,raw_payload=COALESCE(raw_payload,'{}'::jsonb) || $3::jsonb WHERE order_id=$1 AND gateway='manual'`, [orderId, paid ? "paid" : "rejected", JSON.stringify({ reviewed_at: new Date().toISOString(), reviewed_by: req.user.userId, review_note: note || null })]);
        if (paid) {
            await client.query(`UPDATE orders SET payment_status='paid',status='Pembayaran Berhasil' WHERE id=$1`, [orderId]);
            await client.query(`INSERT INTO project_status_log(order_id,step,note) SELECT $1,'Pembayaran Berhasil',$2 WHERE NOT EXISTS (SELECT 1 FROM project_status_log WHERE order_id=$1 AND step='Pembayaran Berhasil')`, [orderId, "Transfer bank diverifikasi oleh Admin Penjualan."]);
        } else {
            await client.query(`UPDATE orders SET payment_status='pending',status='Bukti Transfer Ditolak' WHERE id=$1 AND payment_status <> 'paid'`, [orderId]);
        }
        await client.query("COMMIT");
        return res.json({ success: true, orderId, paymentStatus: nextPaymentStatus, proofStatus: paid ? "approved" : "rejected" });
    } catch (error) {
        await client.query("ROLLBACK");
        console.error("[MANUAL PAYMENT] Review gagal:", error);
        return res.status(500).json({ error: "Verifikasi pembayaran gagal." });
    } finally { client.release(); }
});

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
