-- Menyamakan skema katalog lama dengan field yang dipakai API admin.
-- Aman dijalankan berulang kali; tidak menghapus atau mengganti data yang sudah ada.

ALTER TABLE services
  ADD COLUMN IF NOT EXISTS tag VARCHAR(80) NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS icon VARCHAR(30) NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS image_url TEXT,
  ADD COLUMN IF NOT EXISTS duration_label VARCHAR(150) NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS sort_order INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE;

ALTER TABLE packages
  ADD COLUMN IF NOT EXISTS fit_text TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS sort_order INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE;

ALTER TABLE single_services
  ADD COLUMN IF NOT EXISTS sort_order INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE;

CREATE INDEX IF NOT EXISTS idx_services_active_order ON services (is_active, sort_order);
CREATE INDEX IF NOT EXISTS idx_packages_service_order ON packages (service_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_single_services_service_order ON single_services (service_id, sort_order);
