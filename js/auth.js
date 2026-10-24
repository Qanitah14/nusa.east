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


function getPostLoginDestination() {
  const params = new URLSearchParams(window.location.search);
  const requested = params.get("redirect");
  // Hanya izinkan halaman relatif lokal; cegah redirect ke situs luar.
  if (requested && !requested.startsWith("/") && !requested.startsWith("\\") && !requested.includes("://")) {
    return requested;
  }
  return "profile.html";
}

async function nusaeastLogin(email, password) {
  const data = await authRequest("/auth/login", { email, password });
  if (!data.user) throw new Error("Data akun tidak ditemukan dari respons server.");

  localStorage.setItem("nusaeast_session", JSON.stringify(data.user));
  if (data.token) localStorage.setItem("nusaeast_token", data.token);

  // Kembali ke halaman lokal yang diminta sebelum login, jika ada.
  location.href = getPostLoginDestination();
}

async function nusaeastRegister(payload) {
  const data = await authRequest("/auth/register", {
    name: String(payload.name || "").trim(),
    email: String(payload.email || "").trim().toLowerCase(),
    phone: String(payload.phone || "").trim(),
    password: String(payload.password || "")
  });

  if (!data.user) throw new Error("Pendaftaran berhasil diproses, tetapi data akun tidak diterima.");

  localStorage.setItem("nusaeast_session", JSON.stringify(data.user));
  if (data.token) localStorage.setItem("nusaeast_token", data.token);

  // Kembali ke halaman lokal yang diminta sebelum daftar, jika ada.
  location.href = getPostLoginDestination();
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
