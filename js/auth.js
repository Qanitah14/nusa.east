/* NUSA EAST — autentikasi frontend. Tidak menggunakan fallback demo diam-diam. */
const API_BASE = (window.NUSAEAST_API_BASE || "https://nusa-east-vsxf.vercel.app/api").replace(/\/$/, "");

async function authRequest(path, payload) {
  let response;
  try {
    response = await fetch(`${API_BASE}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
  } catch (_) {
    throw new Error(`Tidak dapat menghubungi backend (${API_BASE}). Pastikan server aktif dan CORS mengizinkan alamat frontend ini.`);
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `Permintaan gagal (HTTP ${response.status}).`);
  return data;
}

async function nusaeastRegister(payload) {
  const data = await authRequest("/auth/register", payload);
  localStorage.setItem("nusaeast_session", JSON.stringify(data.user));
  if (data.token) localStorage.setItem("nusaeast_token", data.token);
  location.href = "index.html";
}

async function nusaeastLogin(email, password) {
  const data = await authRequest("/auth/login", { email, password });
  localStorage.setItem("nusaeast_session", JSON.stringify(data.user));
  if (data.token) localStorage.setItem("nusaeast_token", data.token);
  location.href = "index.html";
}

function nusaeastLogout() {
  localStorage.removeItem("nusaeast_session");
  localStorage.removeItem("nusaeast_token");
  location.href = "login.html";
}

function getSession() {
  try { return JSON.parse(localStorage.getItem("nusaeast_session") || "null"); }
  catch (_) { return null; }
}
