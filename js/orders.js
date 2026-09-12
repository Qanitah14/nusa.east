/* =========================================================
   NUSA EAST — FRONTEND ORDER/TRACKING DEMO (localStorage)
   Fokus tahap HTML + responsive. Data sementara di browser.
   ========================================================= */

const ORDERS_KEY = "nusaeast_orders";
const STATUS_STEPS = [
  "Pesanan Dibuat", "Pembayaran Berhasil", "Brief Diisi", "Brief & Bahan Lengkap",
  "Project Dimulai", "Produksi", "Preview Dikirim", "Revisi", "Finalisasi", "Project Selesai"
];

function readOrders() {
  try { return JSON.parse(localStorage.getItem(ORDERS_KEY) || "[]"); }
  catch (_) { return []; }
}
function saveOrders(orders) { localStorage.setItem(ORDERS_KEY, JSON.stringify(orders)); }
function makeOrderId() {
  const d = new Date();
  return `NE-${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}${String(d.getDate()).padStart(2,"0")}-${Math.random().toString(36).slice(2,6).toUpperCase()}`;
}

async function createOrder({ items, total, paymentMethod }) {
  const orders = readOrders();
  const now = new Date().toISOString();
  const order = {
    id: makeOrderId(),
    items: (items || []).map(i => ({ ...i, lineTotal: Number(i.price) * (i.qty || 1) })),
    total: Number(total) || 0,
    paymentMethod: paymentMethod || "Belum dipilih",
    paymentStatus: "Berhasil",
    createdAt: now,
    status: "Pembayaran Berhasil",
    statusIndex: 1,
    revisionsUsed: 0,
    revisionLimit: 1,
    brief: null,
    log: [
      { step: "Pesanan Dibuat", note: "Pesanan berhasil dibuat.", date: now },
      { step: "Pembayaran Berhasil", note: "Pembayaran demo berhasil dikonfirmasi.", date: now }
    ]
  };
  orders.unshift(order);
  saveOrders(orders);
  return order;
}

async function getOrder(id) {
  return readOrders().find(o => o.id === id) || null;
}

async function advanceOrder(id, step, note = "") {
  const orders = readOrders();
  const order = orders.find(o => o.id === id);
  if (!order) return null;
  if (!step) step = STATUS_STEPS[Math.min((order.statusIndex || 0) + 1, STATUS_STEPS.length - 1)];
  order.status = step;
  order.statusIndex = Math.max(0, STATUS_STEPS.indexOf(step));
  order.log = order.log || [];
  order.log.push({ step, note: note || `Status berubah menjadi ${step}.`, date: new Date().toISOString() });
  saveOrders(orders);
  return order;
}

async function saveBrief(id, briefData) {
  const orders = readOrders();
  const order = orders.find(o => o.id === id);
  if (!order) throw new Error("Order tidak ditemukan.");
  order.brief = briefData;
  order.status = "Brief Diisi";
  order.statusIndex = STATUS_STEPS.indexOf("Brief Diisi");
  order.log = order.log || [];
  order.log.push({ step: "Brief Diisi", note: "Brief project telah dikirim.", date: new Date().toISOString() });
  saveOrders(orders);
  return order;
}

async function requestRevision(id, note) {
  const orders = readOrders();
  const order = orders.find(o => o.id === id);
  if (!order) throw new Error("Order tidak ditemukan.");
  order.revisionsUsed = (order.revisionsUsed || 0) + 1;
  order.status = "Revisi";
  order.statusIndex = STATUS_STEPS.indexOf("Revisi");
  order.log = order.log || [];
  order.log.push({ step: "Revisi", note: note || "Permintaan revisi dikirim.", date: new Date().toISOString() });
  saveOrders(orders);
  return order;
}
