
/* NUSA EAST — Autentikasi frontend.
 * Tidak menggunakan fallback demo diam-diam.
 */

"use strict";

// Gunakan satu alamat API yang konsisten dengan backend production.
const API_BASE = "https://nusa-east-vsxf.vercel.app/api";

/**
 * Mengirim permintaan ke backend.
 */
async function authRequest(path, payload = {}, token = null) {
  const response = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    body: JSON.stringify(payload || {}),
    credentials: "omit"
  });

  // Tangani respons JSON maupun respons server yang bukan JSON.
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(
      data.error ||
      data.message ||
      `Permintaan gagal (${response.status})`
    );
  }

  return data;
}

/**
 * Menentukan halaman tujuan setelah login atau registrasi.
 * Hanya menerima alamat halaman relatif lokal.
 */
function getPostLoginDestination() {
  const params = new URLSearchParams(window.location.search);
  const requested = params.get("redirect");

  if (!requested) {
    return "profile.html";
  }

  // Tolak URL eksternal, protocol-relative URL, dan backslash.
  if (
    requested.startsWith("/") ||
    requested.startsWith("\\") ||
    requested.includes("://") ||
    requested.startsWith("//")
  ) {
    return "profile.html";
  }

  try {
    const target = new URL(requested, window.location.href);

    if (target.origin !== window.location.origin) {
      return "profile.html";
    }

    return target.href;
  } catch {
    return "profile.html";
  }
}

/**
 * Menyimpan sesi pengguna dan token dari backend.
 */
function saveAuthSession(data) {
  if (!data || !data.user) {
    throw new Error("Data akun tidak ditemukan dari respons server.");
  }

  const user = { ...data.user };

  // Kompatibilitas antara nama kolom gambar lama dan baru.
  user.image_url = user.image_url || user.avatar_url || null;
  user.avatar_url = user.avatar_url || user.image_url || null;

  localStorage.setItem("nusaeast_session", JSON.stringify(user));

  if (data.token) {
    localStorage.setItem("nusaeast_token", data.token);
  } else {
    localStorage.removeItem("nusaeast_token");
  }

  return user;
}

/**
 * Login pelanggan.
 */
async function nusaeastLogin(email, password) {
  const normalizedEmail = String(email || "").trim().toLowerCase();

  if (!normalizedEmail || !String(password || "")) {
    throw new Error("Email dan password wajib diisi.");
  }

  const data = await authRequest("/auth/login", {
    email: normalizedEmail,
    password: String(password)
  });

  saveAuthSession(data);

  window.location.href = getPostLoginDestination();
}

/**
 * Registrasi pelanggan.
 * Role ditentukan oleh backend, bukan oleh frontend.
 */
async function nusaeastRegister(payload = {}) {
  const name = String(payload.name || "").trim();
  const email = String(payload.email || "").trim().toLowerCase();
  const phone = String(payload.phone || "").trim();
  const address = String(payload.address || "").trim();
  const password = String(payload.password || "");

  if (!name || !email || !password) {
    throw new Error("Nama, email, dan password wajib diisi.");
  }

  const data = await authRequest("/auth/register", {
    name,
    email,
    phone,
    address,
    password
  });

  saveAuthSession(data);

  window.location.href = getPostLoginDestination();
}

/**
 * Logout pengguna.
 * Sesi lokal tetap dibersihkan meskipun server gagal dihubungi.
 */
async function nusaeastLogout() {
  const token = localStorage.getItem("nusaeast_token");

  if (token) {
    try {
      await authRequest("/auth/logout", {}, token);
    } catch (error) {
      console.warn("Logout server gagal:", error.message);
    }
  }

  localStorage.removeItem("nusaeast_session");
  localStorage.removeItem("nusaeast_token");

  window.location.href = "login.html";
}

/**
 * Mengajukan permintaan lupa password.
 */
async function nusaeastForgotPassword(email, phone) {
  const normalizedEmail = String(email || "").trim().toLowerCase();
  const normalizedPhone = String(phone || "").trim();

  if (!normalizedEmail) {
    throw new Error("Email wajib diisi.");
  }

  return authRequest("/auth/forgot-password", {
    email: normalizedEmail,
    phone: normalizedPhone
  });
}

/**
 * Mengatur password baru menggunakan token reset.
 */
async function nusaeastResetPassword(token, newPassword) {
  const resetToken = String(token || "").trim();
  const password = String(newPassword || "");

  if (!resetToken || !password) {
    throw new Error("Token reset dan password baru wajib diisi.");
  }

  return authRequest("/auth/reset-password", {
    token: resetToken,
    newPassword: password
  });
}

/**
 * Membaca sesi pengguna yang tersimpan di browser.
 */
function getSession() {
  try {
    return JSON.parse(
      localStorage.getItem("nusaeast_session") || "null"
    );
  } catch {
    return null;
  }
}
