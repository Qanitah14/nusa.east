/* NUSA EAST — API helper */
const NUSAEAST_API_BASE = window.NUSAEAST_API_BASE || "http://localhost:4000/api";

function getAuthToken() {
  return localStorage.getItem("nusaeast_token");
}

async function apiFetch(endpoint, options = {}) {
  const token = getAuthToken();
  const headers = { "Content-Type": "application/json", ...(options.headers || {}) };
  if (token) headers.Authorization = `Bearer ${token}`;

  const response = await fetch(`${NUSAEAST_API_BASE}${endpoint}`, { ...options, headers });
  let data = {};
  try { data = await response.json(); } catch (_) {}

  if (response.status === 401) {
    localStorage.removeItem("nusaeast_token");
    localStorage.removeItem("nusaeast_session");
    throw new Error("Sesi berakhir. Silakan login kembali.");
  }
  if (!response.ok) throw new Error(data.error || "Terjadi kesalahan pada server.");
  return data;
}
