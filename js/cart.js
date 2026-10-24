/* =========================================================
   NUSA EAST — CART ENGINE
   Menyimpan cart di localStorage (key: nusaeast_cart) supaya
   persist antar halaman tanpa perlu login dulu.
   Struktur 1 item cart:
   {
     id, type: 'package' | 'single' | 'addon',
     name, price, qty, meta (misal nama layanan / eta), percent (untuk express)
   }
   ========================================================= */

const CART_KEY = "nusaeast_cart";
const CART_SELECTED_KEY = "nusaeast_cart_selected";

function getSelectedCartIds() {
  const cart = getCart();
  try {
    const saved = JSON.parse(localStorage.getItem(CART_SELECTED_KEY) || "null");
    if (Array.isArray(saved)) return saved.filter(id => cart.some(item => item.id === id));
  } catch (_) {}
  return cart.map(item => item.id); // default: semua item dipilih
}
function setCartItemSelected(id, selected) {
  const ids = new Set(getSelectedCartIds());
  if (selected) ids.add(id); else ids.delete(id);
  localStorage.setItem(CART_SELECTED_KEY, JSON.stringify([...ids]));
  if (typeof renderCartPage === "function") renderCartPage();
}
function selectAllCartItems(selected) {
  localStorage.setItem(CART_SELECTED_KEY, JSON.stringify(selected ? getCart().map(item => item.id) : []));
  if (typeof renderCartPage === "function") renderCartPage();
}
function getSelectedCart() {
  const ids = new Set(getSelectedCartIds());
  return getCart().filter(item => ids.has(item.id));
}
function removeCartItems(idsToRemove) {
  const removeIds = new Set(idsToRemove);
  saveCart(getCart().filter(item => !removeIds.has(item.id)));
  localStorage.setItem(CART_SELECTED_KEY, JSON.stringify(getSelectedCartIds().filter(id => !removeIds.has(id))));
}

function getCart() {
  return JSON.parse(localStorage.getItem(CART_KEY) || "[]");
}

function saveCart(cart) {
  localStorage.setItem(CART_KEY, JSON.stringify(cart));
  updateCartCount();
}

function addToCart(item) {
  const cart = getCart();
  const existing = cart.find(i => i.id === item.id);
  if (existing) {
    existing.qty += item.qty || 1;
  } else {
    cart.push({ qty: 1, ...item });
  }
  saveCart(cart);
  showToast(`${item.name} ditambahkan ke keranjang`);
}

function removeFromCart(id) {
  saveCart(getCart().filter(i => i.id !== id));
  if (typeof renderCartPage === "function") renderCartPage();
}

function updateQty(id, delta) {
  const cart = getCart();
  const item = cart.find(i => i.id === id);
  if (!item) return;
  item.qty = Math.max(1, (item.qty || 1) + delta);
  saveCart(cart);
  if (typeof renderCartPage === "function") renderCartPage();
}

function clearCart() {
  localStorage.removeItem(CART_KEY);
  updateCartCount();
}

function formatIDR(num) {
  return "Rp" + Math.round(num).toLocaleString("id-ID");
}

/* Menghitung total keseluruhan cart.
   Item "percent" (Express/Priority +20%) dihitung dari subtotal
   item non-percent, lalu ditambahkan terpisah — sesuai aturan
   "jangan mengubah harga paket utama, tampilkan add-on terpisah". */
function calculateCartTotals(items = getCart()) {
  const cart = items;
  let base = 0;
  let percentExtra = 0;
  const breakdown = [];

  cart.forEach(item => {
    if (item.percent) {
      // dihitung belakangan setelah base diketahui
      return;
    }
    const lineTotal = item.price * item.qty;
    base += lineTotal;
    breakdown.push({ ...item, lineTotal });
  });

  cart.forEach(item => {
    if (item.percent) {
      const extra = (base * item.percent) / 100 * item.qty;
      percentExtra += extra;
      breakdown.push({ ...item, lineTotal: extra });
    }
  });

  const total = base + percentExtra;
  return { cart, breakdown, base, percentExtra, total };
}

function showToast(msg) {
  let toast = document.getElementById("ne-toast");
  if (!toast) {
    toast = document.createElement("div");
    toast.id = "ne-toast";
    toast.style.cssText = `
      position: fixed; bottom: 24px; left: 50%; transform: translateX(-50%) translateY(20px);
      background: #1E3B2C; color: #fff; padding: 14px 24px; border-radius: 999px;
      font-size: 0.9rem; font-weight: 600; z-index: 999; opacity: 0; transition: all 0.25s ease;
      box-shadow: 0 10px 30px rgba(0,0,0,0.2);
    `;
    document.body.appendChild(toast);
  }
  toast.textContent = msg;
  requestAnimationFrame(() => {
    toast.style.opacity = "1";
    toast.style.transform = "translateX(-50%) translateY(0)";
  });
  clearTimeout(window._toastTimer);
  window._toastTimer = setTimeout(() => {
    toast.style.opacity = "0";
    toast.style.transform = "translateX(-50%) translateY(20px)";
  }, 2200);
}
