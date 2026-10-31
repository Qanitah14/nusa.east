/* =========================================================
   NUSA EAST — DATA SOURCE
   Semua harga, paket, layanan satuan, dan add-on didefinisikan
   di sini SEKALI SAJA. Semua halaman (packages, singles, addon,
   cart, checkout) mengambil data dari file ini supaya konsisten
   dan mudah diubah tanpa harus edit banyak file.
   ========================================================= */

const NUSAEAST_DATA = {

  /* ---------- 4 LAYANAN UTAMA ---------- */
  services: [
    {
      id: "smm",
      name: "Social Media Management",
      tag: "01 / SOCIAL",
      type: "subscription", // per bulan
      short: "Content planning, trend research, scheduling, monitoring, dan laporan evaluasi.",
      icon: "📱"
    },
    {
      id: "content",
      name: "Content Creation",
      tag: "02 / CONTENT",
      type: "project", // per project, ada deadline
      short: "Foto produk, video OOTD, lookbook, Reels, dan short-form content.",
      icon: "🎬"
    },
    {
      id: "ecommerce",
      name: "E-Commerce Optimization",
      tag: "03 / COMMERCE",
      type: "project",
      short: "Setup dan optimasi Shopee, TikTok Shop, serta website toko.",
      icon: "🛍️"
    },
    {
      id: "brand",
      name: "Brand Development",
      tag: "04 / BRAND",
      type: "project",
      short: "Brand Style Matcher, color palette, typography, hingga brand guideline.",
      icon: "🎨"
    }
  ],

  /* ---------- PAKET LENGKAP (per layanan, tier berbeda) ---------- */
 packages: {
    smm: {
      durationLabel: "Estimasi Pengerjaan per Project",
      tiers: [
        {
          id: "smm-basic", name: "Kenal", price: 750000, eta: "5–7 hari kerja",
          rows: { "Feed Content": "8", "Reels": "2", "Story": "4",
            "Content Planning": true, "Copywriting & Caption": true, "Hashtag Research": true,
            "Scheduling Posting": true, "Monthly Report": false, "Competitor Analysis": false,
            "Consultation": "1x", "Revisi": "1x/konten" },
          fit: "Cocok untuk UMKM yang baru mulai aktif di media sosial."
        },
        {
          id: "smm-growth", name: "Dekat", price: 1500000, highlight: true, eta: "7–10 hari kerja",
          rows: { "Feed Content": "12", "Reels": "4", "Story": "8",
            "Content Planning": true, "Copywriting & Caption": true, "Hashtag Research": true,
            "Scheduling Posting": true, "Monthly Report": true, "Competitor Analysis": false,
            "Consultation": "2x", "Revisi": "2x/konten" },
          fit: "Cocok untuk brand yang ingin meningkatkan engagement."
        },
        {
          id: "smm-premium", name: "Melekat", price: 2750000, eta: "10–14 hari kerja",
          rows: { "Feed Content": "16", "Reels": "6", "Story": "12",
            "Content Planning": true, "Copywriting & Caption": true, "Hashtag Research": true,
            "Scheduling Posting": true, "Monthly Report": true, "Competitor Analysis": true,
            "Consultation": "4x", "Revisi": "3x/konten" },
          fit: "Cocok untuk brand yang butuh pengelolaan lebih intensif."
        }
      ]
    },
    content: {
      durationLabel: "Estimasi Pengerjaan (bukan langganan bulanan)",
      tiers: [
        {
          id: "content-starter", name: "Kenal", price: 750000, eta: "5–7 hari kerja",
          rows: { "Foto Produk": "10 foto", "Video/Reels": "1", "Konsep Konten": "Sederhana",
            "Editing Foto": true, "Editing Video": true, "Copywriting": false, "Moodboard": false,
            "Campaign Concept": false, "Revisi": "1x" },
          fit: "Cocok untuk kebutuhan konten cepat & sederhana."
        },
        {
          id: "content-boost", name: "Dekat", price: 1500000, highlight: true, eta: "7–10 hari kerja",
          rows: { "Foto Produk": "20 foto", "Video/Reels": "3", "Konsep Konten": "✓",
            "Editing Foto": true, "Editing Video": true, "Copywriting": true, "Moodboard": true,
            "Campaign Concept": false, "Revisi": "2x" },
          fit: "Cocok untuk brand fashion/handmade dengan koleksi baru."
        },
        {
          id: "content-campaign", name: "Melekat", price: 2750000, eta: "10–14 hari kerja",
          rows: { "Foto Produk": "30 foto", "Video/Reels": "5", "Konsep Konten": "✓",
            "Editing Foto": true, "Editing Video": true, "Copywriting": true, "Moodboard": true,
            "Campaign Concept": true, "Revisi": "3x" },
          fit: "Cocok untuk peluncuran kampanye besar."
        }
      ]
    },
    ecommerce: {
      durationLabel: "Estimasi Pengerjaan per Project",
      tiers: [
        {
          id: "ecom-setup", name: "Kenal", price: 800000, eta: "5–7 hari kerja",
          rows: { "Upload/Optimasi Produk": "10", "Judul Produk": true, "Deskripsi Produk": true,
            "Kategori Produk": true, "Optimasi Foto/Katalog": false, "Keyword Produk": false,
            "Banner Toko": "–", "Analisis Kompetitor": false, "Rekomendasi Promo": false,
            "Evaluasi Toko": false },
          fit: "Cocok untuk toko yang baru mulai berjualan online."
        },
        {
          id: "ecom-optimize", name: "Dekat", price: 1500000, highlight: true, eta: "7–10 hari kerja",
          rows: { "Upload/Optimasi Produk": "20", "Judul Produk": true, "Deskripsi Produk": true,
            "Kategori Produk": true, "Optimasi Foto/Katalog": true, "Keyword Produk": true,
            "Banner Toko": "1", "Analisis Kompetitor": false, "Rekomendasi Promo": true,
            "Evaluasi Toko": false },
          fit: "Cocok untuk toko yang ingin naik performa penjualan."
        },
        {
          id: "ecom-complete", name: "Melekat", price: 2500000, eta: "10–14 hari kerja",
          rows: { "Upload/Optimasi Produk": "40", "Judul Produk": true, "Deskripsi Produk": true,
            "Kategori Produk": true, "Optimasi Foto/Katalog": true, "Keyword Produk": true,
            "Banner Toko": "2", "Analisis Kompetitor": true, "Rekomendasi Promo": true,
            "Evaluasi Toko": true },
          fit: "Cocok untuk toko yang ingin revamp menyeluruh."
        }
      ]
    },
    brand: {
      durationLabel: "Estimasi Pengerjaan per Project",
      tiers: [
        {
          id: "brand-starter", name: "Kenal", price: 750000, eta: "5–7 hari kerja",
          rows: { "Brand Style Matcher": true, "Color Palette": true, "Typography": true,
            "Moodboard": true, "Logo Development": false, "Tone of Voice": false,
            "Social Media Style": false, "Brand Guideline": "–", "Revisi": "1x" },
          fit: "Cocok untuk brand baru yang butuh fondasi visual."
        },
        {
          id: "brand-identity", name: "Dekat", price: 1500000, highlight: true, eta: "7–10 hari kerja",
          rows: { "Brand Style Matcher": true, "Color Palette": true, "Typography": true,
            "Moodboard": true, "Logo Development": true, "Tone of Voice": true,
            "Social Media Style": true, "Brand Guideline": "Mini", "Revisi": "2x" },
          fit: "Cocok untuk brand yang ingin identitas lebih matang."
        },
        {
          id: "brand-complete", name: "Melekat", price: 2500000, eta: "10–14 hari kerja",
          rows: { "Brand Style Matcher": true, "Color Palette": true, "Typography": true,
            "Moodboard": true, "Logo Development": true, "Tone of Voice": true,
            "Social Media Style": true, "Brand Guideline": "Lengkap", "Revisi": "3x" },
          fit: "Cocok untuk brand yang ingin panduan lengkap & konsisten."
        }
      ]
    }
  },

  /* ---------- LAYANAN SATUAN (bisa dibeli tanpa paket) ---------- */
  singles: [
    { id: "single-feed", service: "content", name: "Feed Design", price: 50000, unit: "1 desain" },
    { id: "single-carousel", service: "content", name: "Carousel", price: 100000, unit: "1 set carousel" },
    { id: "single-reels", service: "content", name: "Reels/Video Pendek", price: 95000, unit: "1 video" },
    { id: "single-story", service: "content", name: "Story Design", price: 25000, unit: "1 desain" },
    { id: "single-foto", service: "content", name: "Foto Produk", price: 50000, unit: "3 foto" },
    { id: "single-caption", service: "smm", name: "Copywriting / Caption", price: 25000, unit: "per konten" },
    { id: "single-hashtag", service: "smm", name: "Riset Hashtag", price: 20000, unit: "per riset" },
    { id: "single-upload", service: "ecommerce", name: "Upload & Optimasi Produk", price: 35000, unit: "1 produk" },
    { id: "single-banner", service: "ecommerce", name: "Iklan PPC (Pay-Per-Click)", price: 45000, unit: "1 banner" },
    { id: "single-logo", service: "brand", name: "Logo Development", price: 100000, unit: "1 logo" },
    { id: "single-palette", service: "brand", name: "Color Palette & Typography", price: 125000, unit: "1 paket visual" },
    { id: "single-guideline", service: "brand", name: "Brand Identity", price: 150000, unit: "1 dokumen" }
  ],


  /* ---------- ADD-ON (khusus project yang sedang berjalan) ---------- */
  addons: [
    { id: "addon-feed", name: "+1 Feed Design", price: 100000 },
    { id: "addon-carousel", name: "+1 Carousel", price: 150000 },
    { id: "addon-reels", name: "+1 Reels", price: 200000 },
    { id: "addon-story5", name: "+5 Story Design", price: 200000 },
    { id: "addon-foto5", name: "+5 Foto Produk", price: 250000 },
    { id: "addon-copy", name: "Extra Copywriting", price: 50000, note: "per konten" },
    { id: "addon-revisi", name: "Extra Revision", price: 50000, note: "per konten" },
    { id: "addon-express", name: "Express / Priority", price: null, percent: 20, note: "+20% dari biaya pekerjaan" }
  ],

  /* ---------- Brand Style Matcher: pilihan kuis ---------- */
  brandMatcherQuiz: [
    {
      q: "Kalau brand kamu adalah manusia, kesan pertamanya seperti apa?",
      options: [
        { text: "Hangat, ramah, dan approachable", style: "Warm & Friendly" },
        { text: "Elegan, tenang, dan premium", style: "Elegant & Minimal" },
        { text: "Berani, ceria, dan penuh energi", style: "Bold & Playful" },
        { text: "Natural, jujur, dan earthy", style: "Earthy & Organic" }
      ]
    },
    {
      q: "Palet warna mana yang paling menarik untuk brand kamu?",
      options: [
        { text: "Krem, terracotta, coklat muda", style: "Earthy & Organic" },
        { text: "Hitam, putih, emas", style: "Elegant & Minimal" },
        { text: "Pink cerah, kuning, biru muda", style: "Bold & Playful" },
        { text: "Pastel hangat, peach, sage green", style: "Warm & Friendly" }
      ]
    },
    {
      q: "Gaya foto produk seperti apa yang kamu bayangkan?",
      options: [
        { text: "Studio bersih, minim properti", style: "Elegant & Minimal" },
        { text: "Outdoor natural, cahaya matahari", style: "Earthy & Organic" },
        { text: "Flatlay penuh warna & properti", style: "Bold & Playful" },
        { text: "Lifestyle santai, terasa personal", style: "Warm & Friendly" }
      ]
    },
    {
      q: "Bagaimana cara brand kamu 'ngomong' ke pelanggan?",
      options: [
        { text: "Santai seperti teman dekat", style: "Warm & Friendly" },
        { text: "Ringkas, to the point, profesional", style: "Elegant & Minimal" },
        { text: "Ekspresif, banyak emoji & candaan", style: "Bold & Playful" },
        { text: "Jujur, storytelling, dekat dengan proses", style: "Earthy & Organic" }
      ]
    }
  ],

  brandStyleResults: {
    "Warm & Friendly": {
      palette: ["#F3D9CE", "#DD9C88", "#F8EEE4", "#8B5E4A"],
      desc: "Brand kamu terasa dekat, hangat, dan personal — cocok dengan tone komunikasi yang santai dan warna-warna peach/pastel."
    },
    "Elegant & Minimal": {
      palette: ["#1E3B2C", "#2B2A28", "#F8EEE4", "#C9A96A"],
      desc: "Brand kamu punya kesan premium dan tenang — cocok dengan palet netral, tipografi bersih, dan komposisi yang lega."
    },
    "Bold & Playful": {
      palette: ["#DD5C4A", "#F2C14E", "#3A7CA5", "#1E3B2C"],
      desc: "Brand kamu enerjik dan ekspresif — cocok dengan warna kontras berani dan gaya visual yang playful."
    },
    "Earthy & Organic": {
      palette: ["#8B5E4A", "#A9B48C", "#F8EEE4", "#5C6B4E"],
      desc: "Brand kamu terasa jujur dan natural — cocok dengan palet earth tone dan foto bernuansa outdoor."
    }
  }
}

// Foto produk layanan satuan: ganti nilai src atau file gambar di folder images/products.
const SINGLE_PRODUCT_IMAGES = {
  
  "single-feed": "img/feed-design.jpg",
  "single-carousel": "img/caraousel.jpg",
  "single-reels": "img/reels.png",
  "single-story":"img/image4.jpg",
  "single-foto": "img/foto-produk.jpg",
  "single-caption": "img/copy-writing.jpg",
  "single-hashtag": "img/riset-hashtag.jpg",
  "single-upload":"img/optimasiproduk.jpg",
  "single-banner": "img/iklan PPC.jpg",
  "single-logo": "img/logo-development.jpg",
  "single-palette": "img/colorpalette.jpg",
  "single-guideline":"img/brand-identity.jpg"
};
NUSAEAST_DATA.singles.forEach((item) => {
  item.image = SINGLE_PRODUCT_IMAGES[item.id] || "img/service-content.jpg";
  item.description = item.description || `Layanan ${item.name} dari Nusa East. Cocok untuk UMKM dan brand lokal yang membutuhkan hasil kreatif profesional dengan proses yang terarah.`;
});
