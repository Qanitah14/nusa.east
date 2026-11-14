
/* =========================================================
   NUSA EAST — PAYMENT GATEWAY
   Midtrans Snap — Production / Sandbox
   ========================================================= */

const crypto = require("crypto");
const midtransClient = require("midtrans-client");
const pool = require("../db/pool");

const isProduction =
    process.env.MIDTRANS_IS_PRODUCTION === "true";

const serverKey = process.env.MIDTRANS_SERVER_KEY;
const clientKey = process.env.MIDTRANS_CLIENT_KEY;

const snap = new midtransClient.Snap({
    isProduction,
    serverKey,
    clientKey
});

/* =========================================================
   1. AMBIL STATUS TRANSAKSI DARI MIDTRANS
   ========================================================= */

async function fetchMidtransStatus(orderId) {
    if (!serverKey) {
        throw new Error("MIDTRANS_SERVER_KEY belum dikonfigurasi.");
    }

    const host = isProduction
        ? "https://api.midtrans.com"
        : "https://api.sandbox.midtrans.com";

    const url = `${host}/v2/${encodeURIComponent(orderId)}/status`;

    const response = await fetch(url, {
        method: "GET",
        headers: {
            Authorization:
                "Basic " +
                Buffer.from(`${serverKey}:`).toString("base64"),
            Accept: "application/json"
        }
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
        throw new Error(
            data.status_message ||
            `Midtrans Status API gagal: HTTP ${response.status}`
        );
    }

    return data;
}

/* =========================================================
   2. TERJEMAHKAN STATUS MIDTRANS
   ========================================================= */

function mapGatewayStatus(transactionStatus, fraudStatus) {
    const status = String(transactionStatus || "").toLowerCase();
    const fraud = String(fraudStatus || "").toLowerCase();

    if (status === "settlement") {
        return "paid";
    }

    if (status === "capture") {
        return fraud === "accept" ? "paid" : "pending";
    }

    if (status === "expire") {
        return "expired";
    }

    if (["cancel", "deny", "failure"].includes(status)) {
        return "failed";
    }

    return "pending";
}

/* =========================================================
   3. SIMPAN STATUS PEMBAYARAN KE DATABASE
   ========================================================= */

async function persistPaymentStatus(orderId, gatewayData) {
    const transactionStatus = String(
        gatewayData.transaction_status || ""
    ).toLowerCase();

    const amount = Number(gatewayData.gross_amount);

    if (!transactionStatus) {
        throw new Error("Status transaksi Midtrans tidak ditemukan.");
    }

    if (!Number.isFinite(amount)) {
        throw new Error("Nominal pembayaran Midtrans tidak valid.");
    }

    const gatewayStatus = mapGatewayStatus(
        transactionStatus,
        gatewayData.fraud_status
    );

    const client = await pool.connect();

    let finalStatus;

    try {
        await client.query("BEGIN");

        const orderResult = await client.query(
            `SELECT id, total, payment_status
             FROM orders
             WHERE id = $1
             FOR UPDATE`,
            [orderId]
        );

        if (!orderResult.rows.length) {
            throw new Error(
                `Pesanan ${orderId} tidak ditemukan di database.`
            );
        }

        const order = orderResult.rows[0];
        const expectedAmount = Number(order.total);

        if (
            !Number.isFinite(expectedAmount) ||
            Math.abs(amount - expectedAmount) > 0.01
        ) {
            throw new Error(
                `Nominal Midtrans ${amount} tidak sesuai dengan total pesanan ${expectedAmount}.`
            );
        }

        // Status paid tidak boleh berubah kembali menjadi pending.
        finalStatus =
            order.payment_status === "paid"
                ? "paid"
                : gatewayStatus;

        let orderLabel = "Menunggu Pembayaran";

        if (finalStatus === "paid") {
            orderLabel = "Pembayaran Berhasil";
        } else if (finalStatus === "expired") {
            orderLabel = "Pembayaran Kedaluwarsa";
        } else if (finalStatus === "failed") {
            orderLabel = "Pembayaran Gagal";
        }

        const payload = JSON.stringify({
            transaction_id: gatewayData.transaction_id || null,
            transaction_status: transactionStatus,
            fraud_status: gatewayData.fraud_status || null,
            payment_type: gatewayData.payment_type || null,
            transaction_time: gatewayData.transaction_time || null,
            settlement_time: gatewayData.settlement_time || null,
            expiry_time: gatewayData.expiry_time || null,
            status_code: gatewayData.status_code || null,
            gross_amount: String(gatewayData.gross_amount),
            status_checked_at: new Date().toISOString()
        });

        const paymentResult = await client.query(
            `UPDATE payments
             SET status = $1,
                 gateway_ref = COALESCE($2, gateway_ref),
                 raw_payload =
                    COALESCE(raw_payload, '{}'::jsonb) || $3::jsonb
             WHERE id = (
                 SELECT id
                 FROM payments
                 WHERE order_id = $4
                   AND gateway = 'midtrans'
                 ORDER BY created_at DESC
                 LIMIT 1
             )
             RETURNING id`,
            [
                finalStatus,
                gatewayData.transaction_id || null,
                payload,
                orderId
            ]
        );

        if (!paymentResult.rowCount) {
            await client.query(
                `INSERT INTO payments
                 (order_id, gateway, gateway_ref, amount, status, raw_payload)
                 VALUES ($1, 'midtrans', $2, $3, $4, $5::jsonb)`,
                [
                    orderId,
                    gatewayData.transaction_id || null,
                    expectedAmount,
                    finalStatus,
                    payload
                ]
            );
        }

        // Parameter dibuat terpisah untuk menghindari
        // konflik tipe parameter PostgreSQL.
        await client.query(
            `UPDATE orders
             SET payment_status = $1::varchar,
                 status = $2::varchar
             WHERE id = $3`,
            [finalStatus, orderLabel, orderId]
        );

        await client.query("COMMIT");

    } catch (error) {
        await client.query("ROLLBACK");
        throw error;

    } finally {
        client.release();
    }

    // Catat pembayaran berhasil pada riwayat proyek.
    if (finalStatus === "paid") {
        try {
            await pool.query(
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

        } catch (error) {
            console.error(
                "[MIDTRANS] Gagal mencatat riwayat proyek:",
                error.message
            );
        }
    }

    console.log("[MIDTRANS] Status berhasil disinkronkan:", {
        orderId,
        transactionStatus,
        paymentStatus: finalStatus
    });

    return {
        success: true,
        orderId,
        transactionStatus,
        paymentStatus: finalStatus
    };
}

/* =========================================================
   4. MEMBUAT TRANSAKSI SNAP
   ========================================================= */

async function createTransaction({
    orderId,
    grossAmount,
    customer
}) {
    if (!serverKey || !clientKey) {
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
            first_name: customer.name || "Pelanggan Nusa East",
            email: customer.email,
            phone: customer.phone || ""
        },

        credit_card: {
            secure: true
        },

        callbacks: {
            finish:
                `https://nusa-east.vercel.app/confirmation.html?order=${encodeURIComponent(orderId)}`
        }
    };

    const transaction =
        await snap.createTransaction(parameter);

    await pool.query(
        `INSERT INTO payments
         (order_id, gateway, amount, status, raw_payload)
         VALUES ($1, 'midtrans', $2, 'pending', $3::jsonb)`,
        [
            orderId,
            amount,
            JSON.stringify({
                snap_token: transaction.token,
                redirect_url: transaction.redirect_url
            })
        ]
    );

    return transaction;
}

/* =========================================================
   5. VERIFIKASI SIGNATURE NOTIFIKASI
   ========================================================= */

function verifyNotificationSignature(body) {
    if (!serverKey) {
        throw new Error("MIDTRANS_SERVER_KEY belum dikonfigurasi.");
    }

    const orderId = String(body?.order_id || "");
    const statusCode = String(body?.status_code || "");
    const grossAmount = String(body?.gross_amount || "");
    const signature = String(body?.signature_key || "").toLowerCase();

    if (!orderId || !statusCode || !grossAmount || !signature) {
        throw new Error("Data signature notifikasi tidak lengkap.");
    }

    const expected = crypto
        .createHash("sha512")
        .update(orderId + statusCode + grossAmount + serverKey)
        .digest("hex");

    const expectedBuffer = Buffer.from(expected, "hex");
    const receivedBuffer = Buffer.from(signature, "hex");

    if (
        expectedBuffer.length !== receivedBuffer.length ||
        !crypto.timingSafeEqual(expectedBuffer, receivedBuffer)
    ) {
        throw new Error("Signature notifikasi Midtrans tidak valid.");
    }

    return orderId;
}

/* =========================================================
   6. MEMPROSES WEBHOOK MIDTRANS
   ========================================================= */

async function handleNotification(body) {
    const orderId = verifyNotificationSignature(body);

    // Notifikasi pengujian Midtrans dapat memakai order ID
    // khusus yang memang tidak terdaftar di database kita.
    const orderCheck = await pool.query(
        `SELECT id FROM orders WHERE id = $1 LIMIT 1`,
        [orderId]
    );

    if (!orderCheck.rows.length) {
        console.log(
            "[MIDTRANS] Notifikasi diabaikan karena order tidak terdaftar:",
            orderId
        );

        return {
            success: true,
            ignored: true,
            message: "Order ID tidak terdaftar di Nusa East."
        };
    }

    // Ambil status resmi transaksi dari server Midtrans.
    const gatewayData = await fetchMidtransStatus(orderId);

    return persistPaymentStatus(orderId, gatewayData);
}

/* =========================================================
   7. SINKRONISASI STATUS MANUAL
   ========================================================= */

async function syncTransactionStatus(orderId) {
    const gatewayData = await fetchMidtransStatus(orderId);

    return persistPaymentStatus(orderId, gatewayData);
}

module.exports = {
    createTransaction,
    handleNotification,
    syncTransactionStatus
};
