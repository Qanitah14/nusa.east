# Nusa East — Implementasi CMS dan Perbaikan Operator

Paket ini merupakan perubahan inkremental terhadap proyek yang sudah ada. Struktur, autentikasi, URL API production yang sudah dipakai frontend, dan tabel transaksi tidak diganti.

## Perubahan
- Menu Manajemen Role dan Status Login dihapus dari navigasi operator; halaman khusus `roles.html` dan `sessions.html` dihilangkan.
- Kolom/status login di halaman pengguna, pelanggan, dan akun dihilangkan. Autentikasi, sesi, dan role yang dibutuhkan backend tetap dipertahankan.
- CRUD pelanggan ditambahkan melalui endpoint operator; penghapusan pelanggan ditolak bila masih memiliki riwayat pesanan.
- CMS untuk artikel, syarat dan ketentuan, kebijakan privasi, Hero Section, dan About ditambahkan.
- Artikel publik hanya menampilkan artikel dengan `is_published=true`.
- Upload gambar disimpan persisten dalam tabel PostgreSQL `content_media` (BYTEA), sehingga tidak bergantung pada filesystem sementara serverless.
- Homepage dan halaman About mengambil konten hero/about dari API publik. Halaman artikel, syarat dan ketentuan, dan kebijakan privasi juga ditambahkan.
- Model `Content` ditambahkan ke `backend/models.js`.

## Migration
File: `backend/db/migrations/007_cms_content.sql`

Membuat tabel:
- `articles` (termasuk `is_published` untuk status publikasi)
- `terms_and_conditions`
- `privacy_policies`
- `hero_sections`
- `about_sections`
- `content_media`

Migration bersifat additive dan tidak menghapus tabel maupun data pelanggan/transaksi.

Jalankan migration dari lingkungan backend yang memiliki environment production yang benar:
```bash
cd backend
npm run migrate
```
Perintah tersebut menjalankan migration 005, 006, dan 007 dalam transaksi. Pastikan backup database production tersedia sebelum eksekusi.

## API baru
- `GET /api/content/public/articles`
- `GET /api/content/public/articles/:slug`
- `GET /api/content/public/hero`
- `GET /api/content/public/about`
- `GET /api/content/public/legal/terms`
- `GET /api/content/public/legal/privacy`
- `GET /api/content/media/:id`
- `GET /api/content/:table` (operator)
- `POST /api/content/:table` (operator)
- `PUT /api/content/:table/:id` (operator)
- `DELETE /api/content/:table/:id` (operator)
- `POST /api/content/upload` (operator)

Tabel yang didukung `:table`: `articles`, `terms_and_conditions`, `privacy_policies`, `hero_sections`, `about_sections`.

CRUD pelanggan:
- `GET /api/operator/customers` (sudah ada)
- `POST /api/operator/customers`
- `PUT /api/operator/customers/:id`
- `DELETE /api/operator/customers/:id`

## Catatan deployment
File `.env`, folder `.git`, dan `node_modules` sengaja tidak disertakan dalam paket distribusi. Gunakan environment variables yang sudah disetel pada hosting; jangan mengubah `DATABASE_URL` atau `FRONTEND_URL` menjadi localhost.

**Status production: BELUM DIDEploy / BELUM diverifikasi.** Paket sumber sudah dimodifikasi dan pemeriksaan sintaks JavaScript berhasil. Migration database, uji integrasi dengan PostgreSQL production, dan deployment Vercel/server belum dapat dilakukan dari sesi ini karena tidak ada akses terotorisasi ke project hosting maupun database production. Jangan menganggap fitur baru aktif di website live sebelum migration dan deployment dilakukan.
