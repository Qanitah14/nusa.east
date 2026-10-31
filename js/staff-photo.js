/* NUSA EAST — Foto profil Admin Penjualan & Operator.
   Dipakai admin/profile.html dan operator/profile.html (dimuat SETELAH js/admin.js).
   File dikirim ke backend (/api/staff-profile/avatar); database (tabel staff_profiles)
   hanya menyimpan link fotonya. */
const StaffPhoto = (() => {
  const $ = (id) => document.getElementById(id);
  let current = null;
  const initials = () => Admin.initials((Admin.getUser() || {}).name);

  function render(url) {
    current = url || null;
    const box = $("pAvatar"), remove = $("pPhotoRemove");
    if (!box) return;
    if (current) {
      const img = document.createElement("img");
      img.alt = "Foto profil";
      img.style.cssText = "width:100%;height:100%;object-fit:cover;border-radius:50%;display:block";
      img.onerror = () => { current = null; box.textContent = initials(); if (remove) remove.hidden = true; };
      img.src = Admin.assetUrl(current);
      box.textContent = "";
      box.appendChild(img);
    } else {
      box.textContent = initials();
    }
    if (remove) remove.hidden = !current;
  }

  // Dipanggil saat nama berubah: inisial hanya digambar bila belum ada foto.
  function paintInitials(name) {
    const box = $("pAvatar");
    if (box && !current) box.textContent = Admin.initials(name);
  }

  const friendly = (err) => /Endpoint tidak ditemukan/i.test(err.message)
    ? "Backend belum diperbarui. Deploy ulang backend terlebih dahulu."
    : (err.message || "Foto profil gagal disimpan.");

  async function init() {
    const input = $("pPhotoInput"), msg = $("pPhotoMsg"), remove = $("pPhotoRemove");
    if (!input) return;
    const say = (text) => { if (msg) msg.textContent = text; };

    try { const me = await Admin.api.get("/staff-profile"); render(me.image_url); } catch (_) { /* tampilkan inisial */ }

    input.addEventListener("change", async () => {
      const file = input.files && input.files[0];
      if (!file) return;
      if (!/^image\/(png|jpeg|webp)$/.test(file.type)) { say("Gunakan file JPG, PNG, atau WebP."); input.value = ""; return; }
      if (file.size > 1.5 * 1024 * 1024) { say("Ukuran foto maksimal 1,5 MB."); input.value = ""; return; }
      try {
        say("Mengunggah foto profil...");
        const fd = new FormData();
        fd.append("avatar", file);
        const out = await Admin.api.post("/staff-profile/avatar", fd);
        render(out.image_url);
        say("Foto profil berhasil disimpan.");
      } catch (err) { say(friendly(err)); }
      finally { input.value = ""; }
    });

    if (remove) remove.addEventListener("click", async () => {
      try { await Admin.api.del("/staff-profile/avatar"); render(null); say("Foto profil dihapus."); }
      catch (err) { say(friendly(err)); }
    });
  }

  return { init, render, paintInitials };
})();
