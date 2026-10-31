# Nusa East — satu database SQL untuk pelanggan, admin, dan operator

## Prinsip struktur
Semua identitas akun disimpan satu kali di tabel `public.users`. Pembeda akses menggunakan kolom `role`:
- `user`: pelanggan
- `sales_admin`: admin penjualan
- `super_user`: operator/superuser

Tabel pendukung autentikasi di database yang sama:
- `user_sessions`: sesi login dan status sesi
- `activity_logs`: audit aktivitas/login
- `password_reset_requests`: permintaan reset password
- `sales_admin_accounts` dan `operator_accounts`: VIEW, bukan tabel akun terpisah. Keduanya membaca akun dari `users`, sehingga tidak menduplikasi password atau identitas.

Tabel lain untuk katalog, pesanan, pembayaran, dan layanan juga tetap berada di database PostgreSQL yang sama.

## Terapkan pada database online yang dipakai Vercel
1. Buka SQL Editor pada database/branch production yang benar-benar terhubung melalui `DATABASE_URL` di Vercel.
2. Buka dan jalankan seluruh isi `db/NUSA_EAST_SINGLE_DATABASE.sql`.
3. Periksa hasil query di bagian akhir. Minimal harus terlihat `users`, `user_sessions`, `activity_logs`, `password_reset_requests`, `sales_admin_accounts`, dan `operator_accounts`.
4. Pastikan akun internal sudah ada di `users` dengan role yang tepat. SQL ini tidak membuat password atau akun operator baru.
5. Deploy folder backend ke Vercel setelah perubahan kode bila ada.
6. Uji endpoint:
   - pelanggan: `POST /api/auth/login`
   - admin penjualan: `POST /api/auth/admin-login`
   - operator/superuser: `POST /api/auth/operator-login`

## Catatan keamanan
- Jangan menyalin isi `.env` atau membagikan `DATABASE_URL`, `JWT_SECRET`, atau password.
- Jangan menjalankan SQL ini di database kosong yang salah atau database development jika targetnya production.
- Script tidak menghapus tabel lama seperti `admins`; tabel lama dipertahankan sebagai cadangan. Sumber akun aktif tetap `users`.
- Jika error `42703` masih muncul, buka detail log backend yang lengkap untuk mengetahui nama kolom yang hilang. Error `42P01` terkait tabel yang tidak ditemukan biasanya selesai setelah tabel pendukung dibuat pada database production yang benar.
