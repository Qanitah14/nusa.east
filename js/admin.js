/* =========================================================
   NUSA EAST — ADMIN CORE
   Login admin, panggilan API, kerangka halaman (sidebar), modal,
   toast. Dipakai semua halaman di folder /admin.
   Token admin disimpan di sessionStorage (hilang saat tab ditutup)
   dan terpisah dari akun pengguna biasa.
   ========================================================= */
/* Portal dapat dikonfigurasi lewat window.NUSAEAST_PORTAL (dipakai folder /operator).
   Tanpa konfigurasi = portal Admin Penjualan. Pembatasan akses yang sebenarnya
   dilakukan backend; pemeriksaan role di sini hanya untuk mengarahkan tampilan. */
const Admin = (() => {
  const PORTAL = Object.assign({
    role: "sales_admin",
    tokenKey: "nusaeast_admin_token",
    userKey: "nusaeast_admin_user",
    loginEndpoint: "/auth/admin-login",
    panelName: "Admin Panel",
    menuLabel: "Menu admin",
    profileHref: "profile.html",
    nav: null
  }, window.NUSAEAST_PORTAL || {});
  const TOKEN_KEY = PORTAL.tokenKey;
  const USER_KEY = PORTAL.userKey;

  const apiBase = () => "https://nusa-east-vsxf.vercel.app/api";
  const getToken = () => sessionStorage.getItem(TOKEN_KEY);
  const getUser = () => { try { return JSON.parse(sessionStorage.getItem(USER_KEY) || "null"); } catch (_) { return null; } };

  const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const idr = (n) => new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(Number(n) || 0);
  const dateID = (d) => d ? new Date(d).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" }) : "-";
  const assetUrl = (p) => !p ? "" : /^(https?:|data:)/i.test(p) ? p : apiBase().replace(/\/api\/?$/, "") + p;

  /* ---------- API ---------- */
  async function request(endpoint, { method = "GET", data, auth = true } = {}) {
    const headers = {};
    let body;
    if (data instanceof FormData) body = data;
    else if (data !== undefined) { headers["Content-Type"] = "application/json"; body = JSON.stringify(data); }
    if (auth && getToken()) headers.Authorization = `Bearer ${getToken()}`;

    let res;
    try { res = await fetch(apiBase() + endpoint, { method, headers, body }); }
    catch (_) {
      throw new Error(`Tidak dapat menghubungi backend (${apiBase()}). Pastikan server aktif dan origin frontend diizinkan oleh CORS.`);
    }

    let json = {};
    try { json = await res.json(); } catch (_) {}

    // 401 = sesi berakhir. 403 dari status akun (nonaktif/diblokir) juga mengakhiri sesi;
    // 403 karena aturan bisnis (mis. "tidak dapat mengubah akun sendiri") hanya menampilkan pesan.
    if (auth && (res.status === 401 || (res.status === 403 && /^Akun Anda/.test(json.error || "")))) {
      logout(true);
      throw new Error(json.error || "Sesi admin berakhir. Silakan masuk kembali.");
    }
    if (!res.ok) throw new Error(json.error || `Permintaan gagal (HTTP ${res.status}) pada ${endpoint}.`);
    return json;
  }
  const api = {
    get: (e) => request(e),
    post: (e, d) => request(e, { method: "POST", data: d }),
    put: (e, d) => request(e, { method: "PUT", data: d }),
    del: (e) => request(e, { method: "DELETE" })
  };

  /* ---------- Sesi ---------- */
  async function login(email, password) {
    const out = await request(PORTAL.loginEndpoint, { method: "POST", data: { email, password }, auth: false });
    sessionStorage.setItem(TOKEN_KEY, out.token);
    sessionStorage.setItem(USER_KEY, JSON.stringify(out.user));
    return out.user;
  }
  function setUser(u) { sessionStorage.setItem(USER_KEY, JSON.stringify(u)); }
  function logout(expired = false) {
    const token = getToken();
    // Catat logout di server (riwayat + status offline), lalu bersihkan sesi lokal.
    const finish = () => {
      sessionStorage.removeItem(TOKEN_KEY);
      sessionStorage.removeItem(USER_KEY);
      location.href = "login.html" + (expired ? "?expired=1" : "");
    };
    if (!token || expired) return finish();
    fetch(apiBase() + "/auth/logout", { method: "POST", headers: { Authorization: `Bearer ${token}` }, keepalive: true })
      .catch(() => {}).finally(finish);
  }

  // Heartbeat: menjaga status Online dan mendeteksi sesi yang sudah dicabut/kedaluwarsa.
  function startHeartbeat() {
    const beat = async () => {
      if (!getToken() || document.hidden) return;
      try {
        const r = await fetch(apiBase() + "/auth/heartbeat", { method: "POST", headers: { Authorization: `Bearer ${getToken()}` } });
        if (r.status === 401 || r.status === 403) logout(true);
      } catch (_) {}
    };
    setInterval(beat, 120000);
    document.addEventListener("visibilitychange", () => { if (!document.hidden) beat(); });
  }

  /* ---------- Toast (memakai .toast dari style.css) ---------- */
  function toast(msg) {
    let el = document.getElementById("adminToast");
    if (!el) { el = document.createElement("div"); el.id = "adminToast"; el.className = "toast"; document.body.appendChild(el); }
    el.textContent = msg;
    el.classList.add("show");
    clearTimeout(toast._t);
    toast._t = setTimeout(() => el.classList.remove("show"), 2800);
  }

  /* ---------- Kerangka halaman ---------- */
  const NAV = PORTAL.nav || [
    { key: "dashboard", href: "index.html", label: "Dashboard", icon: "fa-chart-pie" },
    { key: "orders", href: "orders.html", label: "Pesanan", icon: "fa-clipboard-list" },
    { key: "services", href: "services.html", label: "Layanan", icon: "fa-layer-group" },
    { key: "packages", href: "packages.html", label: "Paket", icon: "fa-box-open" },
    { key: "singles", href: "singles.html", label: "Layanan Satuan", icon: "fa-tags" },
    { key: "profile", href: "profile.html", label: "Profil Admin", icon: "fa-user-circle" }
  ];
  // halaman yang tidak ada di menu tetapi termasuk bagian dari menu lain
  const PARENT = { tracking: "orders" };
  const initials = (name) => String(name || "A").trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join("").toUpperCase() || "A";

  function init(activeKey) {
    if (!getToken() || !getUser() || getUser().role !== PORTAL.role) { sessionStorage.removeItem(TOKEN_KEY); sessionStorage.removeItem(USER_KEY); location.replace("login.html"); return false; }
    const user = getUser();
    document.body.classList.add("portal-" + PORTAL.role);
    const app = document.getElementById("adminApp");
    const main = app.querySelector(".admin-main");
    const navKey = PARENT[activeKey] || activeKey;
    const current = NAV.find((n) => n.key === navKey) || (activeKey === "tracking" ? { label: "Tracking Project" } : null);

    const side = document.createElement("aside");
    side.className = "admin-sidebar";
    side.id = "adminSidebar";
    side.innerHTML = `
      <div class="a-brand">
        <img src="../img/logo.png" alt="Nusa East" onerror="this.style.display='none'">
        <div><strong>NUSA EAST</strong><small>${esc(PORTAL.panelName)}</small></div>
      </div>
      <nav class="a-nav" aria-label="${esc(PORTAL.menuLabel)}">
        ${NAV.map((n) => `<a href="${n.href}" class="${n.key === navKey ? "active" : ""}"><i class="fas ${n.icon}" aria-hidden="true"></i>${n.label}</a>`).join("")}
      </nav>
      <div class="a-side-foot">
        <a class="a-user" href="${PORTAL.profileHref}" title="Buka profil">
          <span class="a-avatar sm" aria-hidden="true">${esc(initials(user.name))}</span>
          <span class="a-user-txt"><b>${esc(user.name)}</b><span>${esc(user.email)}</span></span>
        </a>
        <a class="btn btn-ghost btn-sm" href="../index.html" target="_blank" rel="noopener"><i class="fas fa-external-link-alt"></i> Lihat Situs</a>
        <button class="btn btn-accent btn-sm" id="adminLogout"><i class="fas fa-sign-out-alt"></i> Keluar</button>
      </div>`;

    const top = document.createElement("header");
    top.className = "admin-topbar";
    top.innerHTML = `
      <button class="a-icon-btn" id="adminMenuBtn" aria-label="Buka menu" aria-controls="adminSidebar" aria-expanded="false"><i class="fas fa-bars"></i></button>
      <strong>${esc(current ? current.label : PORTAL.panelName)}</strong>
      <span style="width:42px"></span>`;

    const backdrop = document.createElement("div");
    backdrop.className = "a-backdrop";

    app.prepend(side);
    app.appendChild(backdrop);
    main.prepend(top);

    const setOpen = (open) => {
      document.body.classList.toggle("a-nav-open", open);
      document.getElementById("adminMenuBtn").setAttribute("aria-expanded", String(open));
    };
    document.getElementById("adminMenuBtn").addEventListener("click", () => setOpen(!document.body.classList.contains("a-nav-open")));
    backdrop.addEventListener("click", () => setOpen(false));
    side.querySelectorAll(".a-nav a").forEach((a) => a.addEventListener("click", () => setOpen(false)));
    document.getElementById("adminLogout").addEventListener("click", () => logout());
    window.addEventListener("resize", () => { if (innerWidth > 860) setOpen(false); });
    startHeartbeat();
    return true;
  }

  /* ---------- Modal ---------- */
  /**
   * openModal({ title, body, submitLabel, size, onSubmit(form, ctx) })
   * onSubmit boleh melempar Error -> ditampilkan di dalam modal.
   */
  function openModal({ title, body, submitLabel = "Simpan", size = "", onSubmit, hideFooter = false }) {
    const back = document.createElement("div");
    back.className = "a-modal-backdrop";
    back.innerHTML = `
      <form class="a-modal ${size}" role="dialog" aria-modal="true" novalidate>
        <div class="a-modal-head"><h3>${esc(title)}</h3><button type="button" class="a-icon-btn" data-close aria-label="Tutup"><i class="fas fa-times"></i></button></div>
        <div class="a-modal-body"><div class="form-error" data-error hidden></div>${body}</div>
        ${hideFooter ? "" : `<div class="a-modal-foot">
          <button type="button" class="btn btn-outline btn-sm" data-close>Batal</button>
          <button type="submit" class="btn btn-primary btn-sm">${esc(submitLabel)}</button>
        </div>`}
      </form>`;
    document.body.appendChild(back);
    document.body.classList.add("a-lock");

    const form = back.querySelector("form");
    const errBox = back.querySelector("[data-error]");
    const submitBtn = form.querySelector('button[type="submit"]');

    const close = () => {
      document.removeEventListener("keydown", onKey);
      back.remove();
      if (!document.querySelector(".a-modal-backdrop")) document.body.classList.remove("a-lock");
    };
    const onKey = (e) => { if (e.key === "Escape") close(); };
    document.addEventListener("keydown", onKey);
    back.addEventListener("mousedown", (e) => { if (e.target === back) close(); });
    back.querySelectorAll("[data-close]").forEach((b) => b.addEventListener("click", close));

    const ctx = {
      close,
      error: (m) => { errBox.textContent = m; errBox.hidden = !m; if (m) errBox.scrollIntoView({ block: "nearest" }); }
    };

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      ctx.error("");
      if (!onSubmit) return;
      const label = submitBtn ? submitBtn.textContent : "";
      if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = "Menyimpan…"; }
      try { await onSubmit(form, ctx); }
      catch (err) { ctx.error(err.message || "Terjadi kesalahan."); }
      finally { if (submitBtn && document.body.contains(submitBtn)) { submitBtn.disabled = false; submitBtn.textContent = label; } }
    });

    const first = form.querySelector("input:not([type=hidden]), select, textarea");
    if (first) setTimeout(() => first.focus(), 30);
    return ctx;
  }

  function confirmDialog({ title, message, confirmLabel = "Hapus", onConfirm }) {
    return openModal({
      title, size: "sm", submitLabel: confirmLabel,
      body: `<p style="color:var(--color-text);margin-bottom:12px;">${message}</p>`,
      onSubmit: async (_f, ctx) => { await onConfirm(); ctx.close(); }
    });
  }

  /* ---------- Util tampilan ---------- */
  const loading = (text = "Memuat data…") => `<div class="a-loading"><span class="a-spin"></span>${esc(text)}</div>`;
  const empty = (icon, title, text) => `<div class="a-empty"><i class="fas ${icon}"></i><h3>${esc(title)}</h3><p>${esc(text)}</p></div>`;
  const errorBox = (msg, retryId = "retryBtn") => `<div class="a-empty"><i class="fas fa-exclamation-triangle"></i><h3>Data gagal dimuat</h3><p>${esc(msg)}</p><button class="btn btn-outline btn-sm mt-16" id="${retryId}">Coba lagi</button></div>`;
  const statusBadge = (active) => active ? `<span class="badge badge-green">Aktif</span>` : `<span class="badge badge-gray">Nonaktif</span>`;
  const switchHTML = (name, label, checked) => `<label class="a-switch"><input type="checkbox" name="${name}" ${checked ? "checked" : ""}><span class="track"></span>${esc(label)}</label>`;

  return { api, login, logout, init, getUser, setUser, initials, getToken, toast, openModal, confirmDialog, esc, idr, dateID, assetUrl, loading, empty, errorBox, statusBadge, switchHTML };
})();
