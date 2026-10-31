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

  // FOTO PROFIL — disimpan di database melalui backend
  const PROFILE_API_BASE = (
    "https://nusa-east-vsxf.vercel.app/api"
  ).replace(/\/$/, "");

  const avatarBox = $("profileAvatarPreview");
  const photoInput = $("profilePhotoInput");
  const photoMessage = $("profilePhotoMessage");

  const ASSET_BASE = PROFILE_API_BASE.replace(/\/api$/, "");
  const removeBtn = $("profilePhotoRemove");
  const authHeaders = () => ({ Authorization: `Bearer ${localStorage.getItem("nusaeast_token")}` });

  function renderAvatar(src) {
    if (!avatarBox) return;
    avatarBox.innerHTML = "";
    if (src) {
      const img = document.createElement("img");
      img.src = /^https?:/i.test(src) ? src : ASSET_BASE + src; // avatar_url berupa path, bukan data gambar
      img.alt = "Foto profil";
      img.style.cssText = "width:100%;height:100%;object-fit:cover;border-radius:50%;transform:none";
      avatarBox.style.transform = "none";
      avatarBox.appendChild(img);
    } else {
      avatarBox.innerHTML = '<i class="fas fa-user"></i>';
    }
    if (removeBtn) removeBtn.hidden = !src;
  }

  async function profileApi(path, options = {}) {
    const response = await fetch(`${PROFILE_API_BASE}${path}`, { ...options, headers: { ...authHeaders(), ...(options.headers || {}) } });
    const data = await response.json().catch(() => ({}));
    if (response.status === 401 || response.status === 403) {
      localStorage.removeItem("nusaeast_token"); localStorage.removeItem("nusaeast_session");
      location.href = "login.html?redirect=profile.html";
      throw new Error(data.error || "Sesi berakhir.");
    }
    if (!response.ok) throw new Error(data.error || "Permintaan gagal.");
    return data;
  }

  // Unggah foto: file dikirim ke server, database hanya menyimpan path-nya (users.avatar_url)
  if (photoInput) {
    photoInput.addEventListener("change", async () => {
      const file = photoInput.files && photoInput.files[0];
      if (!file) return;
      if (!/^image\/(png|jpeg|webp)$/.test(file.type)) { photoMessage.textContent = "Gunakan file JPG, PNG, atau WebP."; photoInput.value = ""; return; }
      if (file.size > 1.5 * 1024 * 1024) { photoMessage.textContent = "Ukuran foto maksimal 1,5 MB."; photoInput.value = ""; return; }
      try {
        photoMessage.textContent = "Mengunggah foto profil...";
        const fd = new FormData(); fd.append("avatar", file);
        const result = await profileApi("/profile/avatar", { method: "POST", body: fd });
        renderAvatar(result.avatar_url);
        photoMessage.textContent = "Foto profil berhasil disimpan.";
      } catch (error) { photoMessage.textContent = error.message || "Foto profil gagal disimpan."; }
      finally { photoInput.value = ""; }
    });
  }
  if (removeBtn) {
    removeBtn.addEventListener("click", async () => {
      try { await profileApi("/profile/avatar", { method: "DELETE" }); renderAvatar(null); photoMessage.textContent = "Foto profil dihapus."; }
      catch (error) { photoMessage.textContent = error.message; }
    });
  }
  renderAvatar(session.avatar_url || null);

  function fillAccount(u) {
    $("profileName").textContent = u.name || "Pengguna Nusa East";
    $("profileEmail").textContent = u.email || "-";
    $("accountName").textContent = u.name || "-";
    $("accountEmail").textContent = u.email || "-";
    $("accountPhone").textContent = u.phone || "-";
    $("accountAddress").textContent = u.address || "-";
    const st = { active: "Aktif", disabled: "Dinonaktifkan", blocked: "Diblokir" }[u.status] || "Aktif";
    $("accountStatus").textContent = st;
  }
  fillAccount(session);

  const fields = {
    brandName: saved.brandName || "",
    brandProduct: saved.brandProduct || "",
    brandInstagram: saved.brandInstagram || "",
    brandWebsite: saved.brandWebsite || "",
    brandTarget: saved.brandTarget || "",
    brandCity: saved.brandCity || "Makassar",
    brandDescription: saved.brandDescription || "",
    contactName: session.name || "",
    contactEmail: session.email || "",
    contactPhone: session.phone || "",
    contactPosition: saved.contactPosition || "",
    contactPreference: saved.contactPreference || "WhatsApp"
  };
  fields.contactAddress = session.address || "";
  Object.entries(fields).forEach(([key, value]) => { if ($(key)) $(key).value = value; });
  NEValidate.bindPhoneInput($("contactPhone"), $("contactPhoneHint"));

  // Sinkronkan dengan data terbaru dari database (nama, telepon, alamat, foto, status)
  profileApi("/profile").then((u) => {
    const merged = { ...session, ...u };
    localStorage.setItem("nusaeast_session", JSON.stringify(merged));
    Object.assign(session, merged);
    fillAccount(u); renderAvatar(u.avatar_url);
    ["contactName:name", "contactPhone:phone", "contactAddress:address"].forEach((p) => { const [id, k] = p.split(":"); if ($(id)) $(id).value = u[k] || ""; });
  }).catch((e) => console.error("Gagal memuat profil:", e));

  const LOCAL_ONLY = ["brandName","brandProduct","brandInstagram","brandWebsite","brandTarget","brandCity","brandDescription","contactPosition","contactPreference"];
  function saveLocalProfile() {
    const data = {};
    LOCAL_ONLY.forEach(key => { if ($(key)) data[key] = $(key).value.trim ? $(key).value.trim() : $(key).value; });
    localStorage.setItem(PROFILE_KEY, JSON.stringify(data));
  }
  $("businessForm").addEventListener("submit", e => {
    e.preventDefault(); saveLocalProfile();
    if (typeof showToast === "function") showToast("Perubahan profil berhasil disimpan.");
  });
  // Nama, telepon, dan alamat disimpan ke database (validasi frontend + backend)
  $("contactForm").addEventListener("submit", async e => {
    e.preventDefault(); saveLocalProfile();
    const box = $("contactError"); box.textContent = "";
    const body = { name: $("contactName").value, phone: $("contactPhone").value, address: $("contactAddress").value };
    const problem = NEValidate.name(body.name) || NEValidate.phone(body.phone) || NEValidate.address(body.address);
    if (problem) { box.textContent = problem; return; }
    try {
      const u = await profileApi("/profile", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      localStorage.setItem("nusaeast_session", JSON.stringify({ ...session, ...u }));
      Object.assign(session, u); fillAccount(u);
      if (typeof showToast === "function") showToast("Perubahan profil berhasil disimpan.");
    } catch (error) { box.textContent = error.message; }
  });

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
  const esc = (v) => String(v ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const money = (n) => typeof formatIDR === "function" ? formatIDR(n) : n;
  function renderOrders(list) {
    if (!list.length) {
      orderBox.innerHTML = `<div class="profile-empty"><strong>Belum ada pesanan</strong><p>Pesanan yang sudah dibuat akan muncul di sini.</p><a href="packages.html" class="btn btn-primary btn-sm">Lihat Paket</a></div>`;
      return;
    }
    orderBox.innerHTML = list.map(order => `
      <article class="profile-order-card">
        <div><small>ID Pesanan</small><strong>${esc(order.id)}</strong></div>
        <div><small>Status</small><span class="profile-order-status">${esc(order.status || "Pesanan Dibuat")}</span></div>
        <div><small>Total</small><strong>${money(Number(order.total))}</strong></div>
        <a href="tracking.html?order=${encodeURIComponent(order.id)}">Lihat Tracking →</a>
      </article>`).join("");
  }
  // Sumber utama: database (hanya pesanan milik akun ini). Cadangan: pesanan demo lokal bila backend tidak terjangkau.
  profileApi("/orders/mine").then(renderOrders).catch(() => {
    let local = [];
    try { local = JSON.parse(localStorage.getItem("nusaeast_orders") || "[]"); } catch (_) {}
    renderOrders(local.map(o => ({ ...o, status: o.status || (typeof STATUS_STEPS !== "undefined" && STATUS_STEPS[o.statusIndex]) })));
  });
})();
