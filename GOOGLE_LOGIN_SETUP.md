# Login Google / verifikasi email

Untuk mencegah email palsu, gunakan Google Identity Services / OAuth; hanya memvalidasi format email tidak membuktikan pemilik email. Integrasi Google tidak bisa aktif hanya dengan kode frontend: project perlu OAuth Client ID dari Google Cloud Console, origin `https://nusa-east.vercel.app` yang diizinkan, dan backend yang memverifikasi ID token dengan Google. Jangan meminta atau menyimpan password Gmail pengguna.

Langkah konfigurasi: buat OAuth Client ID tipe Web di Google Cloud Console; tambahkan Authorized JavaScript origin `https://nusa-east.vercel.app`; simpan Client ID sebagai konfigurasi frontend `GOOGLE_CLIENT_ID` dan environment backend. Backend harus memverifikasi ID token (audience harus sama dengan Client ID) sebelum membuat/login akun. Sampai konfigurasi tersebut tersedia, jangan tampilkan tombol Google palsu yang mengaku sudah memverifikasi email.

Foto profil pada versi ini disimpan lokal di browser pengguna. Agar tersimpan lintas perangkat, sambungkan ke penyimpanan gambar persisten dan endpoint backend terautentikasi.
