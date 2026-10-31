-- =========================================================================
-- 006 — PISAHKAN TABEL AKUN  (menggantikan 005_rbac_sessions_reset.sql)
--
--   users      = PELANGGAN              (login: login.html)
--   admins     = ADMIN PENJUALAN        (login: admin/login.html)
--   operators  = OPERATOR / SUPER USER  (login: operator/login.html)
--
-- Aman dijalankan berulang & dari kondisi apa pun (DB lama / sudah 005).
-- Tidak ada tabel yang dihapus; hanya kolom user_id lama (diganti account_id) pada tabel sesi/reset. Satu transaksi.
-- Dijalankan otomatis saat backend start, atau manual: npm run migrate
-- =========================================================================

-- ---------- 1. users (pelanggan) ----------
ALTER TABLE users ADD COLUMN IF NOT EXISTS phone      VARCHAR(30);
ALTER TABLE users ADD COLUMN IF NOT EXISTS address    TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_url VARCHAR(500);   -- path/URL foto, bukan data gambar
ALTER TABLE users ADD COLUMN IF NOT EXISTS status     VARCHAR(20) NOT NULL DEFAULT 'active';
ALTER TABLE users ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();
ALTER TABLE users ADD COLUMN IF NOT EXISTS role       VARCHAR(20) NOT NULL DEFAULT 'user';

-- ---------- 2. admins (Admin Penjualan) — tabel lama dipakai ulang ----------
CREATE TABLE IF NOT EXISTS admins (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          VARCHAR(150) NOT NULL,
  email         VARCHAR(150) NOT NULL,
  password_hash TEXT NOT NULL,
  created_at    TIMESTAMP DEFAULT now()
);
ALTER TABLE admins ADD COLUMN IF NOT EXISTS phone      VARCHAR(30);
ALTER TABLE admins ADD COLUMN IF NOT EXISTS status     VARCHAR(20) NOT NULL DEFAULT 'active';
ALTER TABLE admins ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();
ALTER TABLE admins ADD COLUMN IF NOT EXISTS created_by UUID;           -- id operator yang membuat akun ini

-- ---------- 3. operators (Super User) ----------
CREATE TABLE IF NOT EXISTS operators (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          VARCHAR(150) NOT NULL,
  email         VARCHAR(150) NOT NULL,
  phone         VARCHAR(30),
  password_hash TEXT NOT NULL,
  status        VARCHAR(20) NOT NULL DEFAULT 'active',
  created_by    UUID,
  created_at    TIMESTAMP DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Email unik (tanpa membedakan huruf besar/kecil) di tiap tabel akun
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM admins    GROUP BY LOWER(email) HAVING COUNT(*) > 1) THEN CREATE UNIQUE INDEX IF NOT EXISTS uq_admins_email_lower    ON admins    (LOWER(email)); END IF;
  IF NOT EXISTS (SELECT 1 FROM operators GROUP BY LOWER(email) HAVING COUNT(*) > 1) THEN CREATE UNIQUE INDEX IF NOT EXISTS uq_operators_email_lower ON operators (LOWER(email)); END IF;
  IF NOT EXISTS (SELECT 1 FROM users     GROUP BY LOWER(email) HAVING COUNT(*) > 1) THEN CREATE UNIQUE INDEX IF NOT EXISTS uq_users_email_lower     ON users     (LOWER(email)); END IF;
END $$;

-- ---------- 4. Tabel pendukung (sesi, log, reset) — satu bentuk untuk ketiga jenis akun ----------
CREATE TABLE IF NOT EXISTS user_sessions (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_type VARCHAR(10) NOT NULL DEFAULT 'user',
  account_id   UUID NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at   TIMESTAMPTZ NOT NULL,
  ended_at     TIMESTAMPTZ,
  end_reason   VARCHAR(20),
  ip           VARCHAR(64),
  user_agent   VARCHAR(300)
);
CREATE TABLE IF NOT EXISTS activity_logs (
  id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  actor_id    UUID,
  actor_role  VARCHAR(20),
  action      VARCHAR(50) NOT NULL,
  target_id   UUID,
  target_type VARCHAR(10),
  detail      JSONB,
  ip          VARCHAR(64),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS password_reset_requests (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_type      VARCHAR(10) NOT NULL DEFAULT 'user',
  account_id        UUID NOT NULL,
  status            VARCHAR(15) NOT NULL DEFAULT 'pending',
  source            VARCHAR(10) NOT NULL DEFAULT 'user',
  identity_verified BOOLEAN NOT NULL DEFAULT false,
  token_hash        CHAR(64),
  token_expires_at  TIMESTAMPTZ,
  token_used_at     TIMESTAMPTZ,
  handled_by        UUID,
  note              TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------- 5. Ubah tabel hasil 005 (bila sudah pernah dijalankan) ke bentuk polimorfik ----------
DO $$
DECLARE c RECORD;
BEGIN
  -- user_sessions: user_id -> account_id (+ account_type), lepas FK ke users
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='user_sessions' AND column_name='user_id') THEN
    FOR c IN SELECT conname FROM pg_constraint WHERE conrelid='user_sessions'::regclass AND contype='f' LOOP
      EXECUTE format('ALTER TABLE user_sessions DROP CONSTRAINT %I', c.conname);
    END LOOP;
    UPDATE user_sessions s SET account_type = CASE u.role WHEN 'super_user' THEN 'operator' WHEN 'sales_admin' THEN 'admin' ELSE 'user' END
      FROM users u WHERE u.id = s.user_id;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='user_sessions' AND column_name='account_id') THEN
      UPDATE user_sessions SET account_id = user_id WHERE user_id IS NOT NULL;
      ALTER TABLE user_sessions DROP COLUMN user_id;
    ELSE
      ALTER TABLE user_sessions RENAME COLUMN user_id TO account_id;
    END IF;
  END IF;

  -- activity_logs: target_user_id -> target_id (+ target_type), lepas FK
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='activity_logs' AND column_name='target_user_id') THEN
    FOR c IN SELECT conname FROM pg_constraint WHERE conrelid='activity_logs'::regclass AND contype='f' LOOP
      EXECUTE format('ALTER TABLE activity_logs DROP CONSTRAINT %I', c.conname);
    END LOOP;
    ALTER TABLE activity_logs RENAME COLUMN target_user_id TO target_id;
    ALTER TABLE activity_logs ADD COLUMN IF NOT EXISTS target_type VARCHAR(10);
    UPDATE activity_logs l SET target_type = CASE u.role WHEN 'super_user' THEN 'operator' WHEN 'sales_admin' THEN 'admin' ELSE 'user' END
      FROM users u WHERE u.id = l.target_id AND l.target_type IS NULL;
  END IF;

  -- password_reset_requests: user_id -> account_id (+ account_type), lepas FK
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='password_reset_requests' AND column_name='user_id') THEN
    FOR c IN SELECT conname FROM pg_constraint WHERE conrelid='password_reset_requests'::regclass AND contype='f' LOOP
      EXECUTE format('ALTER TABLE password_reset_requests DROP CONSTRAINT %I', c.conname);
    END LOOP;
    UPDATE password_reset_requests r SET account_type = CASE u.role WHEN 'super_user' THEN 'operator' WHEN 'sales_admin' THEN 'admin' ELSE 'user' END
      FROM users u WHERE u.id = r.user_id;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='password_reset_requests' AND column_name='account_id') THEN
      UPDATE password_reset_requests SET account_id = user_id WHERE user_id IS NOT NULL;
      ALTER TABLE password_reset_requests DROP COLUMN user_id;
    ELSE
      ALTER TABLE password_reset_requests RENAME COLUMN user_id TO account_id;
    END IF;
  END IF;
END $$;

-- Aturan nilai (dibuat ulang agar sesuai bentuk baru)
ALTER TABLE user_sessions DROP CONSTRAINT IF EXISTS user_sessions_end_reason_check;
ALTER TABLE user_sessions ADD  CONSTRAINT user_sessions_end_reason_check CHECK (end_reason IN ('logout','expired','timeout','revoked','password_reset'));
ALTER TABLE user_sessions DROP CONSTRAINT IF EXISTS user_sessions_account_type_check;
ALTER TABLE user_sessions ADD  CONSTRAINT user_sessions_account_type_check CHECK (account_type IN ('user','admin','operator'));
ALTER TABLE password_reset_requests DROP CONSTRAINT IF EXISTS password_reset_requests_status_check;
ALTER TABLE password_reset_requests ADD  CONSTRAINT password_reset_requests_status_check CHECK (status IN ('pending','processing','approved','completed','rejected','expired'));
ALTER TABLE password_reset_requests DROP CONSTRAINT IF EXISTS password_reset_requests_source_check;
ALTER TABLE password_reset_requests ADD  CONSTRAINT password_reset_requests_source_check CHECK (source IN ('user','operator'));
ALTER TABLE password_reset_requests DROP CONSTRAINT IF EXISTS password_reset_requests_account_type_check;
ALTER TABLE password_reset_requests ADD  CONSTRAINT password_reset_requests_account_type_check CHECK (account_type IN ('user','admin','operator'));

-- ---------- 6. Pindahkan akun staf yang sebelumnya ada di users (hasil 005) ----------
-- Operator: users.role = 'super_user'
INSERT INTO operators (id, name, email, phone, password_hash, status, created_at)
SELECT u.id, u.name, LOWER(u.email), u.phone, u.password_hash, u.status, u.created_at
  FROM users u
 WHERE u.role = 'super_user'
   AND NOT EXISTS (SELECT 1 FROM operators o WHERE o.id = u.id OR LOWER(o.email) = LOWER(u.email));
-- Admin Penjualan: users.role = 'sales_admin' / 'admin' / 'staff'
INSERT INTO admins (id, name, email, phone, password_hash, status, created_at)
SELECT u.id, u.name, LOWER(u.email), u.phone, u.password_hash, u.status, u.created_at
  FROM users u
 WHERE u.role IN ('sales_admin', 'admin', 'staff')
   AND NOT EXISTS (SELECT 1 FROM admins a WHERE a.id = u.id OR LOWER(a.email) = LOWER(u.email));
-- Bila akun sudah ada di admins (salinan lama) & id sama, ambil versi terbaru dari users (password mungkin sudah diganti)
UPDATE admins a SET password_hash = u.password_hash, name = u.name, status = u.status, updated_at = now()
  FROM users u WHERE u.id = a.id AND u.role IN ('sales_admin', 'admin', 'staff');

-- Hapus dari users HANYA yang sudah terbukti ada di tabel tujuan (id sama). Bila masih dirujuk data lain
-- (mis. pesanan), barisnya dibiarkan dan diberi peringatan — tidak ada yang dihapus paksa.
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN SELECT u.id FROM users u
            WHERE (u.role = 'super_user' AND EXISTS (SELECT 1 FROM operators o WHERE o.id = u.id))
               OR (u.role IN ('sales_admin','admin','staff') AND EXISTS (SELECT 1 FROM admins a WHERE a.id = u.id))
  LOOP
    BEGIN
      DELETE FROM users WHERE id = r.id;
    EXCEPTION WHEN foreign_key_violation THEN
      RAISE WARNING 'Akun staf % masih dirujuk data lain di users; baris lama dipertahankan.', r.id;
    END;
  END LOOP;
END $$;

DO $$
DECLARE left_over INT;
BEGIN
  SELECT COUNT(*) INTO left_over FROM users WHERE role <> 'user';
  IF left_over > 0 THEN
    RAISE WARNING '% akun staf belum dapat dipindahkan dari tabel users (email bentrok). Mereka tidak bisa login; buat ulang dengan: npm run create-staff', left_over;
  END IF;
  -- role tak dikenal pada pelanggan -> user
  UPDATE users SET role = 'user' WHERE role IS NULL OR role NOT IN ('user','sales_admin','admin','staff','super_user');
END $$;

-- ---------- 7. Constraint & indeks ----------
UPDATE users     SET status = 'disabled' WHERE status = 'inactive';
UPDATE admins    SET status = 'disabled' WHERE status = 'inactive';
UPDATE operators SET status = 'disabled' WHERE status = 'inactive';
ALTER TABLE users     DROP CONSTRAINT IF EXISTS users_status_check;
ALTER TABLE users     ADD  CONSTRAINT users_status_check     CHECK (status IN ('active','disabled','blocked'));
ALTER TABLE admins    DROP CONSTRAINT IF EXISTS admins_status_check;
ALTER TABLE admins    ADD  CONSTRAINT admins_status_check    CHECK (status IN ('active','disabled','blocked'));
ALTER TABLE operators DROP CONSTRAINT IF EXISTS operators_status_check;
ALTER TABLE operators ADD  CONSTRAINT operators_status_check CHECK (status IN ('active','disabled','blocked'));
ALTER TABLE users     DROP CONSTRAINT IF EXISTS users_role_check;    -- role di users tidak lagi menentukan hak akses

CREATE INDEX IF NOT EXISTS idx_sessions_account ON user_sessions(account_type, account_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sessions_active  ON user_sessions(last_seen_at) WHERE ended_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_activity_created ON activity_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_activity_action  ON activity_logs(action, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_activity_actor   ON activity_logs(actor_id);
CREATE INDEX IF NOT EXISTS idx_activity_target  ON activity_logs(target_id);
DROP INDEX IF EXISTS uq_reset_open_per_user;
CREATE UNIQUE INDEX IF NOT EXISTS uq_reset_open_per_account ON password_reset_requests(account_id) WHERE status IN ('pending','processing','approved');
CREATE UNIQUE INDEX IF NOT EXISTS uq_reset_token_hash       ON password_reset_requests(token_hash) WHERE token_hash IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_reset_status ON password_reset_requests(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_users_status ON users(status);

-- ---------- 8. Kolom pesanan yang dipakai backend (snapshot kontak pelanggan) ----------
ALTER TABLE orders ADD COLUMN IF NOT EXISTS customer_name VARCHAR(100);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS phone_number  VARCHAR(20);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS address       TEXT;

-- ---------- 9. View gabungan untuk dashboard Operator (hanya-baca) ----------
CREATE OR REPLACE VIEW all_accounts AS
  SELECT 'user'::varchar(10) AS account_type, 'user'::varchar(20) AS role, id, name, email, phone, address, avatar_url, status, created_at::timestamptz AS created_at, updated_at FROM users WHERE role = 'user'
  UNION ALL
  SELECT 'admin', 'sales_admin', id, name, email, phone, NULL::text, NULL::varchar(500), status, created_at::timestamptz, updated_at FROM admins
  UNION ALL
  SELECT 'operator', 'super_user', id, name, email, phone, NULL::text, NULL::varchar(500), status, created_at::timestamptz, updated_at FROM operators;

-- ---------- 10. Keterangan tabel (terlihat di pgAdmin/DBeaver) ----------
COMMENT ON TABLE users     IS 'PELANGGAN website. Login lewat login.html. Satu-satunya tabel yang diisi lewat registrasi publik.';
COMMENT ON TABLE admins    IS 'ADMIN PENJUALAN (role sales_admin). Dibuat oleh Operator / npm run create-staff. Tidak ada registrasi publik.';
COMMENT ON TABLE operators IS 'OPERATOR / SUPER USER (role super_user). Dibuat lewat npm run create-staff atau oleh Operator lain.';
COMMENT ON TABLE user_sessions IS 'Sesi login semua jenis akun (account_type = user | admin | operator). Dasar status Online & riwayat login/logout.';
COMMENT ON TABLE activity_logs IS 'Log audit: login, logout, perubahan akun, reset password, dll. actor_id/target_id merujuk ke id di users/admins/operators.';
COMMENT ON TABLE password_reset_requests IS 'Permintaan reset password. Hanya hash token yang disimpan.';
COMMENT ON VIEW  all_accounts IS 'Gabungan users + admins + operators (hanya baca) untuk dashboard Operator.';
