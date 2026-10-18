// Padanan django.utils.text.slugify: "Tentang Kami!" -> "tentang-kami"
function slugify(value) {
  return String(value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")   // buang aksen
    .toLowerCase()
    .replace(/[^a-z0-9\s_-]/g, "")     // buang karakter aneh
    .trim()
    .replace(/[\s_-]+/g, "-")          // spasi/underscore -> "-"
    .replace(/^-+|-+$/g, "");
}

module.exports = { slugify };
