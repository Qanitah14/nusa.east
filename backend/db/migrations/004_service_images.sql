-- NUSA EAST — MIGRASI 004: Foto layanan persisten di PostgreSQL
-- Jalankan sekali di Neon SQL Editor. Aman dijalankan ulang.
-- Foto disimpan di tabel terpisah agar unggahan tidak bergantung pada filesystem sementara Vercel.

CREATE TABLE IF NOT EXISTS service_images (
  service_id VARCHAR(30) PRIMARY KEY
    REFERENCES services(id) ON DELETE CASCADE,
  file_name VARCHAR(255) NOT NULL,
  mime_type VARCHAR(50) NOT NULL
    CHECK (mime_type IN ('image/jpeg', 'image/png', 'image/webp', 'image/gif')),
  image_data BYTEA NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE service_images IS 'Foto layanan yang diunggah admin; disimpan persisten di PostgreSQL.';
