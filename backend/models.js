
const pool = require("./db/pool");
const { removeUploadedFile } = require("./middleware/upload");

/* ---------------------- util ---------------------- */
class ModelError extends Error {
  constructor(message, status = 400) { super(message); this.status = status; }
}
const isId = (v) => /^\d+$/.test(String(v));
const parsePrice = (v) => (v !== undefined && v !== null && v !== "" && Number.isFinite(Number(v)) && Number(v) >= 0 ? Number(v) : null);

// Padanan django.utils.text.slugify: "Tentang Kami!" -> "tentang-kami"
function slugify(value) {
  return String(value || "")
    .normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().replace(/[^a-z0-9\s_-]/g, "").trim()
    .replace(/[\s_-]+/g, "-").replace(/^-+|-+$/g, "");
}

/* ---------------------- skema tabel ---------------------- */
const SCHEMA = `
CREATE TABLE IF NOT EXISTS categories (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  description TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS products (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name VARCHAR(200) NOT NULL,
  category_id BIGINT NOT NULL REFERENCES categories(id) ON DELETE RESTRICT,
  price NUMERIC(14,2) NOT NULL CHECK (price >= 0),
  description TEXT NOT NULL DEFAULT '',
  image_url VARCHAR(500)
);

CREATE TABLE IF NOT EXISTS pages (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  title VARCHAR(100) NOT NULL,
  content TEXT NOT NULL,
  image_url VARCHAR(500),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  slug VARCHAR(255) NOT NULL UNIQUE,
  is_published BOOLEAN NOT NULL DEFAULT false
);

ALTER TABLE users ADD COLUMN IF NOT EXISTS address TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS customer_name VARCHAR(100);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS phone_number VARCHAR(20);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS address TEXT;
-- SET NULL (bukan CASCADE): menghapus produk tidak menghapus riwayat pesanan
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS product_id BIGINT REFERENCES products(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_products_category ON products(category_id);
CREATE INDEX IF NOT EXISTS idx_order_items_product ON order_items(product_id);
CREATE INDEX IF NOT EXISTS idx_pages_published ON pages(is_published);
`;
const migrate = () => pool.query(SCHEMA);

/* ======================= Category ======================= */
const Category = {
  async all() {
    return (await pool.query("SELECT id, name, description FROM categories ORDER BY name ASC")).rows;
  },
  async create({ name, description = "" }) {
    if (!name || name.length > 100) throw new ModelError("Nama kategori wajib diisi (maks 100 karakter).");
    const r = await pool.query("INSERT INTO categories (name, description) VALUES ($1,$2) RETURNING id, name, description", [name, description]);
    return r.rows[0];
  },
  async update(id, { name, description }) {
    if (!isId(id)) throw new ModelError("ID tidak valid.");
    if (name !== undefined && (!name || name.length > 100)) throw new ModelError("Nama kategori tidak valid.");
    const r = await pool.query(
      `UPDATE categories SET name = COALESCE($1, name), description = COALESCE($2, description)
       WHERE id = $3 RETURNING id, name, description`, [name ?? null, description ?? null, id]);
    if (!r.rows[0]) throw new ModelError("Kategori tidak ditemukan.", 404);
    return r.rows[0];
  },
  async remove(id) {
    if (!isId(id)) throw new ModelError("ID tidak valid.");
    let r;
    try { r = await pool.query("DELETE FROM categories WHERE id = $1", [id]); }
    catch (e) {
      if (e.code === "23503") throw new ModelError("Kategori masih dipakai produk. Pindahkan/hapus produknya dulu.", 409);
      throw e;
    }
    if (!r.rowCount) throw new ModelError("Kategori tidak ditemukan.", 404);
  }
};

/* ======================= Product ======================= */
const PRODUCT_SELECT = "SELECT p.*, c.name AS category_name FROM products p JOIN categories c ON c.id = p.category_id";
const toProduct = (r) => ({
  id: r.id, name: r.name, categoryId: r.category_id, categoryName: r.category_name,
  price: Number(r.price), description: r.description, image: r.image_url
});

const Product = {
  async all(categoryId) {
    if (categoryId !== undefined && !isId(categoryId)) throw new ModelError("Filter kategori tidak valid.");
    const r = await pool.query(`${PRODUCT_SELECT} WHERE ($1::bigint IS NULL OR p.category_id = $1) ORDER BY p.id DESC`, [categoryId ?? null]);
    return r.rows.map(toProduct);
  },
  async find(id) {
    if (!isId(id)) throw new ModelError("ID tidak valid.");
    const r = await pool.query(`${PRODUCT_SELECT} WHERE p.id = $1`, [id]);
    if (!r.rows[0]) throw new ModelError("Produk tidak ditemukan.", 404);
    return toProduct(r.rows[0]);
  },
  // image = path hasil upload (req.file.publicUrl). Kalau gagal, file upload ikut dihapus.
  async create({ name, categoryId, price, description = "", image = null }) {
    try {
      const p = parsePrice(price);
      if (!name || name.length > 200) throw new ModelError("Nama produk wajib diisi (maks 200 karakter).");
      if (!isId(categoryId)) throw new ModelError("Kategori wajib dipilih.");
      if (p === null) throw new ModelError("Harga tidak valid.");
      const r = await pool.query(
        "INSERT INTO products (name, category_id, price, description, image_url) VALUES ($1,$2,$3,$4,$5) RETURNING id",
        [name, categoryId, p, description, image]);
      return await Product.find(r.rows[0].id);
    } catch (e) {
      removeUploadedFile(image);
      if (e.code === "23503") throw new ModelError("Kategori tidak ditemukan.");
      throw e;
    }
  },
  async update(id, f) {
    try {
      if (!isId(id)) throw new ModelError("ID tidak valid.");
      const cur = (await pool.query("SELECT * FROM products WHERE id = $1", [id])).rows[0];
      if (!cur) throw new ModelError("Produk tidak ditemukan.", 404);
      const name = f.name ?? cur.name;
      const categoryId = f.categoryId ?? cur.category_id;
      const price = f.price !== undefined ? parsePrice(f.price) : Number(cur.price);
      const description = f.description ?? cur.description;
      if (!name || name.length > 200) throw new ModelError("Nama produk tidak valid.");
      if (!isId(categoryId)) throw new ModelError("Kategori tidak valid.");
      if (price === null) throw new ModelError("Harga tidak valid.");
      await pool.query(
        "UPDATE products SET name=$1, category_id=$2, price=$3, description=$4, image_url=$5 WHERE id=$6",
        [name, categoryId, price, description, f.image || cur.image_url, id]);
      if (f.image) removeUploadedFile(cur.image_url);
      return await Product.find(id);
    } catch (e) {
      removeUploadedFile(f.image);
      if (e.code === "23503") throw new ModelError("Kategori tidak ditemukan.");
      throw e;
    }
  },
  async remove(id) {
    if (!isId(id)) throw new ModelError("ID tidak valid.");
    const r = await pool.query("DELETE FROM products WHERE id = $1 RETURNING image_url", [id]);
    if (!r.rows[0]) throw new ModelError("Produk tidak ditemukan.", 404);
    removeUploadedFile(r.rows[0].image_url);
  }
};

/* ======================= Customer (tabel users) ======================= */
const Customer = {
  async find(id) {
    const r = await pool.query("SELECT id, name, email, phone, address FROM users WHERE id = $1", [id]);
    if (!r.rows[0]) throw new ModelError("Customer tidak ditemukan.", 404);
    return r.rows[0];
  },
  async update(id, { name, phone, address }) {
    const r = await pool.query(
      `UPDATE users SET name = COALESCE($1, name), phone = COALESCE($2, phone), address = COALESCE($3, address)
       WHERE id = $4 RETURNING id, name, email, phone, address`, [name ?? null, phone ?? null, address ?? null, id]);
    if (!r.rows[0]) throw new ModelError("Customer tidak ditemukan.", 404);
    return r.rows[0];
  }
};

/* ======================= Order & OrderItem =======================
   Dipakai di dalam transaksi: kirim `client` dari pool.connect().
   Order.products (ManyToMany through OrderItem) = JOIN order_items -> products. */
const Order = {
  async create(client, { id, userId, total, paymentMethod, customerName = null, phoneNumber = null, address = null }) {
    await client.query(
      `INSERT INTO orders (id, user_id, total, payment_method, payment_status, status, customer_name, phone_number, address)
       VALUES ($1, $2, $3, $4, 'paid', 'Pembayaran Berhasil', $5, $6, $7)`,
      [id, userId, total, paymentMethod, customerName, phoneNumber, address]);
  }
};

const OrderItem = {
  // Padanan OrderItem.save(): item bertipe "product" -> harga dari database,
  // subtotal = harga x quantity. Item lain (paket/satuan) memakai data yang dikirim.
  async create(client, orderId, item) {
    let { name, price, lineTotal } = item;
    const qty = Math.max(1, Math.floor(Number(item.qty) || 1));
    let productId = null;
    if (item.type === "product") {
      if (!isId(item.id)) throw new ModelError("ID produk tidak valid.");
      const p = (await client.query("SELECT id, name, price FROM products WHERE id = $1", [item.id])).rows[0];
      if (!p) throw new ModelError("Produk tidak ditemukan.");
      productId = p.id; name = p.name; price = Number(p.price); lineTotal = price * qty;
    }
    await client.query(
      `INSERT INTO order_items (order_id, item_type, item_ref_id, name, price, qty, line_total, product_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [orderId, item.type, item.id, name, price, qty, lineTotal, productId]);
  }
};

/* ======================= Page ======================= */
const toPage = (r) => ({
  id: r.id, title: r.title, content: r.content, image: r.image_url,
  created: r.created_at, slug: r.slug, isPublished: r.is_published
});

// Slug harus unik — kalau sudah dipakai, tambahkan -2, -3, dst.
async function uniqueSlug(base, excludeId = null) {
  let slug = base, n = 2;
  for (;;) {
    const r = await pool.query("SELECT 1 FROM pages WHERE slug = $1 AND ($2::bigint IS NULL OR id <> $2)", [slug, excludeId]);
    if (!r.rowCount) return slug;
    slug = `${base}-${n++}`;
  }
}

const Page = {
  async all({ publishedOnly = true } = {}) {
    const r = await pool.query(`SELECT * FROM pages ${publishedOnly ? "WHERE is_published = true" : ""} ORDER BY created_at DESC`);
    return r.rows.map(toPage);
  },
  async findBySlug(slug) {
    const r = await pool.query("SELECT * FROM pages WHERE slug = $1 AND is_published = true", [slug]);
    if (!r.rows[0]) throw new ModelError("Halaman tidak ditemukan.", 404);
    return toPage(r.rows[0]);
  },
  // slug kosong -> otomatis dari title (seperti Page.save() di Django)
  async create({ title, content, slug, isPublished = false, image = null }) {
    try {
      if (!title || title.length > 100) throw new ModelError("Judul wajib diisi (maks 100 karakter).");
      if (!content) throw new ModelError("Konten wajib diisi.");
      const base = slugify(slug || title);
      if (!base) throw new ModelError("Slug tidak valid. Gunakan huruf atau angka.");
      const r = await pool.query(
        "INSERT INTO pages (title, content, image_url, slug, is_published) VALUES ($1,$2,$3,$4,$5) RETURNING *",
        [title, content, image, await uniqueSlug(base), isPublished]);
      return toPage(r.rows[0]);
    } catch (e) {
      removeUploadedFile(image);
      if (e.code === "23505") throw new ModelError("Slug sudah dipakai, coba lagi.", 409);
      throw e;
    }
  },
  async update(id, f) {
    try {
      if (!isId(id)) throw new ModelError("ID tidak valid.");
      const cur = (await pool.query("SELECT * FROM pages WHERE id = $1", [id])).rows[0];
      if (!cur) throw new ModelError("Halaman tidak ditemukan.", 404);
      const title = f.title ?? cur.title;
      const content = f.content ?? cur.content;
      if (!title || title.length > 100) throw new ModelError("Judul tidak valid.");
      if (!content) throw new ModelError("Konten tidak boleh kosong.");
      let slug = cur.slug;
      if (f.slug) {
        const base = slugify(f.slug);
        if (!base) throw new ModelError("Slug tidak valid.");
        slug = await uniqueSlug(base, cur.id);
      }
      const isPublished = f.isPublished !== undefined ? f.isPublished : cur.is_published;
      const r = await pool.query(
        "UPDATE pages SET title=$1, content=$2, image_url=$3, slug=$4, is_published=$5 WHERE id=$6 RETURNING *",
        [title, content, f.image || cur.image_url, slug, isPublished, cur.id]);
      if (f.image) removeUploadedFile(cur.image_url);
      return toPage(r.rows[0]);
    } catch (e) {
      removeUploadedFile(f.image);
      if (e.code === "23505") throw new ModelError("Slug sudah dipakai, coba lagi.", 409);
      throw e;
    }
  },
  async remove(id) {
    if (!isId(id)) throw new ModelError("ID tidak valid.");
    const r = await pool.query("DELETE FROM pages WHERE id = $1 RETURNING image_url", [id]);
    if (!r.rows[0]) throw new ModelError("Halaman tidak ditemukan.", 404);
    removeUploadedFile(r.rows[0].image_url);
  }
};

module.exports = { ModelError, slugify, migrate, Category, Product, Customer, Order, OrderItem, Page };

// `node models.js` => jalankan migrasi
if (require.main === module) {
  migrate()
    .then(() => { console.log("Migrasi selesai."); return pool.end(); })
    .catch((err) => { console.error("Migrasi gagal:", err.message); process.exit(1); });
}
