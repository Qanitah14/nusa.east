/* =========================================================
   NUSA EAST — PAYMENT GATEWAY CONTROLLER
   Midtrans Snap — Production / Sandbox
   ========================================================= */

const crypto = require("crypto");
const midtransClient = require("midtrans-client");
const pool = require("../db/pool");

const snap = new midtransClient.Snap({
    isProduction: process.env.MIDTRANS_IS_PRODUCTION === "true",
    serverKey: process.env.MIDTRANS_SERVER_KEY,
    clientKey: process.env.MIDTRANS_CLIENT_KEY
});

/* Membuat transaksi Snap. */
async function createTransaction({ orderId, grossAmount, customer }) {
    if (!process.env.MIDTRANS_SERVER_KEY || !process.env.MIDTRANS_CLIENT_KEY) {
        throw new Error("Konfigurasi Midtrans belum lengkap.");
    }

    const amount = Math.round(Number(grossAmount));
    if (!Number.isFinite(amount) || amount < 1) {
        throw new Error("Nominal pembayaran tidak valid.");
    }

    const parameter = {
        transaction_details: {
            order_id: String(orderId),
            gross_amount: amount
        },
        customer_details: {
            first_name: customer.name,
            email: customer.email,
            phone: customer.phone || ""
        },
        credit_card: { secure: true }
    };

    const transaction = await snap.createTransaction(parameter);

    await pool.query(
        `INSERT INTO payments (order_id, gateway, amount, status, raw_payload)
         VALUES ($1, 'midtrans', $2, 'pending', $3::jsonb)`,
        [orderId, amount, JSON.stringify({
            snap_token: transaction.token,
            redirect_url: transaction.redirect_url
        })]
    );

    return transaction;
}

/*
 * Verifikasi signature notifikasi tanpa meminta status transaksi ke API Midtrans.
 * Ini menghindari error 404 "Transaction doesn't exist" pada notifikasi uji,
 * sekaligus tetap memvalidasi bahwa payload benar-benar ditandatangani Midtrans.
 */
function verifyNotificationSignature(body) {
    const serverKey = process.env.MIDTRANS_SERVER_KEY;
    if (!serverKey) throw new Error("MIDTRANS_SERVER_KEY belum dikonfigurasi.");

    const orderId = String(body?.order_id || "");
    const statusCode = String(body?.status_code || "");
    const grossAmount = String(body?.gross_amount || "");
    const receivedSignature = String(body?.signature_key || "").toLowerCase();

    if (!orderId || !statusCode || !grossAmount || !receivedSignature) {
        throw new Error("Data signature notifikasi Midtrans tidak lengkap.");
    }

    const expectedSignature = crypto
        .createHash("sha512")
        .update(orderId + statusCode + grossAmount + serverKey)
        .digest("hex");

    const expected = Buffer.from(expectedSignature, "hex");
    const received = Buffer.from(receivedSignature, "hex");

    if (expected.length !== received.length || !crypto.timingSafeEqual(expected, received)) {
        throw new Error("Signature notifikasi Midtrans tidak valid.");
    }

    return { orderId, grossAmount };
}

/* Menerima dan memproses notifikasi pembayaran Midtrans secara idempoten. */
async function handleNotification(notificationBody) {
    const { orderId, grossAmount } = verifyNotificationSignature(notificationBody);

    const transactionStatus = String(notificationBody.transaction_status || "").toLowerCase();
    const fraudStatus = String(notificationBody.fraud_status || "").toLowerCase();
    const amountFromGateway = Number(grossAmount);

    if (!transactionStatus) throw new Error("Status transaksi Midtrans tidak ditemukan.");

    // Notifikasi uji/dashboard yang tidak terkait pesanan lokal cukup diakui.
    const orderResult = await pool.query(
        `SELECT id, total, payment_status FROM orders WHERE id = $1 LIMIT 1`,
        [orderId]
    );

    if (!orderResult.rows.length) {
        console.info("[MIDTRANS] Notifikasi diabaikan; order tidak terdaftar:", orderId);
        return { success: true, ignored: true, message: "Order ID tidak terdaftar di Nusa East." };
    }

    const order = orderResult.rows[0];
    const expectedAmount = Number(order.total);
    if (!Number.isFinite(amountFromGateway) || Math.abs(amountFromGateway - expectedAmount) > 0.01) {
        throw new Error(`Nominal notifikasi tidak sesuai untuk pesanan ${orderId}.`);
    }

    let paymentStatus = "pending";
    if (transactionStatus === "settlement") {
        paymentStatus = "paid";
    } else if (transactionStatus === "capture") {
        paymentStatus = fraudStatus === "accept" ? "paid" : "pending";
    } else if (transactionStatus === "expire") {
        paymentStatus = "expired";
    } else if (["cancel", "deny"].includes(transactionStatus)) {
        paymentStatus = "failed";
    }

    const client = await pool.connect();
    try {
        await client.query("BEGIN");

        const lockedOrder = await client.query(
            `SELECT id, payment_status FROM orders WHERE id = $1 FOR UPDATE`,
            [orderId]
        );
        if (!lockedOrder.rows.length) throw new Error("Pesanan tidak ditemukan saat pembaruan.");

        // Status paid bersifat final untuk mencegah notifikasi terlambat menurunkannya.
        if (lockedOrder.rows[0].payment_status === "paid") paymentStatus = "paid";

        const orderStatus = paymentStatus === "paid"
            ? "Pembayaran Berhasil"
            : paymentStatus === "expired"
                ? "Pembayaran Kedaluwarsa"
                : paymentStatus === "failed"
                    ? "Pembayaran Gagal"
                    : "Menunggu Pembayaran";

        const paymentPayload = JSON.stringify({
            transaction_id: notificationBody.transaction_id || null,
            transaction_status: transactionStatus,
            fraud_status: fraudStatus || null,
            payment_type: notificationBody.payment_type || null,
            transaction_time: notificationBody.transaction_time || null,
            settlement_time: notificationBody.settlement_time || null,
            expiry_time: notificationBody.expiry_time || null,
            status_code: notificationBody.status_code,
            gross_amount: grossAmount
        });

        const updatedPayment = await client.query(
            `UPDATE payments
                SET status = $1,
                    gateway_ref = COALESCE($2, gateway_ref),
                    raw_payload = COALESCE(raw_payload, '{}'::jsonb) || $3::jsonb
              WHERE id = (
                    SELECT id FROM payments
                     WHERE order_id = $4 AND gateway = 'midtrans'
                     ORDER BY created_at DESC LIMIT 1
              )
              RETURNING id`,
            [paymentStatus, notificationBody.transaction_id || null, paymentPayload, orderId]
        );

        // Tetap simpan status jika baris payment lama belum tersedia.
        if (!updatedPayment.rowCount) {
            await client.query(
                `INSERT INTO payments (order_id, gateway, gateway_ref, amount, status, raw_payload)
                 VALUES ($1, 'midtrans', $2, $3, $4, $5::jsonb)`,
                [orderId, notificationBody.transaction_id || null, expectedAmount, paymentStatus, paymentPayload]
            );
        }

        await client.query(
            `UPDATE orders SET payment_status = $1, status = $2 WHERE id = $3`,
            [paymentStatus, orderStatus, orderId]
        );

        if (paymentStatus === "paid") {
            await client.query(
                `INSERT INTO project_status_log (order_id, step)
                 SELECT $1, 'Pembayaran Berhasil'
                  WHERE NOT EXISTS (
                    SELECT 1 FROM project_status_log
                     WHERE order_id = $1 AND step = 'Pembayaran Berhasil'
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
        orderId, transactionStatus, paymentStatus
    });

    return { success: true, orderId, paymentStatus };
}

module.exports = { createTransaction, handleNotification };
