/* =========================================================
   NUSA EAST — ICONS
   Ikon SVG inline (tidak bergantung CDN / font), jadi selalu tampil
   jelas — tidak lagi berupa bulatan kosong saat Font Awesome gagal
   dimuat. Cukup tulis seperti biasa:
       <i class="fas fa-plus"></i>
   atau  <i class="ne-i" data-icon="plus"></i>
   Elemen <i> akan otomatis diganti <svg>, termasuk untuk konten
   yang dibuat belakangan lewat JavaScript.
   ========================================================= */
(function () {
  const P = {
    plus: '<path d="M12 5v14M5 12h14"/>',
    trash: '<path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6M10 11v6M14 11v6"/>',
    pen: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4z"/>',
    times: '<path d="M18 6L6 18M6 6l12 12"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/>',
    user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 3.6-7 8-7s8 3 8 7"/>',
    "user-circle": '<circle cx="12" cy="12" r="10"/><circle cx="12" cy="10" r="3"/><path d="M6.2 19c1.2-2 3.2-3 5.8-3s4.6 1 5.8 3"/>',
    users: '<circle cx="9" cy="8" r="4"/><path d="M1 21c0-4 3.6-7 8-7s8 3 8 7M17 4a4 4 0 010 8M23 21c0-3-2-5.5-5-6.6"/>',
    logout: '<path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/><path d="M16 17l5-5-5-5M21 12H9"/>',
    phone: '<path d="M22 16.9v3a2 2 0 01-2.2 2 19.8 19.8 0 01-8.6-3.1 19.5 19.5 0 01-6-6A19.8 19.8 0 012.1 4.2 2 2 0 014.1 2h3a2 2 0 012 1.7c.1 1 .4 1.9.7 2.8a2 2 0 01-.5 2.1L8.1 9.9a16 16 0 006 6l1.3-1.3a2 2 0 012.1-.4c.9.3 1.8.6 2.8.7a2 2 0 011.7 2z"/>',
    pin: '<path d="M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 0116 0z"/><circle cx="12" cy="10" r="3"/>',
    eye: '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8S1 12 1 12z"/><circle cx="12" cy="12" r="3"/>',
    "eye-slash": '<path d="M17.9 17.9A10.9 10.9 0 0112 20C5 20 1 12 1 12a18.5 18.5 0 015.1-5.9M9.9 4.2A9.1 9.1 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.2 3.2M1 1l22 22"/>',
    external: '<path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6M15 3h6v6M10 14L21 3"/>',
    warning: '<path d="M10.3 3.9L1.8 18a2 2 0 001.7 3h17a2 2 0 001.7-3L13.7 3.9a2 2 0 00-3.4 0zM12 9v4M12 17h.01"/>',
    envelope: '<rect x="2" y="4" width="20" height="16" rx="2"/><path d="M22 7l-10 6L2 7"/>',
    bars: '<path d="M3 6h18M3 12h18M3 18h18"/>',
    image: '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/>',
    tiktok: '<path d="M9 12a4 4 0 104 4V3c.4 2.6 2.3 4.6 5 5"/>',
    instagram: '<rect x="2" y="2" width="20" height="20" rx="5"/><circle cx="12" cy="12" r="4"/><path d="M17.5 6.5h.01"/>',
    shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="M9 12l2 2 4-4"/>',
    bag: '<path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4zM3 6h18"/><path d="M16 10a4 4 0 01-8 0"/>',
    "chart-pie": '<path d="M21.2 15.9A10 10 0 118 2.8"/><path d="M22 12A10 10 0 0012 2v10z"/>',
    layers: '<path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5M2 12l10 5 10-5"/>',
    box: '<path d="M16.5 9.4L7.5 4.2"/><path d="M21 16V8a2 2 0 00-1-1.7l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.7l7 4a2 2 0 002 0l7-4a2 2 0 001-1.7z"/><path d="M3.3 7L12 12l8.7-5M12 22V12"/>',
    tags: '<path d="M20.6 13.4l-7.2 7.2a2 2 0 01-2.8 0L2 12V2h10l8.6 8.6a2 2 0 010 2.8z"/><circle cx="7" cy="7" r="1.5"/>',
    receipt: '<path d="M4 2v20l3-2 3 2 2-2 2 2 3-2 3 2V2l-3 2-3-2-2 2-2-2-3 2z"/><path d="M8 8h8M8 12h8M8 16h5"/>',
    wallet: '<path d="M3 7a2 2 0 012-2h14v4"/><path d="M3 7v12a2 2 0 002 2h16V9H5a2 2 0 01-2-2z"/><circle cx="17" cy="15" r="1"/>',
    inbox: '<path d="M22 12h-6l-2 3h-4l-2-3H2"/><path d="M5.5 5.1L2 12v6a2 2 0 002 2h16a2 2 0 002-2v-6l-3.5-6.9A2 2 0 0016.8 4H7.2a2 2 0 00-1.7 1.1z"/>',
    clipboard: '<rect x="8" y="2" width="8" height="4" rx="1"/><path d="M16 4h2a2 2 0 012 2v14a2 2 0 01-2 2H6a2 2 0 01-2-2V6a2 2 0 012-2h2M9 12h6M9 16h6"/>',
    route: '<circle cx="6" cy="19" r="3"/><circle cx="18" cy="5" r="3"/><path d="M9 19h8.5a3.5 3.5 0 000-7h-11a3.5 3.5 0 010-7H15"/>',
    lock: '<rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0110 0v4"/>',
    key: '<circle cx="8" cy="15" r="4"/><path d="M10.8 12.2L21 2M16 7l3 3"/>',
    check: '<path d="M20 6L9 17l-5-5"/>',
    "check-circle": '<circle cx="12" cy="12" r="10"/><path d="M8 12l3 3 5-6"/>',
    clock: '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
    store: '<path d="M3 9l1.5-5h15L21 9"/><path d="M3 9a3 3 0 006 0 3 3 0 006 0 3 3 0 006 0"/><path d="M5 21V12M19 21V12M3 21h18"/>',
    "address-card": '<rect x="2" y="4" width="20" height="16" rx="2"/><circle cx="9" cy="11" r="2.5"/><path d="M5 17c.5-2 2-3 4-3s3.5 1 4 3M15 9h4M15 13h4"/>',
    save: '<path d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z"/><path d="M17 21v-8H7v8M7 3v5h8"/>',
    "arrow-right": '<path d="M5 12h14M12 5l7 7-7 7"/>',
    "arrow-left": '<path d="M19 12H5M12 19l-7-7 7-7"/>',
    card: '<rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20"/>',
    flag: '<path d="M4 22V4M4 4h13l-2 4 2 4H4"/>',
    refresh: '<path d="M21 12a9 9 0 01-15.5 6.2L3 16M3 12a9 9 0 0115.5-6.2L21 8M21 3v5h-5M3 21v-5h5"/>',
    list: '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>'
  };

  // nama kelas Font Awesome -> kunci ikon di atas
  const ALIAS = {
    "xmark": "times", "close": "times",
    "magnifying-glass": "search",
    "circle-user": "user-circle", "user-large": "user",
    "sign-out-alt": "logout", "right-from-bracket": "logout", "arrow-right-from-bracket": "logout",
    "phone-alt": "phone", "map-marker-alt": "pin", "location-dot": "pin",
    "external-link-alt": "external", "arrow-up-right-from-square": "external",
    "exclamation-triangle": "warning", "triangle-exclamation": "warning",
    "shield-halved": "shield", "bag-shopping": "bag", "shopping-bag": "bag",
    "layer-group": "layers", "box-open": "box",
    "clipboard-list": "clipboard", "id-card": "address-card", "address-book": "address-card",
    "floppy-disk": "save", "circle-check": "check-circle", "credit-card": "card",
    "rotate": "refresh", "sync": "refresh", "pen-to-square": "pen", "edit": "pen"
  };

  const SKIP = new Set(["fas", "far", "fab", "fa", "fa-solid", "fa-regular", "fa-brands", "fa-fw", "ne-i"]);

  function resolve(el) {
    if (el.dataset && el.dataset.icon) return P[el.dataset.icon] ? el.dataset.icon : null;
    for (const c of el.classList) {
      if (SKIP.has(c) || !c.startsWith("fa-")) continue;
      const raw = c.slice(3);
      const key = P[raw] ? raw : ALIAS[raw];
      if (key && P[key]) return key;
    }
    return null;
  }

  function convert(el) {
    const key = resolve(el);
    if (!key) return;
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("fill", "none");
    svg.setAttribute("stroke", "currentColor");
    svg.setAttribute("stroke-width", "2");
    svg.setAttribute("stroke-linecap", "round");
    svg.setAttribute("stroke-linejoin", "round");
    svg.setAttribute("aria-hidden", "true");
    svg.setAttribute("focusable", "false");
    svg.setAttribute("class", "ne-ico ne-ico-" + key);
    if (el.getAttribute("style")) svg.setAttribute("style", el.getAttribute("style"));
    svg.innerHTML = P[key];
    el.replaceWith(svg);
  }

  function scan(root) {
    const base = root && root.querySelectorAll ? root : document;
    base.querySelectorAll('i[class*="fa-"], i[data-icon]').forEach(convert);
    if (base.matches && base.matches('i[class*="fa-"], i[data-icon]')) convert(base);
  }

  let queued = false;
  function queueScan() {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => { queued = false; scan(document); });
  }

  function start() {
    scan(document);
    new MutationObserver(queueScan).observe(document.documentElement, { childList: true, subtree: true });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
  else start();

  window.NEIcons = {
    scan,
    svg: (name, cls) => P[name] ? `<svg class="ne-ico ${cls || ""}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${P[name]}</svg>` : ""
  };
})();
