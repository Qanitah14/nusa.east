"use strict";
// Peta jenis akun -> tabel database. Nama tabel hanya berasal dari daftar tetap ini
// (tidak pernah dari input pengguna), sehingga aman dipakai dalam SQL.
//
//   account_type  role (API/frontend)   tabel        siapa
//   user          user                  users        pelanggan
//   admin         sales_admin           admins       Admin Penjualan
//   operator      super_user            operators    Operator / Super User
const TYPES = {
  user:     { type: "user",     role: "user",        table: "users",     label: "Pelanggan" },
  admin:    { type: "admin",    role: "sales_admin", table: "admins",    label: "Admin Penjualan" },
  operator: { type: "operator", role: "super_user",  table: "operators", label: "Operator" }
};
const BY_ROLE = Object.fromEntries(Object.values(TYPES).map((t) => [t.role, t]));
const typeOfRole = (role) => (BY_ROLE[role] || {}).type || null;
const roleOfType = (type) => (TYPES[type] || {}).role || null;
const tableOf = (type) => { if (!TYPES[type]) throw new Error("Jenis akun tidak dikenal."); return TYPES[type].table; };

// Kolom yang dikirim ke klien. Tabel staf tidak punya alamat/foto -> dikembalikan sebagai NULL.
const SELECT_COLS = {
  user:     "id, name, email, phone, address, avatar_url, status, created_at, updated_at",
  admin:    "id, name, email, phone, NULL::text AS address, NULL::text AS avatar_url, status, created_at, updated_at",
  operator: "id, name, email, phone, NULL::text AS address, NULL::text AS avatar_url, status, created_at, updated_at"
};
const selectCols = (type) => { if (!SELECT_COLS[type]) throw new Error("Jenis akun tidak dikenal."); return SELECT_COLS[type]; };

const publicAccount = (type, row) => ({
  id: row.id, name: row.name, email: row.email, role: roleOfType(type), account_type: type,
  phone: row.phone || "", address: row.address || "", avatar_url: row.avatar_url || null,
  status: row.status, created_at: row.created_at
});

// Cari satu akun berdasarkan email di SEMUA tabel (untuk cek email unik antar-jenis akun).
async function emailTaken(db, email, exceptId = null) {
  const r = await db.query(
    `SELECT account_type FROM all_accounts WHERE LOWER(email) = $1 AND ($2::uuid IS NULL OR id <> $2) LIMIT 1`, [email, exceptId]);
  return r.rows[0] ? r.rows[0].account_type : null;
}

module.exports = { TYPES, typeOfRole, roleOfType, tableOf, selectCols, publicAccount, emailTaken };
