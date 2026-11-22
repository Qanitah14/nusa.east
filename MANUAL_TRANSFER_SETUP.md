# Nusa East — Pembayaran Transfer BSI

Perubahan ini menambahkan pilihan Midtrans dan transfer bank manual, upload bukti transfer (maks. 3 MB, JPG/PNG/WebP), serta antrean verifikasi Admin Penjualan.

## Perubahan file
- `checkout.html`, `css/checkout-payment.css`: pilihan metode dan instruksi rekening
- `backend/routes/orders.js`: menerima metode `manual_transfer` dan membuat catatan payment
- `backend/routes/payment.js`: upload proof, endpoint daftar admin, endpoint proof private, approve/reject
- `backend/db/migrations/008_manual_bank_transfer.sql`: migration additive untuk database yang sudah berjalan
- `backend/db/schema.sql`: tabel bukti untuk instalasi database baru
- `backend/db/migrate.js`: memasukkan migration 008
- `admin/manual-payments.html`, `js/admin.js`: halaman admin verifikasi dan menu sidebar
- `js/admin-orders.js`, `js/profile.js`, `waiting-payment.html`: label/status manual transfer

## Jalankan migration
1. Backup database Neon sebelum migration.
2. Masuk folder `backend`.
3. Pastikan `.env` berisi `DATABASE_URL` (jangan bagikan credential).
4. Jalankan `npm run migrate`.
5. Deploy backend dan frontend seperti workflow yang biasa digunakan.

Migration `008_manual_bank_transfer.sql` bersifat additive dan idempotent; tidak menghapus tabel atau data lama.

## Alur
- Midtrans tetap menggunakan Snap dan webhook yang sudah ada.
- Transfer BSI: pelanggan pilih transfer, unggah bukti, order menjadi `pending_verification`.
- Admin Penjualan buka menu **Verifikasi Transfer**, periksa bukti, lalu approve atau reject.
- Approve mengubah `orders.payment_status` menjadi `paid`, `orders.status` menjadi `Pembayaran Berhasil`, dan mencatat timeline.
- Reject memberi status bukti `rejected` dan memungkinkan pelanggan mengunggah bukti baru melalui halaman status pembayaran.

Bukti transfer disimpan sebagai `BYTEA` di database dan endpoint gambarnya memerlukan sesi Admin Penjualan.
