
/* =========================================================
   NUSA EAST — PAYMENT GATEWAY CONTROLLER
   Midtrans Snap — Production / Sandbox
   ========================================================= */

const midtransClient = require("midtrans-client");
const pool = require("../db/pool");

const snap = new midtransClient.Snap({
    isProduction: process.env.MIDTRANS_IS_PRODUCTION === "true",
    serverKey: process.env.MIDTRANS_SERVER_KEY,
    clientKey: process.env.MIDTRANS_CLIENT_KEY
});

/* =========================================================
   MEMBUAT TRANSAKSI
   ========================================================= */

async function createTransaction({ orderId, grossAmount, customer }) {
    if (
        !process.env.MIDTRANS_SERVER_KEY ||
        !process.env.MIDTRANS_CLIENT_KEY
    ) {
        throw new Error("Konfigurasi Midtrans belum lengkap.");
    }

    const parameter = {
        transaction_details: {
            order_id: String(orderId),
            gross_amount: Math.round(grossAmount)
        },
        customer_details: {
            first_name: customer.name,
            email: customer.email,
            phone: customer.phone
        },
        credit_card: {
            secure: true
        }
    };

    const transaction = await snap.createTransaction(parameter);

    await pool.query(
        `INSERT INTO payments
            (order_id, gateway, amount, status, raw_payload)
         VALUES ($1, 'midtrans', $2, 'pending', $3::jsonb)`,
        [
            orderId,
            grossAmount,
            JSON.stringify({
                snap_token: transaction.token,
                redirect_url: transaction.redirect_url
            })
        ]
    );

    return transaction;
}

/* =========================================================
   MENERIMA NOTIFIKASI MIDTRANS
   ========================================================= */

async function handleNotification(notificationBody) {
    const orderId = String(notificationBody?.order_id || "");

    if (!orderId) {
        throw new Error("Order ID tidak ditemukan dalam notifikasi.");
    }

    // 1. Pastikan Order ID benar-benar ada di database Nusa East.
    const orderResult = await pool.query(
        `SELECT id, total, payment_status
         FROM orders
         WHERE id = $1
         LIMIT 1`,
        [orderId]
    );

    // Notifikasi pengujian Midtrans dapat menggunakan Order ID
    // yang tidak pernah dibuat oleh Nusa East.
    if (!orderResult.rows.length) {
        console.warn(
            "[MIDTRANS] Notifikasi diabaikan karena Order ID tidak terdaftar:",
            orderId
        );

        return {
            success: true,
            ignored: true,
            message: "Order ID tidak terdaftar di Nusa East."
        };
    }

    const order = orderResult.rows[0];

    // 2. Verifikasi transaksi langsung ke Midtrans.
    const statusResponse =
        await snap.transaction.notification(notificationBody);

    // 3. Pastikan respons verifikasi sesuai dengan pesanan.
    if (String(statusResponse.order_id) !== orderId) {
        throw new Error("Order ID hasil verifikasi tidak sesuai.");
    }

    const transactionStatus = statusResponse.transaction_status;
    const fraudStatus = statusResponse.fraud_status;

    // 4. Tentukan status pembayaran.
    let paymentStatus = "pending";

    if (transactionStatus === "settlement") {
        paymentStatus = "paid";
    } else if (transactionStatus === "capture") {
        paymentStatus =
            fraudStatus === "accept" ? "paid" : "pending";
    } else if (transactionStatus === "expire") {
        paymentStatus = "expired";
    } else if (
        ["cancel", "deny"].includes(transactionStatus)
    ) {
        paymentStatus = "failed";
    }

    // 5. Perbarui database secara atomik.
    const client = await pool.connect();

    try {
        await client.query("BEGIN");

        // Ambil pesanan dan kunci selama proses pembaruan.
        const lockedOrder = await client.query(
            `SELECT id, payment_status
             FROM orders
             WHERE id = $1
             FOR UPDATE`,
            [orderId]
        );

        if (!lockedOrder.rows.length) {
            throw new Error("Pesanan tidak ditemukan saat pembaruan.");
        }

        const currentStatus =
            lockedOrder.rows[0].payment_status;

        // Pembayaran yang sudah berhasil tidak boleh diturunkan
        // kembali menjadi pending, failed, atau expired.
        if (currentStatus === "paid") {
            paymentStatus = "paid";
        }

        const orderStatus =
            paymentStatus === "paid"
                ? "Pembayaran Berhasil"
                : paymentStatus === "expired"
                    ? "Pembayaran Kedaluwarsa"
                    : paymentStatus === "failed"
                        ? "Pembayaran Gagal"
                        : "Menunggu Pembayaran";

        // Perbarui data pembayaran untuk pesanan ini.
        await client.query(
            `UPDATE payments
             SET status = $1,
                 gateway_ref = $2,
                 raw_payload =
                    COALESCE(raw_payload, '{}'::jsonb) || $3::jsonb
             WHERE order_id = $4
               AND gateway = 'midtrans'`,
            [
                paymentStatus,
                statusResponse.transaction_id,
                JSON.stringify({
                    transaction_status: transactionStatus,
                    fraud_status: fraudStatus || null,
                    payment_type: statusResponse.payment_type || null,
                    transaction_time: statusResponse.transaction_time || null,
                    expiry_time: statusResponse.expiry_time || null
                }),
                orderId
            ]
        );

        // Perbarui status pesanan.
        await client.query(
            `UPDATE orders
             SET payment_status = $1,
                 status = $2
             WHERE id = $3`,
            [paymentStatus, orderStatus, orderId]
        );

        // Catat keberhasilan pembayaran satu kali.
        if (paymentStatus === "paid") {
            await client.query(
                `INSERT INTO project_status_log (order_id, step)
                 SELECT $1, 'Pembayaran Berhasil'
                 WHERE NOT EXISTS (
                     SELECT 1
                     FROM project_status_log
                     WHERE order_id = $1
                       AND step = 'Pembayaran Berhasil'
                 )`,
                [orderId]
            );
        }

        await client.query("COMMIT");

    } catch (error) {
        await client.query("ROLLBACK");
        throw error;
    } finally {
        client.release();
    }

    console.log("[MIDTRANS] Notifikasi berhasil diproses:", {
        orderId,
        transactionStatus,
        paymentStatus
    });

    return {
        success: true,
        orderId,
        paymentStatus
    };
}

module.exports = {
    createTransaction,
    handleNotification
};
