-- =========================================================
-- 005 — RBAC, sesi login, log aktivitas, reset password,
--       foto profil sebagai URL (users.avatar_url)
-- Idempotent: aman dijalankan berulang. Tidak ada DROP TABLE di sini.
-- Dijalankan lewat: npm run migrate   (dalam 1 transaksi)
-- =========================================================

-- ---------- 1. Kolom tambahan pada users ----------
ALTER TABLE users ADD COLUMN IF NOT EXISTS address    TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_url VARCHAR(500);          -- path/URL foto, bukan data gambar
ALTER TABLE users ADD COLUMN IF NOT EXISTS status     VARCHAR(20) NOT NULL DEFAULT 'active';
ALTER TABLE users ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

-- ---------- 2. Role: user | sales_admin | super_user ----------
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_status_check;

-- 'client' (nama lama) -> 'user'. Role tak dikenal diturunkan ke 'user' (least privilege).
UPDATE users SET role = 'user'
 WHERE role IS NULL OR role NOT IN ('user', 'sales_admin', 'super_user');

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

-- ---------- 4. Sesi login (status online + dasar riwayat login/logout) ----------
CREATE TABLE IF NOT EXISTS user_sessions (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),   -- waktu login
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),   -- heartbeat / aktivitas terakhir
  expires_at   TIMESTAMPTZ NOT NULL,
  ended_at     TIMESTAMPTZ,                          -- waktu logout / sesi berakhir
  end_reason   VARCHAR(20) CHECK (end_reason IN ('logout','expired','timeout','revoked','password_reset')),
  ip           VARCHAR(64),
  user_agent   VARCHAR(300)
);
CREATE INDEX IF NOT EXISTS idx_sessions_user   ON user_sessions(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sessions_active ON user_sessions(last_seen_at) WHERE ended_at IS NULL;

-- ---------- 5. Log aktivitas (audit) — terpisah dari status sesi ----------
CREATE TABLE IF NOT EXISTS activity_logs (
  id             BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  actor_id       UUID REFERENCES users(id) ON DELETE SET NULL,
  actor_role     VARCHAR(20),
  action         VARCHAR(50) NOT NULL,
  target_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  detail         JSONB,
  ip             VARCHAR(64),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_activity_created ON activity_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_activity_action  ON activity_logs(action, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_activity_actor   ON activity_logs(actor_id);
CREATE INDEX IF NOT EXISTS idx_activity_target  ON activity_logs(target_user_id);

-- ---------- 6. Permintaan reset password ----------
-- Hanya HASH token yang disimpan. Token asli dilihat satu kali oleh operator saat disetujui.
CREATE TABLE IF NOT EXISTS password_reset_requests (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status            VARCHAR(15) NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending','processing','approved','completed','rejected','expired')),
  source            VARCHAR(10) NOT NULL DEFAULT 'user' CHECK (source IN ('user','operator')),
  identity_verified BOOLEAN NOT NULL DEFAULT false,
  token_hash        CHAR(64),
  token_expires_at  TIMESTAMPTZ,
  token_used_at     TIMESTAMPTZ,
  handled_by        UUID REFERENCES users(id) ON DELETE SET NULL,
  note              TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- Satu pengguna hanya boleh punya satu permintaan terbuka (anti-spam).
CREATE UNIQUE INDEX IF NOT EXISTS uq_reset_open_per_user
  ON password_reset_requests(user_id) WHERE status IN ('pending','processing','approved');
CREATE UNIQUE INDEX IF NOT EXISTS uq_reset_token_hash
  ON password_reset_requests(token_hash) WHERE token_hash IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_reset_status ON password_reset_requests(status, created_at DESC);

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
