-- =========================================================
-- NUSA EAST — MIGRASI 003: Manajemen layanan oleh admin
-- Jalankan SETELAH schema.sql (aman diulang, semua IF NOT EXISTS):
--   psql -U postgres -d nusaeast -f db/migrations/003_admin_services.sql
-- Atau otomatis lewat:  npm run seed
-- =========================================================

-- ---------- SERVICES: tambahan kolom tampilan ----------
ALTER TABLE services ADD COLUMN IF NOT EXISTS tag VARCHAR(50);
ALTER TABLE services ADD COLUMN IF NOT EXISTS icon VARCHAR(20);
ALTER TABLE services ADD COLUMN IF NOT EXISTS image_url VARCHAR(500);
ALTER TABLE services ADD COLUMN IF NOT EXISTS duration_label VARCHAR(150);
ALTER TABLE services ADD COLUMN IF NOT EXISTS sort_order INT NOT NULL DEFAULT 0;
ALTER TABLE services ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true;

-- ---------- PACKAGES ----------
ALTER TABLE packages ADD COLUMN IF NOT EXISTS fit_text TEXT;
ALTER TABLE packages ADD COLUMN IF NOT EXISTS sort_order INT NOT NULL DEFAULT 0;
ALTER TABLE packages ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true;

-- ---------- LAYANAN SATUAN ----------
ALTER TABLE single_services ADD COLUMN IF NOT EXISTS sort_order INT NOT NULL DEFAULT 0;
ALTER TABLE single_services ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true;

CREATE INDEX IF NOT EXISTS idx_packages_service ON packages(service_id);
CREATE INDEX IF NOT EXISTS idx_singles_service ON single_services(service_id);
