"use strict";
const multer = require("multer");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const uploadRoot = path.join(__dirname, "..", "uploads");
fs.mkdirSync(uploadRoot, { recursive: true });
const allowedMime = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

function uploadImage(folderName, fieldName = "image") {
  const storage = multer.diskStorage({
    destination(req, file, cb) { cb(null, uploadRoot); },
    filename(req, file, cb) {
      const extByMime = { "image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp", "image/gif": ".gif" };
      cb(null, `${folderName}-${Date.now()}-${crypto.randomBytes(6).toString("hex")}${extByMime[file.mimetype] || ""}`);
    }
  });
  return multer({
    storage,
    limits: { fileSize: 5 * 1024 * 1024, files: 1 },
    fileFilter(req, file, cb) {
      if (!allowedMime.has(file.mimetype)) return cb(new Error("Format gambar harus JPG, PNG, WEBP, atau GIF."));
      cb(null, true);
    }
  }).single(fieldName);
}

function removeUploadedFile(publicUrl) {
  if (!publicUrl || typeof publicUrl !== "string") return;
  const filename = path.basename(publicUrl);
  if (!filename || filename === "." || filename === "..") return;
  const target = path.join(uploadRoot, filename);
  if (!target.startsWith(uploadRoot + path.sep)) return;
  fs.unlink(target, (err) => { if (err && err.code !== "ENOENT") console.error("Gagal menghapus file upload:", err.message); });
}
module.exports = { uploadImage, removeUploadedFile };
