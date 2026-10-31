/* NUSA EAST — validasi formulir (aturan sama dengan backend/utils/validators.js).
   Validasi frontend hanya untuk kenyamanan; backend tetap memvalidasi ulang. */
const NEValidate = (() => {
  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
  const PHONE_RE = /^[0-9]{9,15}$/;
  const t = (v) => String(v ?? "").trim();

  const name = (v) => { const s = t(v); return s.length < 2 || s.length > 150 ? "Nama harus 2–150 karakter." : ""; };
  const email = (v) => { const s = t(v); return !s || s.length > 150 || !EMAIL_RE.test(s) ? "Format email tidak valid." : ""; };
  const phone = (v) => {
    const s = t(v);
    if (!s) return "Nomor telepon wajib diisi.";
    if (/\D/.test(s)) return "Nomor telepon hanya boleh berisi angka (tanpa spasi, +, atau tanda baca).";
    if (!PHONE_RE.test(s)) return "Nomor telepon harus 9–15 digit.";
    return "";
  };
  const address = (v) => { const s = t(v); return s.length < 5 ? "Alamat minimal 5 karakter." : s.length > 500 ? "Alamat maksimal 500 karakter." : ""; };
  const password = (v) => { const s = String(v ?? ""); return s.length < 8 ? "Password minimal 8 karakter." : s.length > 72 ? "Password maksimal 72 karakter." : ""; };

  // Input telepon: karakter non-angka langsung dibuang dan pengguna diberi tahu.
  function bindPhoneInput(input, messageEl) {
    if (!input) return;
    input.setAttribute("inputmode", "numeric");
    input.setAttribute("maxlength", "15");
    input.setAttribute("pattern", "[0-9]{9,15}");
    input.setAttribute("autocomplete", "tel");
    const say = (m) => { if (messageEl) { messageEl.textContent = m; messageEl.style.color = m ? "var(--color-danger)" : ""; } };
    input.addEventListener("input", () => {
      const cleaned = input.value.replace(/\D/g, "").slice(0, 15);
      if (cleaned !== input.value) { input.value = cleaned; say("Hanya angka yang diperbolehkan pada nomor telepon."); }
      else say("");
    });
    input.addEventListener("paste", () => setTimeout(() => input.dispatchEvent(new Event("input")), 0));
  }
  return { name, email, phone, address, password, bindPhoneInput };
})();
