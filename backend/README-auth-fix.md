# Nusa East — perbaikan autentikasi produksi

## Yang diubah
- `backend/db/migrations/006_auth_compatibility.sql`: memastikan kolom dan tabel autentikasi yang dipakai backend tersedia secara idempotent.
- `backend/db/migrate.js`: menjalankan migrasi 005 lalu 006.
- `backend/db/schema.sql`: menambahkan view `sales_admin_accounts` dan `operator_accounts`.
- `backend/routes/auth.js`: mengembalikan `image_url` dan tetap kompatibel dengan `avatar_url`.
- `backend/db/check_auth_production.sql`: query pemeriksaan akun/role dan objek database.

## Penting tentang pemisahan akun
Agar login, sesi, reset password, audit, dan relasi order tetap konsisten, tabel `users` masih menjadi sumber utama identitas. `sales_admin_accounts` dan `operator_accounts` adalah VIEW PostgreSQL yang menampilkan akun sesuai role secara terpisah. Ini menghindari duplikasi password/hash dan ketidaksinkronan antar tabel fisik. Endpoint tetap membatasi login pelanggan ke `user`, admin penjualan ke `sales_admin`, dan operator ke `super_user`.

## Terapkan pada server online (bukan localhost)
1. Pastikan `backend/.env` lokal tidak dipakai sebagai konfigurasi production. Database produksi ditentukan oleh `DATABASE_URL` di Vercel.
2. Buka Neon SQL Editor pada project/branch/database production yang benar.
3. Jalankan isi `backend/db/migrations/006_auth_compatibility.sql`. Migrasi ini tidak menghapus tabel/data.
4. Periksa akun melalui `backend/db/check_auth_production.sql`. Ganti email contoh di query jika perlu.
5. Akun operator harus memiliki role `super_user`; admin penjualan harus `sales_admin`; pelanggan harus `user`. Jangan mengubah role tanpa memastikan akun mana yang memang operator/admin.
6. Deploy perubahan backend ke project Vercel `nusa-east-vsxf` dari folder backend/repository yang benar. Pastikan Environment Variables `DATABASE_URL` dan `JWT_SECRET` tetap berisi nilai production yang benar.
7. Uji `POST /api/auth/operator-login`, `/api/auth/admin-login`, dan `/api/auth/login` dengan akun masing-masing.

Jangan mengunggah `.env` atau membagikan password/hash. Login 401 setelah migrasi biasanya berarti akun tidak ada, password tidak cocok, atau role akun tidak sesuai endpoint.
