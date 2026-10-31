-- =========================================================
-- NUSA EAST — SINGLE CONSOLIDATED DATABASE SETUP
-- PostgreSQL / Production
--
-- File tunggal untuk struktur website dan autentikasi:
--   * users: user, sales_admin, super_user
--   * katalog, pesanan, pembayaran, ulasan
--   * user_sessions, activity_logs, password_reset_requests
--   * views sales_admin_accounts dan operator_accounts
--
-- Aman untuk dijalankan ulang untuk objek yang sudah ada, tetapi tetap
-- periksa database tujuan dan buat backup sebelum menjalankan di production.
-- Skrip ini tidak menghapus tabel atau data.
-- =========================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto"; -- untuk gen_random_uuid()

-- ---------- USERS ----------
-- Satu tabel untuk semua akun. Role: user | sales_admin | super_user.
-- Foto profil disimpan sebagai URL/path pada avatar_url atau image_url; tidak menyimpan data gambar di tabel users.
-- Tabel sesi, log aktivitas, dan reset password dibuat oleh migrations/005_rbac_sessions_reset.sql
-- (dijalankan otomatis oleh `npm run migrate` / `node db/seed.js`).
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(150) NOT NULL,
  email VARCHAR(150) UNIQUE NOT NULL,
  phone VARCHAR(30),                       -- string (bukan integer) agar 0 di depan tidak hilang
  address TEXT,
  password_hash TEXT NOT NULL,             -- hash bcrypt
  role VARCHAR(20) NOT NULL DEFAULT 'user',
  status VARCHAR(20) NOT NULL DEFAULT 'active', -- active | disabled | blocked
  avatar_url VARCHAR(500),
  image_url TEXT,
  created_at TIMESTAMP DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Pastikan schema juga bisa diterapkan ke database lama yang tabel users-nya sudah ada.
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS phone VARCHAR(30);
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS address TEXT;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS password_hash TEXT;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS role VARCHAR(20) NOT NULL DEFAULT 'user';
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT 'active';
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS avatar_url VARCHAR(500);
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS image_url TEXT;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT now();
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

-- Tabel yang diperlukan oleh backend autentikasi (login, sesi, aktivitas, reset password).
CREATE TABLE IF NOT EXISTS public.user_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL,
  ended_at TIMESTAMPTZ,
  end_reason VARCHAR(20) CHECK (end_reason IN ('logout','expired','timeout','revoked','password_reset')),
  ip VARCHAR(64),
  user_agent VARCHAR(300)
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON public.user_sessions(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sessions_active ON public.user_sessions(last_seen_at) WHERE ended_at IS NULL;

CREATE TABLE IF NOT EXISTS public.activity_logs (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  actor_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  actor_role VARCHAR(20),
  action VARCHAR(50) NOT NULL,
  target_user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  detail JSONB,
  ip VARCHAR(64),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_activity_created ON public.activity_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_activity_action ON public.activity_logs(action, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_activity_actor ON public.activity_logs(actor_id);
CREATE INDEX IF NOT EXISTS idx_activity_target ON public.activity_logs(target_user_id);

CREATE TABLE IF NOT EXISTS public.password_reset_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  status VARCHAR(15) NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','processing','approved','completed','rejected','expired')),
  source VARCHAR(10) NOT NULL DEFAULT 'user' CHECK (source IN ('user','operator')),
  identity_verified BOOLEAN NOT NULL DEFAULT false,
  token_hash CHAR(64),
  token_expires_at TIMESTAMPTZ,
  token_used_at TIMESTAMPTZ,
  handled_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_reset_open_per_user
  ON public.password_reset_requests(user_id) WHERE status IN ('pending','processing','approved');
CREATE UNIQUE INDEX IF NOT EXISTS uq_reset_token_hash
  ON public.password_reset_requests(token_hash) WHERE token_hash IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_reset_status ON public.password_reset_requests(status, created_at DESC);

-- ---------- PROFIL ADMIN & OPERATOR (satu tabel untuk keduanya) ----------
-- Hanya menyimpan link foto profil dan tanggal. Identitas & login tetap di tabel users.
CREATE TABLE IF NOT EXISTS public.staff_profiles (
  user_id UUID PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
  image_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------- SERVICES (4 layanan utama) ----------
CREATE TABLE IF NOT EXISTS services (
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
CREATE TABLE IF NOT EXISTS packages (
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
CREATE TABLE IF NOT EXISTS single_services (
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
CREATE TABLE IF NOT EXISTS addons (
  id VARCHAR(50) PRIMARY KEY,
  name VARCHAR(150) NOT NULL,
  price NUMERIC(14,2),               -- NULL jika berbasis persen
  percent NUMERIC(5,2),              -- misal 20.00 untuk Express +20%
  note VARCHAR(150)
);

-- ---------- ORDERS ----------
CREATE TABLE IF NOT EXISTS orders (
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
CREATE TABLE IF NOT EXISTS order_items (
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
CREATE TABLE IF NOT EXISTS project_briefs (
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
CREATE TABLE IF NOT EXISTS project_status_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id VARCHAR(30) REFERENCES orders(id) ON DELETE CASCADE,
  step VARCHAR(50) NOT NULL,   -- salah satu dari STATUS_STEPS di frontend
  note TEXT,
  created_at TIMESTAMP DEFAULT now()
);

-- ---------- REVISIONS ----------
CREATE TABLE IF NOT EXISTS revisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id VARCHAR(30) REFERENCES orders(id) ON DELETE CASCADE,
  note TEXT NOT NULL,
  requested_at TIMESTAMP DEFAULT now(),
  resolved_at TIMESTAMP
);

-- ---------- PAYMENTS (log transaksi dari payment gateway) ----------
CREATE TABLE IF NOT EXISTS payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id VARCHAR(30) REFERENCES orders(id) ON DELETE CASCADE,
  gateway VARCHAR(30),              -- midtrans | xendit | manual
  gateway_ref VARCHAR(150),         -- transaction_id dari gateway
  amount NUMERIC(14,2) NOT NULL,
  status VARCHAR(20) DEFAULT 'pending', -- pending | settlement | expire | cancel
  raw_payload JSONB,
  created_at TIMESTAMP DEFAULT now()
);

-- service_images sudah didefinisikan di bagian foto layanan admin di atas.
ALTER TABLE public.users
    ADD COLUMN IF NOT EXISTS address TEXT,
    ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT 'active',
    ADD COLUMN IF NOT EXISTS avatar_url VARCHAR(500),
    ADD COLUMN IF NOT EXISTS image_url TEXT,
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_orders_user ON orders(user_id);
CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_status_log_order ON project_status_log(order_id);
CREATE INDEX IF NOT EXISTS idx_payments_order ON payments(order_id);


-- ---------- TAMPILAN AKUN TERPISAH (VIEW) ----------
-- Data autentikasi tetap tersimpan satu kali di users agar FK sesi, pesanan,
-- reset password, dan audit tidak terputus. View berikut memudahkan admin/operator
-- melihat akun masing-masing tanpa menduplikasi password/hash.
CREATE OR REPLACE VIEW public.sales_admin_accounts AS
SELECT id, name, email, phone, role, status, created_at
FROM public.users
WHERE role = 'sales_admin';

CREATE OR REPLACE VIEW public.operator_accounts AS
SELECT id, name, email, phone, role, status, created_at
FROM public.users
WHERE role = 'super_user';

-- =========================================================
-- ROLE NORMALIZATION AND LEGACY ADMIN ACCOUNT MIGRATION
-- =========================================================
-- ---------- 2. Role: user | sales_admin | super_user ----------
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_status_check;

-- 'client' (nama lama) -> 'user'. Role tak dikenal diturunkan ke 'user' (least privilege).
UPDATE users SET role = 'user'
 WHERE role IS NULL OR role NOT IN ('user', 'sales_admin', 'super_user');

-- Normalisasi status lama agar constraint tidak gagal pada data yang sudah ada.
UPDATE users SET status = 'active'
 WHERE status IS NULL OR status NOT IN ('active', 'disabled', 'blocked');

ALTER TABLE users ALTER COLUMN role SET DEFAULT 'user';
ALTER TABLE users ADD CONSTRAINT users_role_check   CHECK (role IN ('user', 'sales_admin', 'super_user'));
ALTER TABLE users ADD CONSTRAINT users_status_check CHECK (status IN ('active', 'disabled', 'blocked'));

-- ---------- 3. Pindahkan akun dari tabel admins ke users (role sales_admin) ----------
-- Tabel admins TIDAK dihapus (disimpan sebagai cadangan); kode tidak lagi memakainya.
DO $$
DECLARE moved INT := 0; skipped INT := 0;
BEGIN
  IF to_regclass('public.admins') IS NOT NULL THEN
    WITH ins AS (
      INSERT INTO users (id, name, email, password_hash, role, status, created_at)
      SELECT a.id, a.name, LOWER(a.email), a.password_hash, 'sales_admin', 'active', a.created_at
        FROM admins a
       WHERE NOT EXISTS (SELECT 1 FROM users u WHERE LOWER(u.email) = LOWER(a.email) OR u.id = a.id)
      RETURNING 1
    ) SELECT COUNT(*) INTO moved FROM ins;
    SELECT COUNT(*) INTO skipped FROM admins a
     WHERE NOT EXISTS (SELECT 1 FROM users u WHERE u.id = a.id AND u.role = 'sales_admin');
    RAISE NOTICE 'Akun admin dipindahkan ke users: %, belum terpindah (email bentrok dengan akun pelanggan): %', moved, skipped;
    IF skipped > 0 THEN
      RAISE WARNING 'Ada % admin yang emailnya sama dengan akun pelanggan. Buat ulang dengan: npm run create-staff', skipped;
    END IF;
  END IF;
END $$;

-- =========================================================
-- INDEXES FOR ROLE, STATUS, AND CASE-INSENSITIVE EMAIL
-- =========================================================
-- ---------- 7. Indeks users ----------
CREATE INDEX IF NOT EXISTS idx_users_role   ON users(role);
CREATE INDEX IF NOT EXISTS idx_users_status ON users(status);
DO $$
BEGIN
  -- Email unik tanpa membedakan huruf besar/kecil; dilewati bila data lama masih ada duplikat.
  IF NOT EXISTS (SELECT 1 FROM users GROUP BY LOWER(email) HAVING COUNT(*) > 1) THEN
    CREATE UNIQUE INDEX IF NOT EXISTS uq_users_email_lower ON users (LOWER(email));
  ELSE
    RAISE WARNING 'Ada email duplikat (beda huruf besar/kecil) di users; indeks unik LOWER(email) tidak dibuat.';
  END IF;
END $$;

-- =========================================================
-- VERIFICATION: REQUIRED AUTH TABLES/VIEWS AND ACCOUNT COUNTS
-- =========================================================
-- 3. Verifikasi tabel autentikasi yang wajib tersedia.
SELECT table_name, table_type
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN (
    'users', 'user_sessions', 'activity_logs', 'password_reset_requests',
    'sales_admin_accounts', 'operator_accounts'
  )
ORDER BY table_name;

-- 4. Verifikasi jumlah akun per role (tidak menampilkan password/hash).
SELECT role, status, COUNT(*) AS jumlah
FROM public.users
GROUP BY role, status
ORDER BY role, status;
