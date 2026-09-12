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

  const header = document.createElement("header");
  header.className = "site-header";
  header.innerHTML = `
    <div class="container">
      <a href="index.html" class="logo">
        <span class="logo-mark">S</span> NUSAEAST
      </a>
      <nav class="nav-main" id="navMain">${navHTML}</nav>
      <div class="header-actions">
        <a href="cart.html" class="icon-btn" title="Keranjang">
          🛒<span class="cart-count" id="cartCount">0</span>
        </a>
        <a href="login.html" class="icon-btn" title="Akun">👤</a>
        <button class="nav-toggle" id="navToggle" aria-label="Menu">☰</button>
      </div>
    </div>
  `;
  document.body.prepend(header);

  const toggle = document.getElementById("navToggle");
  const nav = document.getElementById("navMain");
  toggle.addEventListener("click", () => {
    const open = nav.classList.toggle("open");
    toggle.setAttribute("aria-expanded", String(open));
    toggle.textContent = open ? "✕" : "☰";
    document.body.classList.toggle("menu-open", open);
  });
  nav.querySelectorAll("a").forEach(a => a.addEventListener("click", () => {
    nav.classList.remove("open");
    document.body.classList.remove("menu-open");
    toggle.setAttribute("aria-expanded", "false");
    toggle.textContent = "☰";
  }));

  updateCartCount();
}

function renderFooter() {
  const footer = document.createElement("footer");
  footer.className = "site-footer";
  footer.innerHTML = `
    <div class="container">
      <div class="footer-grid">
        <div>
          <div class="footer-logo"><span class="logo-mark">S</span> NUSA EAST</div>
          <p>Digital marketing untuk brand lokal dengan tujuan yang lebih besar.</p>
          <div class="footer-social">
            <a href="#" aria-label="Instagram">📷</a>
            <a href="#" aria-label="TikTok">🎵</a>
          </div>
        </div>
        <div>
          <h4>Menu</h4>
          <ul>
            <li><a href="index.html">Beranda</a></li>
            <li><a href="about.html">Tentang</a></li>
            <li><a href="services.html">Layanan</a></li>
            <li><a href="packages.html">Paket</a></li>
            <li><a href="singles.html">Layanan Satuan</a></li>
          </ul>
        </div>
        <div>
          <h4>Kontak</h4>
          <ul>
            <li>✉️ hello@nusaeast.id</li>
            <li>📞 +62 812 3456 7890</li>
            <li>📍 Makassar, Indonesia</li>
          </ul>
        </div>
        <div>
          <h4>Akun</h4>
          <ul>
            <li><a href="login.html">Masuk</a></li>
            <li><a href="register.html">Daftar</a></li>
            <li><a href="cart.html">Keranjang</a></li>
          </ul>
        </div>
      </div>
      <div class="footer-bottom">© 2026 Nusa East. All rights reserved.</div>
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
