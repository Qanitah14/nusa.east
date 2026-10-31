// Category & Product — logika ada di models.js. Baca = publik, ubah = admin.
const express = require("express");
const { requireAuth, requireAdmin } = require("../middleware/auth");
const { uploadImage } = require("../middleware/upload");
const { Category, Product } = require("../models");

const router = express.Router();
const productImage = uploadImage("product_images", "image");
const admin = [requireAuth, requireAdmin];

// Error dari models.js punya .status (400/404/409); selain itu 500.
const run = (fallbackMsg, fn) => async (req, res) => {
  try { res.status(fn.status || 200).json(await fn(req)); }
  catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    console.error(err); res.status(500).json({ error: fallbackMsg });
  }
};
const created = (fn) => Object.assign(fn, { status: 201 });
const ok = { success: true };

// Categories
router.get("/categories", run("Gagal mengambil kategori.", () => Category.all()));
router.post("/categories", ...admin, run("Gagal menambah kategori.", created((req) => Category.create(req.body))));
router.put("/categories/:id", ...admin, run("Gagal memperbarui kategori.", (req) => Category.update(req.params.id, req.body)));
router.delete("/categories/:id", ...admin, run("Gagal menghapus kategori.", async (req) => { await Category.remove(req.params.id); return ok; }));

// Products — multipart/form-data: name, categoryId, price, description, image (file)
router.get("/products", run("Gagal mengambil produk.", (req) => Product.all(req.query.category)));
router.get("/products/:id", run("Gagal mengambil produk.", (req) => Product.find(req.params.id)));
router.post("/products", ...admin, productImage, run("Gagal menambah produk.", created((req) =>
  Product.create({ ...req.body, image: req.file?.publicUrl }))));
router.put("/products/:id", ...admin, productImage, run("Gagal memperbarui produk.", (req) =>
  Product.update(req.params.id, { ...req.body, image: req.file?.publicUrl })));
router.delete("/products/:id", ...admin, run("Gagal menghapus produk.", async (req) => { await Product.remove(req.params.id); return ok; }));

module.exports = router;
