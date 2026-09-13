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

  const navHTML = links.map(l =>
    `<a href="${l.href}" class="${activePage === l.key ? 'active' : ''}">${l.label}</a>`
  ).join("");

  let session = null;

  try {
    session = JSON.parse(
      localStorage.getItem("nusaeast_session") || "null"
    );
  } catch (_) {}

  // Kalau sudah login → profile.html
  // Kalau belum login → login.html
  const accountHref = session ? "profile.html" : "login.html";
  const accountTitle = session ? "Profil Saya" : "Masuk";

  const header = document.createElement("header");
  header.className = "site-header";

  header.innerHTML = `
  <div class="container">

    <!-- LOGO -->
    <a href="index.html" class="logo">
      <img
        src="img/logo (2).png"
        alt="Nusa East"
        class="header-logo-img"
      >
    </a>

    <!-- NAVIGATION -->
    <nav class="nav-main" id="navMain">
      ${navHTML}
    </nav>

   <!-- CART & PROFILE -->
<div class="header-actions">

  <!-- CART -->
  <a
    href="cart.html"
    class="header-icon-btn"
    title="Keranjang"
    aria-label="Keranjang"
  >
    <i class="fas fa-shopping-cart"></i>

    <span class="cart-count" id="cartCount">0</span>
  </a>


  <!-- PROFILE -->
  <a
    href="${accountHref}"
    class="header-icon-btn ${activePage === 'profile' ? 'active-account' : ''}"
    title="${accountTitle}"
    aria-label="${accountTitle}"
  >
    <i class="fas fa-user"></i>
  </a>


  <!-- MOBILE MENU -->
  <button
    class="nav-toggle"
    id="navToggle"
    aria-label="Menu"
  >
  </button>

</div>

  </div>
`;

  document.body.prepend(header);

  const toggle = document.getElementById("navToggle");
  const nav = document.getElementById("navMain");

  toggle.addEventListener("click", () => {

    const open = nav.classList.toggle("open");

    toggle.setAttribute(
      "aria-expanded",
      String(open)
    );

    toggle.textContent = open ? "✕" : "☰";

    document.body.classList.toggle(
      "menu-open",
      open
    );
  });

  nav.querySelectorAll("a").forEach(a =>
    a.addEventListener("click", () => {

      nav.classList.remove("open");

      document.body.classList.remove(
        "menu-open"
      );

      toggle.setAttribute(
        "aria-expanded",
        "false"
      );

      toggle.textContent = "☰";
    })
  );

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

async function updateCartCount() {
  const el = document.getElementById("cartCount");
  if (!el) return;
  try {
    const cart = typeof getCart === "function" ? await getCart() : [];
    el.textContent = cart.reduce((sum, i) => sum + (i.qty || 1), 0);
  } catch (_) { el.textContent = "0"; }
}
