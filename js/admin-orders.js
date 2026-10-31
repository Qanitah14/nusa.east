/* =========================================================
   NUSA EAST — ADMIN ORDERS
   Dipakai halaman admin: Pesanan, Tracking Project, Dashboard.
   Butuh js/admin.js dan js/orders.js dimuat lebih dulu.

   Sumber data pesanan:
   - "api"   : pesanan di database (backend /api/orders/admin/*)
   - "local" : pesanan simulasi dari checkout di browser ini
               (localStorage, dibuat js/orders.js) — supaya alur demo
               pelanggan -> admin tetap berjalan tanpa backend.

   Aturan: tombol "Tracking Project" hanya aktif bila pembayaran
   pesanan sudah berhasil.
   ========================================================= */
const AdminOrders = (() => {
  const STEPS = STATUS_STEPS; // dari js/orders.js
  const fmtDate = (d) => d ? new Date(d).toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" }) : "-";
  const fmtDateTime = (d) => d ? new Date(d).toLocaleString("id-ID", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "-";

  const localSessionName = () => {
    try { return (JSON.parse(localStorage.getItem("nusaeast_session") || "null") || {}).name || ""; }
    catch (_) { return ""; }
  };

  /* ---------- normalisasi ---------- */
  function fromLocal(o) {
    const items = (o.items || []).map((i) => ({ name: i.name, qty: i.qty || 1, lineTotal: Number(i.lineTotal) || 0 }));
    const idx = Math.min(Math.max(o.statusIndex || 0, 0), STEPS.length - 1);
    return {
      source: "local", id: o.id,
      customer: localSessionName() || "Pelanggan (demo lokal)", email: "",
      items, itemCount: items.length, total: Number(o.total) || 0, paymentMethod: o.paymentMethod || "-",
      paymentStatus: idx >= 1 ? "paid" : "pending",
      status: STEPS[idx], statusIndex: idx, createdAt: o.createdAt,
      log: (o.log || []).map((l) => ({ step: l.step, date: l.date, note: l.note || "" })),
      brief: o.brief || null
    };
  }

  function fromApi(r) {
    const idx = Math.max(0, STEPS.indexOf(r.status));
    const items = (r.items || []).map((i) => ({ name: i.name, qty: i.qty || 1, lineTotal: Number(i.line_total) || 0 }));
    return {
      source: "api", id: r.id,
      customer: r.customer || "-", email: r.email || "", phone: r.phone || r.phone_number || "", address: r.customer_address || r.address || "",
      items, itemCount: r.item_count ?? items.length, total: Number(r.total) || 0, paymentMethod: r.payment_method || "-",
      paymentStatus: r.payment_status || "pending",
      status: r.status || STEPS[0], statusIndex: idx, createdAt: r.created_at,
      log: (r.log || []).map((l) => ({ step: l.step, date: l.created_at, note: l.note || "" })),
      brief: r.brief || null
    };
  }

  /* ---------- pengambilan data ---------- */
  async function loadAll() {
    const orders = [];
    let apiError = "";
    try {
      const rows = await Admin.api.get("/orders/admin/all");
      rows.forEach((r) => orders.push(fromApi(r)));
    } catch (err) { apiError = err.message; }
    getOrders().forEach((o) => orders.push(fromLocal(o)));
    orders.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    return { orders, apiError };
  }

  async function loadOne(id, source) {
    if (source === "local") {
      const o = getOrder(id);
      if (!o) throw new Error("Pesanan tidak ditemukan di browser ini.");
      return fromLocal(o);
    }
    return fromApi(await Admin.api.get("/orders/admin/" + encodeURIComponent(id)));
  }

  /* ---------- aturan ---------- */
  const isPaid = (o) => o.paymentStatus === "paid";
  const isDone = (o) => o.statusIndex >= STEPS.length - 1;
  const nextStep = (o) => (isDone(o) ? null : STEPS[o.statusIndex + 1]);

  async function advance(o, note) {
    if (!isPaid(o)) throw new Error("Pembayaran belum berhasil, tracking project belum bisa dijalankan.");
    const step = nextStep(o);
    if (!step) throw new Error("Project sudah selesai.");
    if (o.source === "local") advanceOrder(o.id, note || "");
    else await Admin.api.post("/orders/" + encodeURIComponent(o.id) + "/status", { step, note: note || "" });
    return step;
  }

  /* ---------- tampilan ---------- */
  const payBadge = (o) => {
    if (isPaid(o)) return `<span class="badge badge-green">Lunas</span>`;
    if (o.paymentStatus === "failed" || o.paymentStatus === "expired") return `<span class="badge badge-red">${o.paymentStatus === "failed" ? "Gagal" : "Kedaluwarsa"}</span>`;
    return `<span class="badge badge-orange">Menunggu bayar</span>`;
  };
  const statusBadge = (o) => isDone(o) && isPaid(o)
    ? `<span class="badge badge-green">${Admin.esc(o.status)}</span>`
    : `<span class="badge ${isPaid(o) ? "badge-orange" : "badge-gray"}">${Admin.esc(isPaid(o) ? o.status : "Belum dimulai")}</span>`;
  const sourceTag = (o) => o.source === "local" ? ` <span class="badge badge-gray" title="Pesanan simulasi dari browser ini">Demo lokal</span>` : "";

  // Tombol Tracking Project: aktif hanya jika pembayaran berhasil.
  function trackingBtn(o, extraClass = "") {
    if (isPaid(o)) {
      return `<a class="btn btn-primary btn-sm ${extraClass}" href="tracking.html?order=${encodeURIComponent(o.id)}&src=${o.source}"><i class="fas fa-route" aria-hidden="true"></i> Tracking Project</a>`;
    }
    return `<button type="button" class="btn btn-outline btn-sm ${extraClass}" disabled title="Tersedia setelah pembayaran berhasil" aria-disabled="true"><i class="fas fa-lock" aria-hidden="true"></i> Tracking Project</button>`;
  }

  return { STEPS, fmtDate, fmtDateTime, fromApi, fromLocal, loadAll, loadOne, isPaid, isDone, nextStep, advance, payBadge, statusBadge, sourceTag, trackingBtn };
})();
