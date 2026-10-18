// Padanan ImageField(upload_to=...) di Django — simpan file ke backend/uploads/<folder>/
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const multer = require("multer");

const UPLOAD_ROOT = path.join(__dirname, "..", "uploads");
const ALLOWED = { "image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp", "image/gif": ".gif" };

/**
 * uploadImage("product_images", "image") -> middleware Express.
 * File tersimpan di uploads/product_images/, req.file.publicUrl berisi path publik
 * (mis. /uploads/product_images/ab12.jpg) yang disimpan ke kolom image_url.
 */
function uploadImage(folder, fieldName = "image") {
  const dir = path.join(UPLOAD_ROOT, folder);
  fs.mkdirSync(dir, { recursive: true });

  const upload = multer({
    storage: multer.diskStorage({
      destination: dir,
      filename: (req, file, cb) => cb(null, crypto.randomBytes(12).toString("hex") + ALLOWED[file.mimetype])
    }),
    limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB
    fileFilter: (req, file, cb) =>
      ALLOWED[file.mimetype] ? cb(null, true) : cb(new Error("Format gambar harus JPG, PNG, WEBP, atau GIF."))
  }).single(fieldName);

  return (req, res, next) => {
    upload(req, res, (err) => {
      if (err) {
        const msg = err.code === "LIMIT_FILE_SIZE" ? "Ukuran gambar maksimal 5 MB." : err.message;
        return res.status(400).json({ error: msg });
      }
      if (req.file) req.file.publicUrl = `/uploads/${folder}/${req.file.filename}`;
      next();
    });
  };
}

// Hapus file lama dari disk berdasarkan image_url (/uploads/...). Aman dipanggil dengan null.
function removeUploadedFile(publicUrl) {
  if (!publicUrl || !publicUrl.startsWith("/uploads/")) return;
  const full = path.join(UPLOAD_ROOT, publicUrl.replace("/uploads/", ""));
  if (!full.startsWith(UPLOAD_ROOT)) return; // cegah path traversal
  fs.unlink(full, () => {});
}

module.exports = { uploadImage, removeUploadedFile };
