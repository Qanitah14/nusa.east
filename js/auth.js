/* =========================================================
   NUSA EAST — FRONTEND AUTH DEMO
   Untuk tahap frontend HTML: akun/sesi tersimpan lokal di browser.
   Nanti fungsi ini dapat diganti kembali dengan fetch() ke backend.
   ========================================================= */

const USERS_KEY = "nusaeast_demo_users";
const SESSION_KEY = "nusaeast_session";
const TOKEN_KEY = "nusaeast_token";

function getDemoUsers() {
  try { return JSON.parse(localStorage.getItem(USERS_KEY) || "[]"); }
  catch (_) { return []; }
}

function getAuthToken() {
  return localStorage.getItem(TOKEN_KEY);
}

async function nusaeastRegister(payload) {
  const users = getDemoUsers();
  const email = String(payload.email || "").trim().toLowerCase();
  if (users.some(u => u.email === email)) {
    showToast("Email sudah terdaftar. Silakan masuk.");
    return;
  }
  const user = {
    id: `USR-${Date.now()}`,
    name: String(payload.name || payload.fullName || "Pengguna Nusa East").trim(),
    email,
    phone: String(payload.phone || payload.whatsapp || "").trim()
  };
  users.push({ ...user, password: String(payload.password || "") });
  localStorage.setItem(USERS_KEY, JSON.stringify(users));
  localStorage.setItem(SESSION_KEY, JSON.stringify(user));
  localStorage.setItem(TOKEN_KEY, `demo-${user.id}`);
  showToast("Akun berhasil dibuat.");
  setTimeout(() => location.href = "index.html", 450);
}

async function nusaeastLogin(email, password) {
  const normalized = String(email || "").trim().toLowerCase();
  const user = getDemoUsers().find(u => u.email === normalized && u.password === String(password || ""));
  if (!user) {
    showToast("Email atau password belum cocok. Daftar dulu jika belum punya akun.");
    return;
  }
  const session = { id: user.id, name: user.name, email: user.email, phone: user.phone };
  localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  localStorage.setItem(TOKEN_KEY, `demo-${user.id}`);
  showToast("Berhasil masuk.");
  setTimeout(() => location.href = "index.html", 350);
}

function nusaeastLogout() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(SESSION_KEY);
  location.href = "login.html";
}

function getSession() {
  try { return JSON.parse(localStorage.getItem(SESSION_KEY) || "null"); }
  catch (_) { return null; }
}
