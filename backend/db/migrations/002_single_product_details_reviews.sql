-- Product detail fields and persistent customer reviews for single services. Safe to rerun.
ALTER TABLE single_services ADD COLUMN IF NOT EXISTS image_url TEXT;
ALTER TABLE single_services ADD COLUMN IF NOT EXISTS description TEXT NOT NULL DEFAULT '';

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
