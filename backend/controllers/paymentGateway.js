/* =========================================================
   NUSA EAST — PAYMENT GATEWAY CONTROLLER
   Menggunakan Midtrans Snap (populer & mendukung VA, e-wallet,
   QRIS sekaligus untuk pasar Indonesia).

   CARA AKTIVASI:
   1. Daftar sandbox gratis: https://dashboard.midtrans.com/register
   2. Ambil Server Key & Client Key dari dashboard (mode Sandbox)
   3. Isi MIDTRANS_SERVER_KEY & MIDTRANS_CLIENT_KEY di file .env
   4. Set MIDTRANS_IS_PRODUCTION=true saat sudah siap live

   Jika ingin pakai Xendit / gateway lain, cukup ganti isi
   createTransaction() & handleNotification() — struktur endpoint
   di routes/payment.js TIDAK perlu diubah.
   ========================================================= */

const midtransClient = require("midtrans-client");
const pool = require("../db/pool");

const snap = new midtransClient.Snap({
  isProduction: process.env.MIDTRANS_IS_PRODUCTION === "true",
  serverKey: process.env.MIDTRANS_SERVER_KEY,
  clientKey: process.env.MIDTRANS_CLIENT_KEY
});

/**
 * Membuat transaksi baru di Midtrans dan mengembalikan
 * Snap Token yang dipakai frontend untuk membuka popup pembayaran.
 */
async function createTransaction({ orderId, grossAmount, customer }) {
  const parameter = {
    transaction_details: {
      order_id: orderId,
      gross_amount: Math.round(grossAmount)
    },
    customer_details: {
      first_name: customer.name,
      email: customer.email,
      phone: customer.phone
    },
    credit_card: { secure: true }
  };

  const transaction = await snap.createTransaction(parameter);

  await pool.query(
    `INSERT INTO payments (order_id, gateway, amount, status)
     VALUES ($1, 'midtrans', $2, 'pending')`,
    [orderId, grossAmount]
  );

  return transaction; // berisi { token, redirect_url }
}

/**
 * Dipanggil oleh webhook Midtrans (POST /api/payment/notification)
 * setiap ada perubahan status transaksi (settlement, expire, dll).
 */
async function handleNotification(notificationBody) {
  const statusResponse = await snap.transaction.notification(notificationBody);
  const orderId = statusResponse.order_id;
  const transactionStatus = statusResponse.transaction_status;
  const fraudStatus = statusResponse.fraud_status;

  let paymentStatus = "pending";
  if (transactionStatus === "capture" || transactionStatus === "settlement") {
    paymentStatus = fraudStatus === "accept" || !fraudStatus ? "paid" : "pending";
  } else if (["cancel", "deny", "expire"].includes(transactionStatus)) {
    paymentStatus = "failed";
  }

  await pool.query(
    `UPDATE payments SET status = $1, gateway_ref = $2, raw_payload = $3 WHERE order_id = $4`,
    [paymentStatus, statusResponse.transaction_id, statusResponse, orderId]
  );

  if (paymentStatus === "paid") {
    await pool.query(
      `UPDATE orders SET payment_status = 'paid', status = 'Pembayaran Berhasil' WHERE id = $1`,
      [orderId]
    );
    await pool.query(
      `INSERT INTO project_status_log (order_id, step) VALUES ($1, 'Pembayaran Berhasil')`,
      [orderId]
    );
  }

  return { orderId, paymentStatus };
}

module.exports = { createTransaction, handleNotification };
