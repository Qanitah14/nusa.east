"use strict";
const midtransClient = require("midtrans-client");
const pool = require("../db/pool");

function getSnap() {
  const serverKey = process.env.MIDTRANS_SERVER_KEY;
  const clientKey = process.env.MIDTRANS_CLIENT_KEY;
  const production = process.env.MIDTRANS_IS_PRODUCTION === "true";
  if (!serverKey || !clientKey) {
    const error = new Error("Konfigurasi Midtrans belum lengkap. Atur MIDTRANS_SERVER_KEY dan MIDTRANS_CLIENT_KEY pada environment backend.");
    error.status = 503;
    throw error;
  }
  if (production && !serverKey.startsWith("Mid-server-") ) {
    const error = new Error("MIDTRANS_SERVER_KEY bukan Server Key Production yang valid.");
    error.status = 503;
    throw error;
  }
  return new midtransClient.Snap({ isProduction: production, serverKey, clientKey });
}

async function createTransaction({ orderId, grossAmount, customer }) {
  const snap = getSnap();
  const parameter = {
    transaction_details: { order_id: String(orderId), gross_amount: Math.round(Number(grossAmount)) },
    customer_details: { first_name: String(customer.name || "Pelanggan Nusa East").slice(0, 50), email: customer.email, phone: customer.phone || "" },
    credit_card: { secure: true }
  };
  const transaction = await snap.createTransaction(parameter);
  await pool.query(
    `INSERT INTO payments (order_id, gateway, amount, status, gateway_ref)
     VALUES ($1, 'midtrans', $2, 'pending', $3)
     ON CONFLICT (order_id) DO UPDATE SET gateway='midtrans', amount=EXCLUDED.amount, status='pending', gateway_ref=EXCLUDED.gateway_ref, raw_payload=NULL`,
    [orderId, grossAmount, transaction.token || null]
  );
  return transaction;
}

async function handleNotification(notificationBody) {
  const snap = getSnap();
  const statusResponse = await snap.transaction.notification(notificationBody);
  const orderId = String(statusResponse.order_id || "");
  const transactionStatus = statusResponse.transaction_status;
  const fraudStatus = statusResponse.fraud_status;
  let paymentStatus = "pending";
  if (transactionStatus === "capture" || transactionStatus === "settlement") {
    paymentStatus = transactionStatus === "settlement" || fraudStatus === "accept" ? "paid" : "pending";
  } else if (["cancel", "deny", "expire"].includes(transactionStatus)) paymentStatus = "failed";

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      `INSERT INTO payments (order_id,gateway,amount,status,gateway_ref,raw_payload)
       SELECT $1,'midtrans',o.total,$2,$3,$4 FROM orders o WHERE o.id=$1
       ON CONFLICT (order_id) DO UPDATE SET status=EXCLUDED.status,gateway_ref=EXCLUDED.gateway_ref,raw_payload=EXCLUDED.raw_payload`,
      [orderId, paymentStatus, statusResponse.transaction_id || null, JSON.stringify(statusResponse)]
    );
    if (paymentStatus === "paid") {
      const changed = await client.query(
        `UPDATE orders SET payment_status='paid', status='Pembayaran Berhasil' WHERE id=$1 AND payment_status IS DISTINCT FROM 'paid' RETURNING id`,
        [orderId]
      );
      if (changed.rowCount) await client.query("INSERT INTO project_status_log (order_id, step) VALUES ($1,'Pembayaran Berhasil')", [orderId]);
    } else if (paymentStatus === "failed") {
      await client.query("UPDATE orders SET payment_status='failed' WHERE id=$1 AND payment_status <> 'paid'", [orderId]);
    }
    await client.query("COMMIT");
  } catch (error) { await client.query("ROLLBACK"); throw error; }
  finally { client.release(); }
  return { orderId, paymentStatus };
}
module.exports = { createTransaction, handleNotification };
