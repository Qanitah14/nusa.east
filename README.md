# Nusa East — Website Lengkap

Website e-commerce jasa digital marketing dengan 3 jalur pemesanan (Paket
Lengkap, Layanan Satuan, Add-On), Brand Style Matcher, keranjang & checkout,
tracking project, review/revisi, hingga finalisasi. Frontend berjalan penuh
di browser (tidak perlu server untuk dicoba), dan backend (database + payment
gateway) disediakan terpisah siap dihubungkan.

## 📁 Struktur Folder

```
nusaeast/
├── index.html            → Homepage
├── about.html             → Tentang kami
├── services.html          → 4 layanan utama
├── packages.html          → Paket Lengkap (jalur pemesanan 1)
├── singles.html           → Layanan Satuan (jalur pemesanan 2)
├── addon.html              → Add-On project aktif (jalur pemesanan 3)
├── brand-matcher.html     → Brand Style Matcher (kuis interaktif)
├── cart.html               → Keranjang & total otomatis
├── checkout.html          → Simulasi pembayaran
├── confirmation.html      → Konfirmasi pesanan
├── brief.html              → Form brief project
├── tracking.html          → Tracking status project
├── review.html             → Review & revisi
├── finalize.html           → Finalisasi project
├── login.html / register.html
├── css/
│   └── style.css          → SEMUA styling (terpisah dari HTML)
├── js/
│   ├── data.js             → Sumber data: harga paket, satuan, add-on
│   ├── cart.js              → Logika keranjang & kalkulasi total
│   ├── orders.js            → Simulasi order & tracking (localStorage)
│   ├── layout.js            → Header & footer (dipakai semua halaman)
│   ├── auth.js               → Login/register (connect ke backend / demo lokal)
│   └── brand-matcher.js    → Logika kuis Brand Style Matcher
├── images/                → SEMUA gambar — tinggal ganti file di sini
│   └── (lihat "Cara Ganti Gambar" di bawah)
└── backend/
    ├── server.js
    ├── package.json
    ├── .env.example
    ├── db/schema.sql       → Skema database PostgreSQL lengkap
    ├── routes/              → auth.js, orders.js, payment.js
    └── controllers/paymentGateway.js → Integrasi Midtrans
```

## 🖼️ Cara Ganti Gambar

Semua gambar ada di folder `images/`. Setiap file punya nama yang jelas —
tinggal timpa (replace) file dengan foto asli kamu **dengan nama file yang
sama**, contoh:

| Nama File | Dipakai di | Ukuran disarankan |
|---|---|---|
| `hero-photo-1.jpg` | Homepage — foto utama hero | 700×900px (potret) |
| `hero-photo-2.jpg` | Homepage — foto kedua (belum dipakai, opsional) | 500×620px |
| `about-photo.jpg` | Halaman About | 900×700px |
| `service-social.jpg` | Halaman Layanan — Social Media | 600×450px |
| `service-content.jpg` | Halaman Layanan — Content Creation | 600×450px |
| `service-ecommerce.jpg` | Halaman Layanan — E-Commerce | 600×450px |
| `service-brand.jpg` | Halaman Layanan — Brand Development | 600×450px |
| `brand-matcher-cover.jpg` | Homepage teaser Brand Matcher | 800×600px |
| `testimonial-1/2/3.jpg` | Homepage — foto klien | 200×200px (persegi) |
| `qris-sample.jpg` | Checkout — contoh QRIS | 300×300px |

Kalau mau pakai nama file lain, cukup ubah `src="images/xxx.jpg"` di file
HTML terkait (semua sudah diberi komentar `<!-- GANTI GAMBAR -->`).

## 🚀 Cara Menjalankan Frontend

Frontend murni HTML/CSS/JS — tidak butuh build tools. Cara termudah:

1. Buka folder ini di VS Code
2. Install extension **Live Server**
3. Klik kanan `index.html` → "Open with Live Server"

Atau jalankan server statis sederhana:
```bash
cd nusaeast
python3 -m http.server 5501
```
Lalu buka `http://localhost:5501`.

> Tanpa backend aktif, cart/order/tracking tetap berfungsi penuh karena
> disimpan sementara di **localStorage browser** — cocok untuk testing/demo.
> Login/register juga otomatis fallback ke mode demo lokal jika backend
> belum menyala (lihat `js/auth.js`).

## 🗄️ Cara Menjalankan Backend (Database + Payment Gateway)

1. **Install PostgreSQL** (lokal atau pakai layanan seperti Supabase/Neon/Railway)
2. Buat database baru:
   ```sql
   CREATE DATABASE nusaeast;
   ```
3. Import skema:
   ```bash
   psql -U postgres -d nusaeast -f backend/db/schema.sql
   ```
4. Masuk ke folder backend & install dependency:
   ```bash
   cd backend
   npm install
   ```
5. Copy `.env.example` menjadi `.env`, lalu isi:
   - `DATABASE_URL` → connection string PostgreSQL kamu
   - `JWT_SECRET` → string acak (untuk keamanan token login)
   - `MIDTRANS_SERVER_KEY` & `MIDTRANS_CLIENT_KEY` → daftar gratis di
     https://dashboard.midtrans.com/register (mode **Sandbox** dulu untuk testing)
6. Jalankan server:
   ```bash
   npm start
   ```
   Backend akan aktif di `http://localhost:4000`.
7. Update `API_BASE` di `js/auth.js` (dan tambahkan pemanggilan API serupa
   di `checkout.html`/`orders.js` jika ingin cart & order juga tersambung
   ke database, bukan hanya localStorage) supaya frontend memanggil backend
   asli ini.

### 💳 Tentang Payment Gateway

Prototype ini pakai **Midtrans Snap** karena mendukung Virtual Account,
E-Wallet (GoPay/OVO/DANA), dan QRIS sekaligus dalam satu integrasi — cocok
untuk pasar Indonesia. Kode integrasinya ada di
`backend/controllers/paymentGateway.js`, sudah terstruktur supaya:

- Bisa langsung dipakai dengan **Sandbox Key** untuk testing (transaksi palsu, tidak ada uang asli)
- Tinggal ganti ke **Production Key** + `MIDTRANS_IS_PRODUCTION=true` saat siap live
- Kalau ingin pakai gateway lain (Xendit, dll), cukup ubah isi
  `createTransaction()` dan `handleNotification()` — struktur route
  (`routes/payment.js`) tidak perlu diubah

**Catatan penting:** payment gateway asli **tidak bisa aktif tanpa akun
merchant milik kamu sendiri** (perlu verifikasi bisnis ke Midtrans/Xendit).
Selama belum ada API key asli, halaman `checkout.html` di frontend akan
tetap berjalan dalam **mode simulasi** (tidak memanggil backend), supaya
kamu tetap bisa demo alur lengkap ke klien/dosen tanpa perlu backend aktif.

## 📱 Responsive

Semua halaman dites pada 3 breakpoint di `css/style.css`:
- Desktop (`> 1024px`)
- Tablet (`768px – 1024px`)
- Mobile (`< 600px`)

Termasuk hamburger menu otomatis di bawah 860px.

## ✅ Checklist Fitur (sesuai permintaan)

1. ✅ 3 jalur pemesanan — `packages.html`, `singles.html`, `addon.html`
2. ✅ 4 layanan utama — `services.html`
3. ✅ Paket dengan harga berbeda per layanan — `packages.html` + `js/data.js`
4. ✅ Layanan satuan — `singles.html`
5. ✅ Add-On project aktif — `addon.html`
6. ✅ Keranjang & total otomatis — `cart.html` + `js/cart.js`
7. ✅ Simulasi pembayaran — `checkout.html`
8. ✅ Form brief project — `brief.html`
9. ✅ Konfirmasi pesanan — `confirmation.html`
10. ✅ Tracking status project — `tracking.html`
11. ✅ Review & revisi — `review.html`
12. ✅ Finalisasi project — `finalize.html`
13. ✅ Responsive desktop/tablet/mobile — `css/style.css`

## Memulihkan katalog agar bisa diedit dari Admin

Jika menu **Paket** menampilkan `Gagal mengambil paket` atau dashboard tidak menampilkan layanan, kemungkinan database belum memiliki kolom katalog versi terbaru dan data katalog bawaan belum disalin ke PostgreSQL. Perbaikan ini menambahkan migrasi yang aman dan pengisian data awal.

1. Pastikan PostgreSQL berjalan dan database `nusaeast` sudah dibuat.
2. Pastikan `backend/.env` memiliki `DATABASE_URL` yang benar.
3. Buka terminal di folder `backend`, lalu jalankan:

   ```bash
   npm install
   npm run db:setup
   npm start
   ```

4. Login sebagai admin, lalu buka menu **Layanan**, **Paket**, dan **Layanan Satuan**.

Perintah `npm run db:setup` menambahkan kolom katalog yang diperlukan dan memasukkan layanan/paket bawaan dari `js/data.js` hanya jika ID-nya belum ada. Data yang sudah ada dengan ID sama tidak ditimpa, sehingga perubahan nama, harga, status, dan detail yang sudah diedit di database tetap dipertahankan. Jalankan setup ini pada database project yang benar.

## Sinkronisasi katalog admin ke database

Data awal layanan, paket, dan layanan satuan tetap disimpan di `js/data.js` sebagai katalog bawaan. Agar item bawaan masuk ke database dan bisa diedit dari Admin, isi `backend/.env` dengan `DATABASE_URL` dan `JWT_SECRET`, lalu jalankan dari folder `backend`:

```bash
npm install
npm run db:setup
npm start
```

Perintah `npm run db:setup` menjalankan migrasi katalog dan menambahkan item bawaan yang belum ada. Item yang sudah ada tidak ditimpa, jadi perubahan admin tetap aman.

### Foto layanan satuan

Foto default disimpan di `images/products/` dan mapping path-nya ada di `js/data.js` pada `SINGLE_PRODUCT_IMAGES`. Ganti file JPG atau ubah path tersebut untuk mengganti gambar. Foto dan deskripsi tiap produk juga dapat diubah dari Admin > Layanan Satuan setelah database disinkronkan.

### Detail produk, rekomendasi, rating, dan ulasan

Buka produk melalui `single-detail.html?id=single-feed` (ganti ID sesuai produk). Detail menampilkan foto, deskripsi, rekomendasi layanan lain, serta ulasan dan rating. Ulasan disimpan di PostgreSQL; pelanggan harus login terlebih dahulu. Jalankan `npm run db:setup` agar tabel ulasan dan kolom foto/deskripsi dibuat.



## 🔐 Role, Dashboard Internal & Keamanan (pembaruan)

| Role | Disimpan di `users.role` | Masuk lewat | Dashboard |
|---|---|---|---|
| Pelanggan | `user` | `login.html` / `register.html` | `profile.html` |
| Admin Penjualan | `sales_admin` | `admin/login.html` (tanpa link publik) | `admin/` |
| Super User / Operator | `super_user` | `operator/login.html` (tanpa link publik) | `operator/` |

- Registrasi publik hanya membuat role `user`. Akun internal dibuat lewat `npm run create-staff`,
  `node db/seed.js`, atau dari dashboard Operator → Manajemen Role.
- Semua otorisasi dicek di backend (`backend/middleware/auth.js`): role & status akun dibaca ulang dari database
  pada setiap request; token hanya membawa id sesi.
- Status Online/Offline memakai tabel `user_sessions` (heartbeat tiap 2 menit; online = aktif < 5 menit).
  Riwayat login/logout dan audit ada di `activity_logs`. Reset password memakai `password_reset_requests`
  (token acak 256-bit, hanya hash yang disimpan, sekali pakai, berlaku 60 menit).
- Foto profil: file di `AVATAR_UPLOAD_DIR`, database hanya menyimpan path di `users.avatar_url`.

### Menjalankan migrasi (sekali, aman diulang)
```bash
cd backend
npm run migrate                 # skema baru + pindah akun dari tabel admins ke users
npm run create-staff -- --role super_user --email operator@nusaeast.id --name "Operator"
npm run migrate-avatars         # salin foto lama (BYTEA) ke file; tabel lama TIDAK dihapus
npm run migrate-avatars -- --drop-table   # hanya setelah verifikasi OK & file berada di penyimpanan persisten
npm test                        # uji RBAC & validasi (database di-stub)
```
