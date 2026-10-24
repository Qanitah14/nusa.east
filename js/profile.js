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
  const AVATAR_KEY = `${PROFILE_KEY}_avatar`;
  const avatarBox = $("profileAvatarPreview");
  const photoInput = $("profilePhotoInput");
  const photoMessage = $("profilePhotoMessage");
  function renderAvatar(src) {
    if (!avatarBox) return;
    if (src) { avatarBox.innerHTML = ""; const img = document.createElement("img"); img.src = src; img.alt = "Foto profil"; img.style.cssText = "width:100%;height:100%;object-fit:cover;border-radius:50%;transform:none"; avatarBox.style.transform = "none"; avatarBox.appendChild(img); }
    else avatarBox.innerHTML = '<i class="fas fa-user"></i>';
  }
  try { renderAvatar(localStorage.getItem(AVATAR_KEY)); } catch (_) {}
  if (photoInput) photoInput.addEventListener("change", () => {
    const file = photoInput.files && photoInput.files[0];
    if (!file) return;
    if (!/^image\/(png|jpeg|webp)$/.test(file.type)) { photoMessage.textContent = "Gunakan file JPG, PNG, atau WebP."; photoInput.value = ""; return; }
    if (file.size > 1.5 * 1024 * 1024) { photoMessage.textContent = "Ukuran foto maksimal 1,5 MB."; photoInput.value = ""; return; }
    const reader = new FileReader();
    reader.onload = () => { try { localStorage.setItem(AVATAR_KEY, reader.result); renderAvatar(reader.result); photoMessage.textContent = "Foto profil tersimpan di browser ini."; } catch (_) { photoMessage.textContent = "Penyimpanan penuh. Gunakan foto yang lebih kecil."; } };
    reader.readAsDataURL(file);
  });
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
        <div><small>Status</small><span class="profile-order-status">${order.status || (typeof STATUS_STEPS !== "undefined" && STATUS_STEPS[order.statusIndex]) || "Pesanan Dibuat"}</span></div>
        <div><small>Total</small><strong>${typeof formatIDR === "function" ? formatIDR(order.total) : order.total}</strong></div>
        <a href="tracking.html?order=${encodeURIComponent(order.id)}">Lihat Tracking →</a>
      </article>
    `).join("");
  }
})();
