/* =========================================================
   NUSA EAST — FRONTEND CART (localStorage)
   Versi frontend-only: data keranjang disimpan sementara
   di browser agar seluruh alur HTML dapat diuji tanpa backend.
   ========================================================= */

const CART_KEY = "nusaeast_cart";

function readCart() {
  try { return JSON.parse(localStorage.getItem(CART_KEY) || "[]"); }
  catch (_) { return []; }
}

function writeCart(cart) {
  localStorage.setItem(CART_KEY, JSON.stringify(cart));
}

function makeCartId(item) {
  return `${item.type || "item"}-${item.id}-${Date.now()}-${Math.random().toString(36).slice(2,7)}`;
}

async function getCart() {
  return readCart();
}

async function addToCart(item) {
  const cart = readCart();
  const existing = cart.find(i => i.id === item.id && i.type === item.type);
  if (existing) {
    existing.qty = (existing.qty || 1) + (item.qty || 1);
    existing.selected = true;
  } else {
    cart.push({
      cartId: makeCartId(item),
      id: item.id,
      type: item.type,
      name: item.name,
      price: Number(item.price) || 0,
      qty: Math.max(1, Number(item.qty) || 1),
      meta: item.meta || null,
      selected: true
    });
  }
  writeCart(cart);
  if (typeof updateCartCount === "function") await updateCartCount();
  if (typeof showToast === "function") showToast(`${item.name} ditambahkan ke keranjang.`);
  return cart;
}

async function removeFromCart(cartId) {
  writeCart(readCart().filter(i => i.cartId !== cartId));
  if (typeof updateCartCount === "function") await updateCartCount();
  if (typeof renderCartPage === "function") await renderCartPage();
}

async function updateQty(cartId, currentQty, delta) {
  const cart = readCart();
  const item = cart.find(i => i.cartId === cartId);
  if (!item) return;
  item.qty = Math.max(1, Number(currentQty || item.qty || 1) + Number(delta || 0));
  writeCart(cart);
  if (typeof updateCartCount === "function") await updateCartCount();
  if (typeof renderCartPage === "function") await renderCartPage();
}

async function toggleCartSelection(cartId, checked) {
  const cart = readCart();
  const item = cart.find(i => i.cartId === cartId);
  if (!item) return;
  item.selected = Boolean(checked);
  writeCart(cart);
  if (typeof renderCartPage === "function") await renderCartPage();
}

async function removeSelectedFromCart() {
  writeCart(readCart().filter(i => i.selected === false));
  if (typeof updateCartCount === "function") await updateCartCount();
}

async function clearCart() {
  localStorage.removeItem(CART_KEY);
  if (typeof updateCartCount === "function") await updateCartCount();
}

async function calculateCartTotals(selectedOnly = false) {
  const cart = readCart();
  const activeCart = selectedOnly ? cart.filter(i => i.selected !== false) : cart;
  const breakdown = activeCart.map(i => ({
    ...i,
    lineTotal: Number(i.price) * (i.qty || 1)
  }));
  const base = breakdown.reduce((sum, i) => sum + i.lineTotal, 0);
  return { cart: activeCart, breakdown, base, percentExtra: 0, total: base };
}

function formatIDR(value) {
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(Number(value) || 0);
}

function showToast(message) {
  let toast = document.getElementById("nusaeastToast");
  if (!toast) {
    toast = document.createElement("div");
    toast.id = "nusaeastToast";
    toast.className = "toast";
    document.body.appendChild(toast);
  }
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(window.__nusaeastToastTimer);
  window.__nusaeastToastTimer = setTimeout(() => toast.classList.remove("show"), 2600);
}
