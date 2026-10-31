# Backend Nusa East — menjalankan lokal dan deploy ke Vercel

## Perbaikan pada paket ini
- `routes/profile.js` dikembalikan menjadi router Express untuk membaca/menyimpan avatar. Kode browser (`window`, `document`, `localStorage`, `location`) tidak boleh diletakkan di backend.
- `server.js` mengekspor aplikasi Express untuk Vercel dan hanya membuka port ketika dijalankan langsung secara lokal.
- `index.js` dan `vercel.json` ditambahkan sebagai entry point deployment.
- API frontend memilih `http://localhost:4000/api` saat dibuka dari `localhost`/`127.0.0.1`, dan memakai URL API online pada domain lain. Nilai `window.NUSAEAST_API_BASE` tetap dapat menimpa default.

## Jalankan lokal
1. Salin `.env.example` menjadi `.env` di folder `backend`.
2. Isi `DATABASE_URL` dengan connection string PostgreSQL yang valid dan `JWT_SECRET` dengan secret acak yang kuat.
3. Di terminal, masuk ke folder `backend`, lalu jalankan `npm install` dan `npm start`.
4. Pastikan `http://localhost:4000/api/health` menghasilkan `{"status":"ok","service":"nusaeast-backend"}`.
5. Jalankan frontend melalui Live Server (misalnya `http://127.0.0.1:5500`). Jangan membuka halaman lewat `file://`.

## Deploy ke Vercel
1. Push folder proyek yang sudah diperbaiki ke repository Git.
2. Pada proyek Vercel, atur **Root Directory** menjadi `backend`.
3. Tambahkan Environment Variables untuk Production (dan Preview jika diperlukan):
   - `DATABASE_URL`: connection string database Neon/PostgreSQL.
   - `JWT_SECRET`: secret acak yang kuat; jangan gunakan nilai contoh.
   - `FRONTEND_URL`: origin frontend persis, tanpa path, misalnya `https://nama-frontend.vercel.app`. Jika beberapa origin digunakan, pisahkan dengan koma.
   - `MIDTRANS_SERVER_KEY`, `MIDTRANS_CLIENT_KEY`, `MIDTRANS_IS_PRODUCTION` hanya jika fitur Midtrans dipakai.
   - `ADMIN_REGISTRATION_KEY` sudah TIDAK dipakai (pendaftaran admin publik dihapus). Akun internal dibuat dengan `npm run create-staff`.
   - `AVATAR_UPLOAD_DIR` (folder foto profil) harus berupa penyimpanan persisten; disk Vercel bersifat sementara.
4. Redeploy setelah menambahkan variabel.
5. Tes `https://ALAMAT-BACKEND/api/health`. Endpoint ini hanya menguji aplikasi backend, bukan koneksi database.

Jangan unggah `.env` ke Git atau membagikan nilainya. File `.env` tidak disertakan dalam paket ini demi keamanan; isi ulang variabelnya di komputer/Vercel.
