-- Pemeriksaan akun operator/admin tanpa menampilkan password/hash.
SELECT id, name, email, role, status
FROM public.users
WHERE LOWER(email) IN (LOWER('nusaeast2026@gmail.com'))
ORDER BY role;

-- Ringkasan akun menurut role
SELECT role, status, COUNT(*) AS jumlah
FROM public.users
GROUP BY role, status
ORDER BY role, status;

-- Pastikan objek pemisah tersedia
SELECT table_name, table_type
FROM information_schema.tables
WHERE table_schema='public'
  AND table_name IN ('users','user_sessions','activity_logs','password_reset_requests',
                     'sales_admin_accounts','operator_accounts')
ORDER BY table_name;
