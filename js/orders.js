/* =========================================================
   NUSA EAST — ORDER SIMULATION ENGINE
   Simulasi alur: Pesan Paket → Pembayaran → Isi Brief →
   Brief & Bahan Lengkap → Project Dimulai → Produksi → Preview
   → Revisi → Finalisasi → Project Selesai
   Disimpan di localStorage supaya tracking page bisa membaca
   status yang sama tanpa perlu backend aktif (untuk demo/offline).
   Struktur data ini identik dengan skema tabel `orders` &
   `project_status_log` di backend/db/schema.sql.
   ========================================================= */

const ORDERS_KEY = "nusaeast_orders";

function getOrders() {
  return JSON.parse(localStorage.getItem(ORDERS_KEY) || "[]");
}
function saveOrders(orders) {
  localStorage.setItem(ORDERS_KEY, JSON.stringify(orders));
}

function generateOrderId() {
  const year = new Date().getFullYear();
  const rand = Math.floor(1000 + Math.random() * 9000);
  return `NE-${year}-${rand}`;
}

const STATUS_STEPS = [
  "Pesanan Dibuat",
  "Pembayaran Berhasil",
  "Brief Diisi",
  "Brief & Bahan Lengkap",
  "Project Dimulai",
  "Produksi",
  "Preview Dikirim",
  "Revisi",
  "Finalisasi",
  "Project Selesai"
];

function createOrder({ items, total, paymentMethod }) {
  const orders = getOrders();
  const today = new Date();
  const order = {
    id: generateOrderId(),
    items,
    total,
    paymentMethod,
    createdAt: today.toISOString(),
    statusIndex: 1, // langsung "Pembayaran Berhasil" karena simulasi pembayaran instan
    revisionsUsed: 0,
    log: [
      { step: "Pesanan Dibuat", date: today.toISOString() },
      { step: "Pembayaran Berhasil", date: today.toISOString() }
    ],
    brief: null
  };
  orders.push(order);
  saveOrders(orders);
  return order;
}

function getOrder(id) {
  return getOrders().find(o => o.id === id);
}

function advanceOrder(id, note) {
  const orders = getOrders();
  const order = orders.find(o => o.id === id);
  if (!order) return null;
  if (order.statusIndex < STATUS_STEPS.length - 1) {
    order.statusIndex++;
    order.log.push({ step: STATUS_STEPS[order.statusIndex], date: new Date().toISOString(), note: note || "" });
  }
  saveOrders(orders);
  return order;
}

function saveBrief(id, briefData) {
  const orders = getOrders();
  const order = orders.find(o => o.id === id);
  if (!order) return null;
  order.brief = briefData;
  saveOrders(orders);
  advanceOrder(id, "Brief disubmit oleh klien");
  // Simulasikan bahan otomatis lengkap setelah brief (untuk keperluan demo)
  advanceOrder(id, "Bahan pendukung diterima");
  return order;
}
