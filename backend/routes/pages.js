// Page — logika ada di models.js. Publik hanya melihat yang is_published; ubah = admin.
const express = require("express");
const { requireAuth, requireAdmin } = require("../middleware/auth");
const { uploadImage } = require("../middleware/upload");
const { Page } = require("../models");

const router = express.Router();
const pageImage = uploadImage("page_images", "image");
const admin = [requireAuth, requireAdmin];
const toBool = (v) => v === true || v === "true" || v === "1" || v === "on";
const body = (req) => ({
  ...req.body, image: req.file?.publicUrl,
  isPublished: req.body.isPublished === undefined ? undefined : toBool(req.body.isPublished)
});

const run = (fallbackMsg, fn, status = 200) => async (req, res) => {
  try { res.status(status).json(await fn(req)); }
  catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    console.error(err); res.status(500).json({ error: fallbackMsg });
  }
};

router.get("/", run("Gagal mengambil halaman.", () => Page.all()));
router.get("/admin/all", ...admin, run("Gagal mengambil halaman.", () => Page.all({ publishedOnly: false }))); // sebelum /:slug
router.get("/:slug", run("Gagal mengambil halaman.", (req) => Page.findBySlug(req.params.slug)));

// multipart/form-data: title, content, slug (opsional), isPublished, image (file)
router.post("/", ...admin, pageImage, run("Gagal membuat halaman.", (req) => Page.create(body(req)), 201));
router.put("/:id", ...admin, pageImage, run("Gagal memperbarui halaman.", (req) => Page.update(req.params.id, body(req))));
router.delete("/:id", ...admin, run("Gagal menghapus halaman.", async (req) => { await Page.remove(req.params.id); return { success: true }; }));

module.exports = router;
