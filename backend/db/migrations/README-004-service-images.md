# Migrasi foto layanan admin

Foto layanan dari form **Admin → Layanan → Tambah Layanan** disimpan di PostgreSQL agar tetap tersedia di Vercel Functions (filesystem Function tidak persisten).

## Menjalankan di Neon

1. Buka Neon Console → project `nusaeast` → database `neondb` → SQL Editor.
2. Buka `backend/db/migrations/004_service_images.sql` dari project.
3. Salin seluruh SQL ke SQL Editor dan klik **Run**.
4. Setelah sukses, deploy backend dari GitHub agar endpoint upload foto aktif.

Tabel yang dibuat:

- `service_images.service_id`: primary key sekaligus foreign key ke `services.id`.
- `file_name`: nama file asli untuk referensi.
- `mime_type`: tipe gambar yang diizinkan.
- `image_data`: byte gambar (BYTEA).
- `updated_at`: waktu gambar dibuat/diperbarui.

Ukuran upload maksimal 5 MB; format JPG, PNG, WEBP, dan GIF. Foto dilayani melalui endpoint publik `GET /api/services/images/:id`, sedangkan unggah/ganti/hapus foto tetap dilindungi autentikasi admin.
