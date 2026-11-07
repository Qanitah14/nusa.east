-- Nusa East CMS content tables. Additive migration; preserves existing records.
CREATE TABLE IF NOT EXISTS public.articles (
  id BIGSERIAL PRIMARY KEY,
  title VARCHAR(255) NOT NULL,
  slug VARCHAR(255) NOT NULL UNIQUE,
  content TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  image TEXT,
  author VARCHAR(150) NOT NULL DEFAULT 'Nusa East',
  is_published BOOLEAN NOT NULL DEFAULT false
);
CREATE INDEX IF NOT EXISTS idx_articles_published ON public.articles(is_published, created_at DESC);
CREATE TABLE IF NOT EXISTS public.terms_and_conditions (
  id BIGSERIAL PRIMARY KEY, title VARCHAR(255) NOT NULL, slug VARCHAR(255) NOT NULL UNIQUE,
  content TEXT NOT NULL DEFAULT '', created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(), author VARCHAR(150) NOT NULL DEFAULT 'Nusa East'
);
CREATE TABLE IF NOT EXISTS public.privacy_policies (
  id BIGSERIAL PRIMARY KEY, title VARCHAR(255) NOT NULL, slug VARCHAR(255) NOT NULL UNIQUE,
  content TEXT NOT NULL DEFAULT '', created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(), author VARCHAR(150) NOT NULL DEFAULT 'Nusa East'
);
CREATE TABLE IF NOT EXISTS public.hero_sections (
  id BIGSERIAL PRIMARY KEY, title VARCHAR(255) NOT NULL DEFAULT '', subtitle TEXT NOT NULL DEFAULT '',
  image TEXT, button_text VARCHAR(100), button_link VARCHAR(500),
  is_active BOOLEAN NOT NULL DEFAULT true, created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.about_sections (
  id BIGSERIAL PRIMARY KEY, title VARCHAR(255) NOT NULL DEFAULT '', subtitle TEXT NOT NULL DEFAULT '',
  content TEXT NOT NULL DEFAULT '', image TEXT, vision TEXT, mission TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- Seed initial legal pages only when no content exists.
INSERT INTO public.terms_and_conditions(title,slug,content,author)
SELECT 'Syarat dan Ketentuan','syarat-dan-ketentuan',
'1. Ketentuan Umum. Website Nusa East digunakan untuk memperoleh informasi dan memesan layanan pengelolaan media sosial, produksi konten visual, pengelolaan e-commerce, pengembangan identitas brand, serta layanan terkait bagi brand dan usaha lokal. Pengguna wajib memberikan informasi yang benar dan menggunakan website secara sah.

2. Informasi Produk dan Layanan. Rincian ruang lingkup, hasil pekerjaan, jumlah revisi, dan estimasi waktu mengikuti deskripsi paket atau kesepakatan tertulis dengan Nusa East.

3. Pemesanan. Pesanan dianggap diajukan setelah pengguna mengisi data dan memilih layanan. Nusa East dapat menghubungi pengguna untuk melengkapi brief, materi, dan kebutuhan proyek sebelum pekerjaan dimulai.

4. Harga dan Pembayaran. Harga mengikuti informasi yang ditampilkan saat pemesanan atau penawaran yang disepakati. Pekerjaan dimulai setelah pembayaran terkonfirmasi, kecuali disepakati lain secara tertulis.

5. Penyerahan Hasil. Hasil layanan diserahkan melalui kanal digital yang disepakati. Pengguna bertanggung jawab memastikan kontak dan materi penerimaan benar.

6. Pengembalian dan Pembatalan. Pembatalan, pengembalian dana, dan perubahan ruang lingkup ditangani berdasarkan tahap pekerjaan, biaya yang telah timbul, serta kesepakatan tertulis dengan Nusa East.

7. Tanggung Jawab Pengguna. Pengguna wajib memiliki hak atas logo, foto, teks, dan materi yang diberikan serta memastikan brief dan persetujuan konten akurat.

8. Batasan Tanggung Jawab. Nusa East tidak bertanggung jawab atas gangguan platform pihak ketiga, keterlambatan akibat materi atau persetujuan pengguna, maupun penggunaan hasil di luar ruang lingkup yang disepakati.

9. Perubahan Ketentuan. Nusa East dapat memperbarui ketentuan ini. Versi terbaru akan ditampilkan pada halaman ini beserta tanggal pembaruannya.

10. Kontak. Pertanyaan mengenai ketentuan dapat disampaikan melalui kanal kontak resmi Nusa East yang tercantum pada website.',
'Nusa East'
WHERE NOT EXISTS (SELECT 1 FROM public.terms_and_conditions);
INSERT INTO public.privacy_policies(title,slug,content,author)
SELECT 'Kebijakan Privasi','kebijakan-privasi',
'1. Informasi yang Dikumpulkan. Website dapat mengumpulkan informasi yang pengguna berikan saat membuat akun, menghubungi Nusa East, mengisi brief, atau melakukan pemesanan.

2. Jenis Data. Data dapat meliputi nama, alamat email, nomor telepon/WhatsApp, alamat penagihan atau korespondensi, informasi akun, detail pesanan, brief proyek, serta materi yang diunggah. Data pembayaran diproses melalui penyedia pembayaran; Nusa East hanya menerima informasi transaksi yang diperlukan.

3. Tujuan Pengumpulan. Data digunakan untuk membuat dan mengelola akun, menanggapi pertanyaan, memproses pesanan dan pembayaran, menjalankan layanan, memberikan dukungan, serta memenuhi kewajiban hukum.

4. Penggunaan Informasi. Informasi digunakan sesuai tujuan layanan dan tidak dijual kepada pihak lain.

5. Penyimpanan dan Perlindungan. Data disimpan pada sistem yang digunakan Nusa East dengan langkah pengamanan teknis dan organisasi yang wajar. Akses dibatasi sesuai kebutuhan pekerjaan.

6. Pihak Ketiga. Data dapat diproses oleh penyedia hosting, database, komunikasi, dan pembayaran sejauh diperlukan untuk menjalankan website dan layanan atau memenuhi hukum.

7. Cookies. Website dapat menggunakan penyimpanan browser atau cookies yang diperlukan untuk sesi login dan fungsi dasar. Jika analitik atau cookies tambahan digunakan, informasi dan pilihan pengguna akan disesuaikan.

8. Hak Pengguna. Sesuai UU No. 27 Tahun 2022 tentang Pelindungan Data Pribadi, pengguna dapat mengajukan akses, koreksi, pembaruan, atau penghapusan data sesuai ketentuan dan kewajiban retensi yang berlaku.

9. Masa Penyimpanan. Data disimpan selama diperlukan untuk tujuan layanan, keamanan, penyelesaian sengketa, dan pemenuhan kewajiban hukum.

10. Perubahan Kebijakan. Kebijakan ini dapat diperbarui dan versi terbaru akan ditampilkan pada halaman ini.

11. Kontak. Permintaan terkait data pribadi dapat disampaikan melalui kanal kontak resmi Nusa East yang tercantum pada website.',
'Nusa East'
WHERE NOT EXISTS (SELECT 1 FROM public.privacy_policies);

-- Media tersimpan persisten di PostgreSQL agar tidak hilang pada deployment serverless.
CREATE TABLE IF NOT EXISTS public.content_media (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  file_name VARCHAR(255) NOT NULL,
  mime_type VARCHAR(50) NOT NULL CHECK (mime_type IN ('image/jpeg','image/png','image/webp','image/gif')),
  image_data BYTEA NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);


-- Membuat tabel penyimpanan gambar Nusa East
CREATE TABLE IF NOT EXISTS public.content_media (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    file_name VARCHAR(255) NOT NULL,

    mime_type VARCHAR(50) NOT NULL
        CHECK (
            mime_type IN (
                'image/jpeg',
                'image/png',
                'image/webp',
                'image/gif'
            )
        ),

    image_data BYTEA NOT NULL,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index untuk pencarian berdasarkan waktu upload
CREATE INDEX IF NOT EXISTS idx_content_media_created_at
ON public.content_media (created_at DESC);
