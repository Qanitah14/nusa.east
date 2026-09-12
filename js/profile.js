/* NUSA EAST — PROFILE FRONTEND DEMO */
(function () {
  const session = (() => {
    try { return JSON.parse(localStorage.getItem("nusaeast_session") || "null"); }
    catch (_) { return null; }
  })();

  if (!session) {
    location.href = "login.html";
    return;
  }

  const PROFILE_KEY = `nusaeast_profile_${session.id || session.email}`;
  const saved = (() => {
    try { return JSON.parse(localStorage.getItem(PROFILE_KEY) || "{}"); }
    catch (_) { return {}; }
  })();

  const $ = id => document.getElementById(id);
  $("profileName").textContent = session.name || "Pengguna Nusa East";
  $("profileEmail").textContent = session.email || "-";
  $("accountName").textContent = session.name || "-";
  $("accountEmail").textContent = session.email || "-";
  $("accountPhone").textContent = session.phone || "-";

  const fields = {
    brandName: saved.brandName || "",
    brandProduct: saved.brandProduct || "",
    brandInstagram: saved.brandInstagram || "",
    brandWebsite: saved.brandWebsite || "",
    brandTarget: saved.brandTarget || "",
    brandCity: saved.brandCity || "Makassar",
    brandDescription: saved.brandDescription || "",
    contactName: saved.contactName || session.name || "",
    contactEmail: saved.contactEmail || session.email || "",
    contactPhone: saved.contactPhone || session.phone || "",
    contactPosition: saved.contactPosition || "",
    contactPreference: saved.contactPreference || "WhatsApp"
  };
  Object.entries(fields).forEach(([key, value]) => { if ($(key)) $(key).value = value; });

  function saveProfile() {
    const data = {};
    Object.keys(fields).forEach(key => { if ($(key)) data[key] = $(key).value.trim ? $(key).value.trim() : $(key).value; });
    localStorage.setItem(PROFILE_KEY, JSON.stringify(data));
    if (typeof showToast === "function") showToast("Perubahan profil berhasil disimpan.");
  }

  $("businessForm").addEventListener("submit", e => { e.preventDefault(); saveProfile(); });
  $("contactForm").addEventListener("submit", e => { e.preventDefault(); saveProfile(); });

  document.querySelectorAll(".profile-menu-item[data-tab]").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".profile-menu-item[data-tab]").forEach(b => b.classList.remove("active"));
      document.querySelectorAll(".profile-panel").forEach(p => p.classList.remove("active"));
      btn.classList.add("active");
      const panel = document.getElementById(`panel-${btn.dataset.tab}`);
      if (panel) panel.classList.add("active");
    });
  });

  $("profileLogout").addEventListener("click", () => {
    if (typeof nusaeastLogout === "function") nusaeastLogout();
  });

  const orderBox = $("profileOrders");
  let orders = [];
  try { orders = JSON.parse(localStorage.getItem("nusaeast_orders") || "[]"); } catch (_) {}
  if (!orders.length) {
    orderBox.innerHTML = `<div class="profile-empty"><strong>Belum ada pesanan</strong><p>Pesanan yang sudah dibuat akan muncul di sini.</p><a href="packages.html" class="btn btn-primary btn-sm">Lihat Paket</a></div>`;
  } else {
    orderBox.innerHTML = orders.map(order => `
      <article class="profile-order-card">
        <div><small>ID Pesanan</small><strong>${order.id}</strong></div>
        <div><small>Status</small><span class="profile-order-status">${order.status || "Pesanan Dibuat"}</span></div>
        <div><small>Total</small><strong>${typeof formatIDR === "function" ? formatIDR(order.total) : order.total}</strong></div>
        <a href="tracking.html?order=${encodeURIComponent(order.id)}">Lihat Tracking →</a>
      </article>
    `).join("");
  }
})();
