-- Midtrans idempotency and CMS editor support.
DELETE FROM public.payments a USING public.payments b
WHERE a.order_id = b.order_id AND a.order_id IS NOT NULL AND a.ctid < b.ctid;
CREATE UNIQUE INDEX IF NOT EXISTS uq_payments_order_id ON public.payments(order_id);

INSERT INTO public.hero_sections(title,subtitle,button_text,button_link,is_active)
SELECT 'Bangun Identitas Digital Brand Kamu','Nusa East membantu brand lokal berkembang melalui strategi digital, konten kreatif, dan pengelolaan toko online.','Lihat Layanan','services.html',TRUE
WHERE NOT EXISTS (SELECT 1 FROM public.hero_sections);
INSERT INTO public.about_sections(title,subtitle,content,vision,mission)
SELECT 'Tentang Nusa East','Partner digital untuk brand lokal','Nusa East membantu UMKM dan brand lokal membangun kehadiran digital yang lebih terarah melalui layanan kreatif dan strategi digital.','Menjadi partner pertumbuhan digital bagi brand lokal.','Menyediakan layanan kreatif, strategi, dan pendampingan digital yang relevan.'
WHERE NOT EXISTS (SELECT 1 FROM public.about_sections);
