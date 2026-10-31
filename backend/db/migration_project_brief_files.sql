-- Jalankan sekali di Neon SQL Editor pada database nusa-east yang dipakai backend.
CREATE TABLE IF NOT EXISTS project_brief_files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id VARCHAR(30) NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  file_name VARCHAR(255) NOT NULL,
  mime_type VARCHAR(100) NOT NULL,
  file_url TEXT NOT NULL,
  cloudinary_public_id TEXT NOT NULL,
  file_size BIGINT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_project_brief_files_order
  ON project_brief_files(order_id);
