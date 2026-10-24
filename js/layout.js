// Icon library untuk ikon header yang konsisten di semua halaman.
if (!document.querySelector('link[data-nusaeast-icons]')) {
  const iconCss = document.createElement('link');
  iconCss.rel = 'stylesheet';
  iconCss.href = 'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.2/css/all.min.css';
  iconCss.dataset.nusaeastIcons = 'true';
  document.head.appendChild(iconCss);
}

/* =========================================================
   NUSA EAST — HEADER & FOOTER (dipakai semua halaman)
   Supaya ganti menu/link cukup 1x edit di sini.
   ========================================================= */

function renderHeader(activePage) {
  const links = [
    { href: "index.html", label: "Beranda", key: "home" },
    { href: "services.html", label: "Layanan", key: "services" },
    { href: "packages.html", label: "Paket", key: "packages" },
    { href: "brand-matcher.html", label: "Brand Matcher", key: "matcher" },
    { href: "about.html", label: "About", key: "about" }
  ];

  let userSession = null;
  let adminSession = null;

  try {
    userSession = JSON.parse(localStorage.getItem("nusaeast_session") || "null");
  } catch (_) {
    userSession = null;
  }

  try {
    adminSession = JSON.parse(sessionStorage.getItem("nusaeast_admin_user") || "null");
  } catch (_) {
    adminSession = null;
  }

  const hasAdminSession =
    Boolean(sessionStorage.getItem("nusaeast_admin_token")) && Boolean(adminSession);
  const hasUserSession =
    Boolean(localStorage.getItem("nusaeast_token")) && Boolean(userSession);

  // Jika admin kembali ke situs publik, ikon akun tetap membuka profil admin.
  const accountHref = hasAdminSession
    ? "admin/profile.html"
    : hasUserSession
      ? "profile.html"
      : "login.html";

  const navHTML = links.map(l =>
    `<a href="${l.href}" class="${activePage === l.key ? 'active' : ''}">${l.label}</a>`
  ).join("");

  const header = document.createElement("header");
  header.className = "site-header";
  header.innerHTML = `
    <div class="container">
      <a href="index.html" class="logo">
  <img
    src="img/logo.png"
    alt="Logo Nusa East"
    class="header-logo"
  >
  <span>NUSAEAST</span>
</a>
      <nav class="nav-main" id="navMain">${navHTML}</nav>
      <div class="header-actions">
        <form class="header-search" id="headerSearchForm" role="search" action="search.html" method="get">
          <label class="sr-only" for="headerSearchInput">Cari layanan dan paket</label>
          <input id="headerSearchInput" name="q" type="search" placeholder="Cari layanan atau paket…" autocomplete="off">
          <button class="icon-btn search-toggle" type="button" id="searchToggle" aria-label="Buka pencarian" aria-expanded="false"><i class="fa-solid fa-magnifying-glass" aria-hidden="true"></i><span class="search-fallback" aria-hidden="true">⌕</span></button>
        </form>
        
        <a href="cart.html" class="icon-btn cart-icon-btn" title="Keranjang" aria-label="Keranjang belanja">
          <i class="fa-solid fa-cart-shopping" aria-hidden="true"></i>
          <span class="cart-fallback" aria-hidden="true">🛒</span>
          <span class="cart-count" id="cartCount">0</span>
        </a>

        <a href="${accountHref}" class="icon-btn" title="Akun" aria-label="Profil pengguna atau login"><i class="fa-regular fa-user" aria-hidden="true"></i><span class="user-fallback" aria-hidden="true">👤</span></a>
        <button class="nav-toggle" id="navToggle" aria-label="Menu" aria-expanded="false">☰</button>
      </div>
    </div>
  `;
  document.body.prepend(header);

  document.getElementById("navToggle").addEventListener("click", (event) => {
    const nav = document.getElementById("navMain");
    const open = nav.classList.toggle("open");
    event.currentTarget.setAttribute("aria-expanded", String(open));
  });

  const searchForm = document.getElementById("headerSearchForm");
  const searchInput = document.getElementById("headerSearchInput");
  const searchToggle = document.getElementById("searchToggle");
  searchToggle.addEventListener("click", () => {
    const open = searchForm.classList.toggle("is-open");
    searchToggle.setAttribute("aria-expanded", String(open));
    if (open) searchInput.focus();
    else if (!searchInput.value.trim()) searchInput.blur();
    else searchForm.requestSubmit();
  });
  searchForm.addEventListener("submit", (event) => {
    if (!searchInput.value.trim()) { event.preventDefault(); searchForm.classList.add("is-open"); searchToggle.setAttribute("aria-expanded", "true"); searchInput.focus(); }
  });

  updateCartCount();
}

function renderFooter() {
  const footer = document.createElement("footer");
  footer.className = "site-footer";

  footer.innerHTML = `
    <div class="container">

      <div class="footer-grid">

        <!-- =========================
             LOGO + DESKRIPSI
        ========================== -->
        <div class="footer-brand">

          <a href="index.html" class="footer-logo">
            <img 
              src="img/logo.png" 
              alt="Nusa East"
              class="footer-logo-img"
            >

            <span class="footer-brand-name">NUSA EAST</span>
          </a>

          <p class="footer-description">
            Nusa East membantu brand handmade, fashion, dan produk lokal dengan membangun media sosial yang konsisten, konten visual yang menarik, serta toko digital yang lebih profesional.
          </p>

        </div>


        <!-- =========================
             MENU
        ========================== -->
        <div class="footer-column">

          <h4>Menu</h4>

          <ul>
            <li><a href="index.html">Beranda</a></li>
            <li><a href="services.html">Layanan</a></li>
            <li><a href="packages.html">Paket</a></li>
            <li><a href="brand-matcher.html">Brand Matcher</a></li>
            <li><a href="about.html">About</a></li>
          </ul>

        </div>


        <!-- =========================
             KONTAK
        ========================== -->
        <div class="footer-column">

          <h4>Kontak</h4>

          <ul class="footer-contact">

            <li>
              <i class="fas fa-envelope" aria-hidden="true"></i>
              <a href="mailto:hello@nusaeast.id">
                hello@nusaeast.id
              </a>
            </li>

            <li>
              <i class="fas fa-phone-alt" aria-hidden="true"></i>
              <a href="tel:+6281234567890">
                +62 812 3456 7890
              </a>
            </li>

            <li>
              <i class="fas fa-map-marker-alt" aria-hidden="true"></i>
              <span>Makassar, Indonesia</span>
            </li>

          </ul>

        </div>


        <!-- =========================
             SOCIAL MEDIA
        ========================== -->
        <div class="footer-column">

          <h4>Ikuti Kami</h4>

          <div class="footer-social">

            <!-- INSTAGRAM -->
            <a 
              href="https://www.instagram.com/nusa.east/"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Instagram Nusa East"
            >
              <i class="fab fa-instagram" aria-hidden="true"></i>
            </a>


            <!-- TIKTOK -->
            <a 
              href="https://www.tiktok.com/@nusa.east?is_from_webapp=1&sender_device=pc"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="TikTok Nusa East"
            >
              <i class="fab fa-tiktok" aria-hidden="true"></i>
            </a>

          </div>

        </div>

      </div>


      <!-- =========================
           FOOTER BOTTOM
      ========================== -->
      <div class="footer-bottom">
        © 2026 Nusa East. All rights reserved.
      </div>

    </div>
  `;
  document.body.appendChild(footer);
}

function updateCartCount() {
  const cart = JSON.parse(localStorage.getItem("nusaeast_cart") || "[]");
  const el = document.getElementById("cartCount");
  if (el) el.textContent = cart.reduce((sum, i) => sum + (i.qty || 1), 0);
}
