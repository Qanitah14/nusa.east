/* =========================================================
   NUSA EAST — KATALOG DARI DATABASE
   Halaman pengguna (layanan, paket, satuan) mengambil data dari
   GET /api/services/catalog. Jika backend tidak bisa dihubungi atau
   database masih kosong, otomatis memakai js/data.js sebagai cadangan
   sehingga situs tetap tampil.
   ========================================================= */

function nusaeastApiBase() {
  return "https://nusa-east-vsxf.vercel.app/api";
}

// "/uploads/x.jpg" -> "https://nusa-east-vsxf.vercel.app/uploads/x.jpg"
function assetUrl(path) {
  if (!path) return "";
  if (/^(https?:|data:)/i.test(path)) return path;
  return nusaeastApiBase().replace(/\/api\/?$/, "") + path;
}

function escapeHTML(value) {
  return String(value ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

async function loadCatalog() {
  if (typeof NUSAEAST_DATA === "undefined") return null;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 5000);
  try {
    const res = await fetch(`${nusaeastApiBase()}/services/catalog`, { signal: ctrl.signal });
    if (!res.ok) throw new Error("HTTP " + res.status);
    const data = await res.json();
    if (Array.isArray(data.services) && data.services.length) {
      NUSAEAST_DATA.services = data.services;
      NUSAEAST_DATA.packages = data.packages || {};
      NUSAEAST_DATA.singles = data.singles || [];
      NUSAEAST_DATA.fromApi = true;
    }
  } catch (err) {
    console.warn("Katalog dari database tidak tersedia, memakai data bawaan.", err.message);
  } finally {
    clearTimeout(timer);
  }
  return NUSAEAST_DATA;
}
