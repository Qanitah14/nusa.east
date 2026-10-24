-- =========================================================
-- NUSA EAST — DATABASE SCHEMA (PostgreSQL)
-- Jalankan: psql -U postgres -d nusaeast -f schema.sql
-- =========================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto"; -- untuk gen_random_uuid()

-- ---------- USERS ----------
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(150) NOT NULL,
  email VARCHAR(150) UNIQUE NOT NULL,
  phone VARCHAR(30),
  password_hash TEXT NOT NULL,
  role VARCHAR(20) NOT NULL DEFAULT 'client', -- client | admin | staff
  created_at TIMESTAMP DEFAULT now()
);

-- ---------- ADMINS ----------
CREATE TABLE IF NOT EXISTS admins (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(150) NOT NULL,
  email VARCHAR(150) UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT now()
);

-- ---------- SERVICES (4 layanan utama) ----------
CREATE TABLE services (
  id VARCHAR(30) PRIMARY KEY,        -- 'smm' | 'content' | 'ecommerce' | 'brand'
  name VARCHAR(150) NOT NULL,
  billing_type VARCHAR(20) NOT NULL, -- 'subscription' | 'project'
  description TEXT
);

-- ---------- FOTO LAYANAN ADMIN (persisten di PostgreSQL) ----------
CREATE TABLE IF NOT EXISTS service_images (
  service_id VARCHAR(30) PRIMARY KEY REFERENCES services(id) ON DELETE CASCADE,
  file_name VARCHAR(255) NOT NULL,
  mime_type VARCHAR(50) NOT NULL CHECK (mime_type IN ('image/jpeg', 'image/png', 'image/webp', 'image/gif')),
  image_data BYTEA NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ---------- PACKAGES (paket lengkap, tier per layanan) ----------
CREATE TABLE packages (
  id VARCHAR(50) PRIMARY KEY,        -- e.g. 'smm-growth'
  service_id VARCHAR(30) REFERENCES services(id),
  tier_name VARCHAR(50) NOT NULL,    -- Basic / Growth / Premium, dst
  price NUMERIC(14,2) NOT NULL,
  eta_label VARCHAR(100),            -- estimasi pengerjaan (untuk project-based)
  revision_limit INT DEFAULT 1,
  details JSONB,                     -- fitur/isi paket dalam format fleksibel
  is_highlighted BOOLEAN DEFAULT false
);

-- ---------- LAYANAN SATUAN ----------
CREATE TABLE single_services (
  id VARCHAR(50) PRIMARY KEY,
  service_id VARCHAR(30) REFERENCES services(id),
  name VARCHAR(150) NOT NULL,
  unit_label VARCHAR(100),
  price NUMERIC(14,2) NOT NULL,
  image_url TEXT,
  description TEXT NOT NULL DEFAULT '',
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE
);

-- ---------- ULASAN LAYANAN SATUAN ----------
CREATE TABLE IF NOT EXISTS single_service_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  single_service_id VARCHAR(50) NOT NULL REFERENCES single_services(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  rating SMALLINT NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment TEXT NOT NULL CHECK (char_length(comment) BETWEEN 3 AND 1200),
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE(single_service_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_single_reviews_product_date ON single_service_reviews(single_service_id, created_at DESC);

-- ---------- ADD-ONS ----------
CREATE TABLE addons (
  id VARCHAR(50) PRIMARY KEY,
  name VARCHAR(150) NOT NULL,
  price NUMERIC(14,2),               -- NULL jika berbasis persen
  percent NUMERIC(5,2),              -- misal 20.00 untuk Express +20%
  note VARCHAR(150)
);

-- ---------- ORDERS ----------
CREATE TABLE orders (
  id VARCHAR(30) PRIMARY KEY,        -- format: NE-2026-0091
  user_id UUID REFERENCES users(id),
  total NUMERIC(14,2) NOT NULL,
  payment_method VARCHAR(30),        -- va | ewallet | qris
  payment_status VARCHAR(20) DEFAULT 'pending', -- pending | paid | failed | expired
  status VARCHAR(40) DEFAULT 'Pesanan Dibuat',
  revision_used INT DEFAULT 0,
  revision_limit INT DEFAULT 1,
  work_started_at TIMESTAMP,         -- diisi setelah brief + bahan lengkap (bukan saat checkout!)
  estimated_completion_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT now()
);

-- ---------- ORDER ITEMS (paket / satuan / add-on dalam 1 order) ----------
CREATE TABLE order_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id VARCHAR(30) REFERENCES orders(id) ON DELETE CASCADE,
  item_type VARCHAR(20) NOT NULL,    -- package | single | addon
  item_ref_id VARCHAR(50),           -- id dari packages/single_services/addons
  name VARCHAR(150) NOT NULL,
  price NUMERIC(14,2) NOT NULL,
  qty INT DEFAULT 1,
  line_total NUMERIC(14,2) NOT NULL
);

-- ---------- PROJECT BRIEF ----------
CREATE TABLE project_briefs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id VARCHAR(30) REFERENCES orders(id) ON DELETE CASCADE,
  brand_name VARCHAR(150),
  contact_name VARCHAR(150),
  whatsapp VARCHAR(30),
  audience TEXT,
  tone VARCHAR(50),
  brief_detail TEXT,
  materials_received BOOLEAN DEFAULT false,
  submitted_at TIMESTAMP DEFAULT now()
);

-- ---------- STATUS LOG (tracking history / timeline) ----------
CREATE TABLE project_status_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id VARCHAR(30) REFERENCES orders(id) ON DELETE CASCADE,
  step VARCHAR(50) NOT NULL,   -- salah satu dari STATUS_STEPS di frontend
  note TEXT,
  created_at TIMESTAMP DEFAULT now()
);

-- ---------- REVISIONS ----------
CREATE TABLE revisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id VARCHAR(30) REFERENCES orders(id) ON DELETE CASCADE,
  note TEXT NOT NULL,
  requested_at TIMESTAMP DEFAULT now(),
  resolved_at TIMESTAMP
);

-- ---------- PAYMENTS (log transaksi dari payment gateway) ----------
CREATE TABLE payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id VARCHAR(30) REFERENCES orders(id) ON DELETE CASCADE,
  gateway VARCHAR(30),              -- midtrans | xendit | manual
  gateway_ref VARCHAR(150),         -- transaction_id dari gateway
  amount NUMERIC(14,2) NOT NULL,
  status VARCHAR(20) DEFAULT 'pending', -- pending | settlement | expire | cancel
  raw_payload JSONB,
  created_at TIMESTAMP DEFAULT now()
);

CREATE INDEX idx_orders_user ON orders(user_id);
CREATE INDEX idx_order_items_order ON order_items(order_id);
CREATE INDEX idx_status_log_order ON project_status_log(order_id);
CREATE INDEX idx_payments_order ON payments(order_id);
