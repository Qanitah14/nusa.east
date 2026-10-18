-- =========================================================
-- NUSA EAST — MIGRASI 002: Category, Product, Page + penyesuaian Order
-- Padanan dari model Django: Category, Product, Order, OrderItem, Customer, Page
--
-- Jalankan SETELAH schema.sql (aman dijalankan berulang, semua pakai IF NOT EXISTS):
--   psql -U postgres -d nusaeast -f db/migrations/002_catalog_and_pages.sql
--
-- Pemetaan Django -> tabel yang SUDAH ada di schema.sql:
--   Customer   -> tabel `users` (kolom `address` ditambahkan, email sudah UNIQUE)
--   Order      -> tabel `orders` (total_price = kolom `total`; ditambah customer_name,
--                 phone_number, address)
--   OrderItem  -> tabel `order_items` (quantity = `qty`, subtotal = `line_total`;
--                 ditambah `product_id` yang menunjuk ke products)
--   Order.products (ManyToMany through OrderItem) -> cukup JOIN order_items -> products
-- =========================================================

-- ---------- CATEGORIES ----------
CREATE TABLE IF NOT EXISTS categories (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  description TEXT NOT NULL DEFAULT ''
);

-- ---------- PRODUCTS ----------
CREATE TABLE IF NOT EXISTS products (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name VARCHAR(200) NOT NULL,
  category_id BIGINT NOT NULL REFERENCES categories(id) ON DELETE RESTRICT,
  price NUMERIC(14,2) NOT NULL CHECK (price >= 0),
  description TEXT NOT NULL DEFAULT '',
  image_url VARCHAR(500)               -- path file hasil upload, mis. /uploads/product_images/xxx.jpg
);

-- ---------- PAGES (halaman konten statis / CMS ringan) ----------
CREATE TABLE IF NOT EXISTS pages (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  title VARCHAR(100) NOT NULL,
  content TEXT NOT NULL,
  image_url VARCHAR(500),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  slug VARCHAR(255) NOT NULL UNIQUE,
  is_published BOOLEAN NOT NULL DEFAULT false
);

-- ---------- PENYESUAIAN TABEL YANG SUDAH ADA ----------
-- Customer.address
ALTER TABLE users ADD COLUMN IF NOT EXISTS address TEXT;

-- Order.customer_name / phone_number / address (snapshot data pembeli saat order dibuat)
ALTER TABLE orders ADD COLUMN IF NOT EXISTS customer_name VARCHAR(100);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS phone_number VARCHAR(20);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS address TEXT;

-- OrderItem.product — SET NULL (bukan CASCADE) supaya riwayat pesanan tidak ikut
-- terhapus kalau produk dihapus; nama & harga tetap tersimpan di order_items.
ALTER TABLE order_items
  ADD COLUMN IF NOT EXISTS product_id BIGINT REFERENCES products(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_products_category ON products(category_id);
CREATE INDEX IF NOT EXISTS idx_order_items_product ON order_items(product_id);
CREATE INDEX IF NOT EXISTS idx_pages_published ON pages(is_published);
