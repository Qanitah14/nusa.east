-- =========================================================
-- 006 — Perbaikan kompatibilitas autentikasi produksi
-- Idempotent: aman dijalankan berulang; tidak menghapus data.
-- Tabel users tetap menjadi sumber akun utama untuk menjaga FK sesi/order.
-- sales_admin_accounts dan operator_accounts adalah VIEW pemisah berdasarkan role.
-- =========================================================
CREATE EXTENSION IF NOT EXISTS pgcrypto;

ALTER TABLE public.users ADD COLUMN IF NOT EXISTS phone VARCHAR(30);
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS address TEXT;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS password_hash TEXT;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS role VARCHAR(20) NOT NULL DEFAULT 'user';
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT 'active';
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS avatar_url VARCHAR(500);
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS image_url TEXT;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT now();
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

CREATE TABLE IF NOT EXISTS public.user_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL,
  ended_at TIMESTAMPTZ,
  end_reason VARCHAR(20),
  ip VARCHAR(64),
  user_agent VARCHAR(300)
);
ALTER TABLE public.user_sessions ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now();
ALTER TABLE public.user_sessions ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;
ALTER TABLE public.user_sessions ADD COLUMN IF NOT EXISTS ended_at TIMESTAMPTZ;
ALTER TABLE public.user_sessions ADD COLUMN IF NOT EXISTS end_reason VARCHAR(20);
ALTER TABLE public.user_sessions ADD COLUMN IF NOT EXISTS ip VARCHAR(64);
ALTER TABLE public.user_sessions ADD COLUMN IF NOT EXISTS user_agent VARCHAR(300);
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
ALTER TABLE public.activity_logs ADD COLUMN IF NOT EXISTS actor_id UUID;
ALTER TABLE public.activity_logs ADD COLUMN IF NOT EXISTS actor_role VARCHAR(20);
ALTER TABLE public.activity_logs ADD COLUMN IF NOT EXISTS action VARCHAR(50);
ALTER TABLE public.activity_logs ADD COLUMN IF NOT EXISTS target_user_id UUID;
ALTER TABLE public.activity_logs ADD COLUMN IF NOT EXISTS detail JSONB;
ALTER TABLE public.activity_logs ADD COLUMN IF NOT EXISTS ip VARCHAR(64);
ALTER TABLE public.activity_logs ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT now();
CREATE INDEX IF NOT EXISTS idx_activity_created ON public.activity_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_activity_action ON public.activity_logs(action, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_activity_actor ON public.activity_logs(actor_id);
CREATE INDEX IF NOT EXISTS idx_activity_target ON public.activity_logs(target_user_id);

CREATE TABLE IF NOT EXISTS public.password_reset_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  status VARCHAR(15) NOT NULL DEFAULT 'pending',
  source VARCHAR(10) NOT NULL DEFAULT 'user',
  identity_verified BOOLEAN NOT NULL DEFAULT false,
  token_hash CHAR(64),
  token_expires_at TIMESTAMPTZ,
  token_used_at TIMESTAMPTZ,
  handled_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.password_reset_requests ADD COLUMN IF NOT EXISTS source VARCHAR(10) NOT NULL DEFAULT 'user';
ALTER TABLE public.password_reset_requests ADD COLUMN IF NOT EXISTS identity_verified BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.password_reset_requests ADD COLUMN IF NOT EXISTS token_hash CHAR(64);
ALTER TABLE public.password_reset_requests ADD COLUMN IF NOT EXISTS token_expires_at TIMESTAMPTZ;
ALTER TABLE public.password_reset_requests ADD COLUMN IF NOT EXISTS token_used_at TIMESTAMPTZ;
ALTER TABLE public.password_reset_requests ADD COLUMN IF NOT EXISTS handled_by UUID;
ALTER TABLE public.password_reset_requests ADD COLUMN IF NOT EXISTS note TEXT;
ALTER TABLE public.password_reset_requests ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();
CREATE INDEX IF NOT EXISTS idx_reset_status ON public.password_reset_requests(status, created_at DESC);

-- Views memberi daftar terpisah tanpa menyalin password atau memutus relasi FK.
CREATE OR REPLACE VIEW public.sales_admin_accounts AS
SELECT id, name, email, phone, role, status, created_at
FROM public.users WHERE role = 'sales_admin';

CREATE OR REPLACE VIEW public.operator_accounts AS
SELECT id, name, email, phone, role, status, created_at
FROM public.users WHERE role = 'super_user';
