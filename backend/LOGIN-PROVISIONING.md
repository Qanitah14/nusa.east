# Perbaikan provisioning login Nusa East

Semua autentikasi tetap memeriksa password dengan bcrypt dan role di tabel `users`. Tidak ada bypass yang menerima sembarang email/password.

## ENV backend yang perlu diatur di Vercel Production
- `DATABASE_URL` — database PostgreSQL production yang benar
- `JWT_SECRET` — secret acak yang kuat
- `SUPER_EMAIL`, `SUPER_NAME`, `SUPER_PASSWORD` — akun Operator/Super User
- `ADMIN_EMAIL`, `ADMIN_NAME`, `ADMIN_PASSWORD` — akun Admin Penjualan

Email internal harus berbeda dari email pelanggan. Password minimal 8 karakter. Jangan menaruh rahasia ke GitHub.

## Sinkronkan akun ke database
Perubahan ENV saja tidak otomatis membuat/memperbarui akun database. Setelah mengatur ENV, jalankan seed terhadap database yang benar dari lingkungan backend yang memiliki `DATABASE_URL` production: `npm run seed` (di folder `backend`).

Seed akan membuat akun staf jika belum ada. Jika akun dengan email yang sama sudah ada dengan role yang benar dan password ENV diatur, seed memperbarui hash password dari ENV. Jika email sudah dipakai role lain, seed berhenti dengan pesan jelas dan tidak mempromosikan akun pelanggan secara diam-diam.

Setelah seed berhasil, redeploy backend di Vercel bila kode berubah, lalu uji:
- pelanggan: `POST /api/auth/login`
- Admin Penjualan: `POST /api/auth/admin-login`
- Operator: `POST /api/auth/operator-login`

Pastikan frontend mengarah ke backend production yang sama. HTTP 401 berarti kredensial/role tidak cocok; jangan menonaktifkan pemeriksaan autentikasi untuk menghilangkan pesan tersebut.
