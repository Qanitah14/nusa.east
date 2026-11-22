-- Manual bank transfer proof and verification metadata. Additive/idempotent migration.
CREATE TABLE IF NOT EXISTS public.manual_payment_proofs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id VARCHAR(30) NOT NULL UNIQUE REFERENCES public.orders(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  file_name VARCHAR(255) NOT NULL,
  mime_type VARCHAR(30) NOT NULL,
  file_size INTEGER NOT NULL,
  image_data BYTEA NOT NULL,
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  reviewed_at TIMESTAMPTZ,
  reviewed_by UUID REFERENCES public.users(id),
  review_note TEXT,
  review_status VARCHAR(30) NOT NULL DEFAULT 'pending_verification'
    CHECK (review_status IN ('pending_verification','approved','rejected'))
);
CREATE INDEX IF NOT EXISTS idx_manual_proofs_status_date
  ON public.manual_payment_proofs(review_status, submitted_at DESC);
