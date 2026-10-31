"use strict";
// Validasi bersama untuk registrasi, profil, dan reset password.
// Aturan nomor telepon HARUS sama dengan js/validators.js di frontend.

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const PHONE_RE = /^[0-9]{9,15}$/; // hanya angka, 9–15 digit (simpan sebagai string agar 0 depan tidak hilang)

const clean = (v) => String(v ?? "").trim();

function validateName(v) {
  const value = clean(v).replace(/\s+/g, " ");
  if (value.length < 2 || value.length > 150) return { ok: false, error: "Nama harus 2–150 karakter." };
  return { ok: true, value };
}

function validateEmail(v) {
  const value = clean(v).toLowerCase();
  if (!value || value.length > 150 || !EMAIL_RE.test(value)) return { ok: false, error: "Format email tidak valid." };
  return { ok: true, value };
}

function validatePhone(v) {
  const value = clean(v);
  if (!value) return { ok: false, error: "Nomor telepon wajib diisi." };
  if (/\D/.test(value)) return { ok: false, error: "Nomor telepon hanya boleh berisi angka (tanpa spasi, +, atau tanda baca)." };
  if (!PHONE_RE.test(value)) return { ok: false, error: "Nomor telepon harus 9–15 digit." };
  return { ok: true, value };
}

function validateAddress(v) {
  const value = clean(v).replace(/[ \t]+/g, " ");
  if (value.length < 5) return { ok: false, error: "Alamat minimal 5 karakter." };
  if (value.length > 500) return { ok: false, error: "Alamat maksimal 500 karakter." };
  return { ok: true, value };
}

function validatePassword(v) {
  const value = String(v ?? "");
  if (value.length < 8) return { ok: false, error: "Password minimal 8 karakter." };
  if (Buffer.byteLength(value, "utf8") > 72) return { ok: false, error: "Password maksimal 72 karakter." };
  return { ok: true, value };
}

// Hanya untuk membandingkan nomor (62812… dianggap sama dengan 0812…)
function normalizePhone(v) {
  const d = String(v ?? "").replace(/\D/g, "");
  return d.startsWith("62") ? "0" + d.slice(2) : d;
}

// Kumpulkan hasil beberapa validator; lempar error 400 pertama yang gagal.
function firstError(results) {
  const bad = results.find((r) => !r.ok);
  return bad ? bad.error : null;
}

const isUuid = (v) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(v));

module.exports = { validateName, validateEmail, validatePhone, validateAddress, validatePassword, normalizePhone, firstError, isUuid, PHONE_RE };
