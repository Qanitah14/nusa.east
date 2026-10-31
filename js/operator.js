/* =========================================================
   NUSA EAST — OPERATOR (Super User)
   Komponen tabel server-side (cari, filter, pagination), badge, dan
   dialog detail/aksi. Semua data berasal dari /api/operator/* (database).
   Butuh js/operator-config.js dan js/admin.js dimuat lebih dulu.
   ========================================================= */
const Op = (() => {
  const esc = Admin.esc;
  const dt = (d) => d ? new Date(d).toLocaleString("id-ID", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "-";
  const ago = (d) => {
    if (!d) return "-";
    const s = Math.max(0, (Date.now() - new Date(d).getTime()) / 1000);
    if (s < 60) return "baru saja";
    if (s < 3600) return Math.floor(s / 60) + " mnt lalu";
    if (s < 86400) return Math.floor(s / 3600) + " jam lalu";
    return Math.floor(s / 86400) + " hari lalu";
  };
  const ROLE = { user: "Pelanggan", sales_admin: "Admin Penjualan", super_user: "Super User" };
  const STATUS = { active: ["Aktif", "badge-green"], disabled: ["Nonaktif", "badge-gray"], blocked: ["Diblokir", "badge-red"] };
  const RESET = {
    pending: ["Pending", "badge-orange"], processing: ["Processing", "badge-orange"], approved: ["Disetujui", "badge-green"],
    completed: ["Completed", "badge-green"], rejected: ["Ditolak", "badge-red"], expired: ["Kedaluwarsa", "badge-gray"]
  };
  const ACTIONS = {
    register: "Registrasi akun", login: "Login", logout: "Logout", login_failed: "Login gagal", login_denied: "Login ditolak (akun tidak aktif)",
    session_timeout: "Sesi berakhir (tidak aktif)", session_expired: "Sesi kedaluwarsa", profile_updated: "Profil diperbarui", password_changed: "Password diganti",
    password_reset_requested: "Permintaan reset password", password_reset_process: "Reset diproses", password_reset_approve: "Reset disetujui",
    password_reset_reject: "Reset ditolak", password_reset_complete: "Reset ditandai selesai", password_reset_completed: "Password direset pengguna",
    password_reset_link_issued: "Tautan reset dibuat operator", account_status_changed: "Status akun diubah", role_changed: "Role diubah",
    staff_created: "Akun internal dibuat", staff_provisioned_cli: "Akun internal dibuat (CLI)", sessions_revoked: "Sesi dipaksa berakhir",
    order_status_updated: "Status pesanan diperbarui"
  };
  const actionLabel = (a) => ACTIONS[a] || a;

  const roleBadge = (r) => `<span class="badge ${r === "super_user" ? "badge-orange" : r === "sales_admin" ? "badge-green" : "badge-gray"}">${esc(ROLE[r] || r)}</span>`;
  const statusBadge = (s) => { const [l, c] = STATUS[s] || [s, "badge-gray"]; return `<span class="badge ${c}">${esc(l)}</span>`; };
  const resetBadge = (s) => { const [l, c] = RESET[s] || [s, "badge-gray"]; return `<span class="badge ${c}">${esc(l)}</span>`; };
  const onlineDot = (on) => `<span class="op-dot ${on ? "on" : "off"}"><i></i>${on ? "Online" : "Offline"}</span>`;
  const avatar = (u) => u.avatar_url
    ? `<span class="a-avatar sm op-av"><img src="${esc(Admin.assetUrl(u.avatar_url))}" alt="" loading="lazy"></span>`
    : `<span class="a-avatar sm op-av" aria-hidden="true">${esc(Admin.initials(u.name))}</span>`;
  const person = (u) => `<div class="a-cell-main">${avatar(u)}<div style="min-width:0"><span class="name">${esc(u.name)}</span><span class="sub">${esc(u.email)}</span></div></div>`;
  const kv = (k, v) => `<div class="a-kv"><span>${esc(k)}</span><b>${v}</b></div>`;
  const idr = Admin.idr;

  /* ---------- tabel server-side ---------- */
  function table({ mount, endpoint, columns, filters = [], searchPlaceholder = "Cari…", actions = {}, rowActions, pageSize = 15, empty = ["fa-inbox", "Tidak ada data", "Belum ada data yang cocok."], extra = {} }) {
    const el = typeof mount === "string" ? document.querySelector(mount) : mount;
    const state = { page: 1, search: "" };
    filters.forEach((f) => { state[f.name] = f.value || ""; });
    let rows = [];
    el.innerHTML = `
      <div class="a-toolbar op-toolbar">
        <div class="a-search"><i class="fas fa-search" aria-hidden="true"></i><input type="search" class="form-control" placeholder="${esc(searchPlaceholder)}" aria-label="Cari" data-op-search></div>
        ${filters.map((f) => f.type === "date" ? `<label class="op-date"><span>${esc(f.label)}</span><input type="date" class="form-control op-filter" data-op-filter="${f.name}"></label>` : `<select class="form-control op-filter" aria-label="${esc(f.label)}" data-op-filter="${f.name}">${f.options.map(([v, l]) => `<option value="${esc(v)}" ${v === (f.value || "") ? "selected" : ""}>${esc(l)}</option>`).join("")}</select>`).join("")}
        <button type="button" class="btn btn-outline btn-sm" data-op-refresh title="Muat ulang"><i class="fas fa-rotate"></i></button>
      </div>
      <div data-op-body></div>`;
    const body = el.querySelector("[data-op-body]");

    async function load() {
      body.innerHTML = Admin.loading();
      const q = new URLSearchParams({ page: state.page, pageSize });
      Object.entries(state).forEach(([k, v]) => { if (k !== "page" && v !== "" && v != null) q.set(k, v); });
      Object.entries(extra).forEach(([k, v]) => q.set(k, v));
      try {
        const d = await Admin.api.get(`${endpoint}?${q}`);
        rows = d.rows;
        if (!rows.length && d.total > 0 && state.page > 1) { state.page = 1; return load(); }
        if (!rows.length) { body.innerHTML = Admin.empty(...empty); return; }
        const pages = Math.max(1, Math.ceil(d.total / d.pageSize));
        body.innerHTML = `
          <div class="a-table-wrap"><table class="a-table op-table">
            <thead><tr>${columns.map((c) => `<th>${esc(c.label)}</th>`).join("")}${rowActions ? "<th></th>" : ""}</tr></thead>
            <tbody>${rows.map((r, i) => `<tr data-i="${i}">${columns.map((c) => `<td data-label="${esc(c.label)}">${c.render(r)}</td>`).join("")}${rowActions ? `<td class="acts"><div class="a-row-acts">${rowActions(r)}</div></td>` : ""}</tr>`).join("")}</tbody>
          </table></div>
          <div class="op-pager"><span>${d.total} data · halaman ${d.page}/${pages}</span>
            <div><button class="btn btn-outline btn-sm" data-op-prev ${d.page <= 1 ? "disabled" : ""}>‹ Sebelumnya</button>
            <button class="btn btn-outline btn-sm" data-op-next ${d.page >= pages ? "disabled" : ""}>Berikutnya ›</button></div></div>`;
      } catch (err) {
        body.innerHTML = Admin.errorBox(err.message, "opRetry");
        const b = body.querySelector("#opRetry"); if (b) b.addEventListener("click", load);
      }
    }
    let timer;
    el.querySelector("[data-op-search]").addEventListener("input", (e) => { clearTimeout(timer); timer = setTimeout(() => { state.search = e.target.value.trim(); state.page = 1; load(); }, 350); });
    el.querySelectorAll("[data-op-filter]").forEach((s) => s.addEventListener("change", () => { state[s.dataset.opFilter] = s.value; state.page = 1; load(); }));
    el.querySelector("[data-op-refresh]").addEventListener("click", load);
    el.addEventListener("click", (e) => {
      if (e.target.closest("[data-op-prev]")) { state.page--; load(); return; }
      if (e.target.closest("[data-op-next]")) { state.page++; load(); return; }
      const b = e.target.closest("[data-act]"); if (!b) return;
      const tr = b.closest("tr"); const row = rows[Number(tr.dataset.i)];
      if (row && actions[b.dataset.act]) actions[b.dataset.act](row, { reload: load });
    });
    load();
    return { reload: load };
  }
  const btn = (act, icon, title, cls = "") => `<button type="button" class="a-row-btn ${cls}" data-act="${act}" title="${esc(title)}" aria-label="${esc(title)}"><i class="fas ${icon}"></i></button>`;

  /* ---------- detail pengguna ---------- */
  async function showUser(id) {
    let u;
    try { u = await Admin.api.get("/operator/users/" + encodeURIComponent(id)); } catch (e) { Admin.toast(e.message); return; }
    const list = (items, fn, emptyText) => items.length ? `<ul class="a-log">${items.map(fn).join("")}</ul>` : `<p class="hint">${emptyText}</p>`;
    Admin.openModal({
      title: u.name, size: "lg", hideFooter: true,
      body: `
        <div class="op-detail-head">${avatar(u)}<div><b>${esc(u.name)}</b><br><span class="hint">${esc(u.email)}</span></div>${roleBadge(u.role)} ${statusBadge(u.status)}</div>
        <div class="a-kv-grid">
          ${kv("Telepon", esc(u.phone || "-"))}
          ${kv("Alamat", esc(u.address || "-"))}
          ${kv("Terdaftar", dt(u.created_at))}
          ${kv("Diperbarui", dt(u.updated_at))}
        </div>
        <h4 class="a-sub-h">Sesi login terakhir</h4>
        ${list(u.sessions, (s) => `<li><b>${s.online ? "Online" : s.ended_at ? "Berakhir" : "Offline (belum logout)"}</b><span>Masuk ${dt(s.created_at)} · ${s.ended_at ? "keluar " + dt(s.ended_at) + " (" + esc(s.end_reason) + ")" : "terakhir aktif " + ago(s.last_seen_at)} · IP ${esc(s.ip || "-")}</span></li>`, "Belum pernah login.")}
        ${u.role === "user" ? `<h4 class="a-sub-h">Pesanan</h4>${list(u.orders, (o) => `<li><b>${esc(o.id)}</b><span>${idr(o.total)} · ${esc(o.status)} · ${esc(o.payment_status)} · ${dt(o.created_at)}</span></li>`, "Belum ada pesanan.")}` : ""}
        <h4 class="a-sub-h">Permintaan reset password</h4>
        ${list(u.resetRequests, (r) => `<li><b>${esc((RESET[r.status] || [r.status])[0])}</b><span>${dt(r.created_at)} · ${r.source === "operator" ? "dibuat operator" : "diajukan pengguna"}</span></li>`, "Tidak ada.")}
        <h4 class="a-sub-h">Aktivitas terkait</h4>
        ${list(u.activity, (a) => `<li><b>${esc(actionLabel(a.action))}</b><span>${dt(a.created_at)}${a.ip ? " · IP " + esc(a.ip) : ""}</span></li>`, "Belum ada aktivitas.")}
        <div class="a-modal-actions"><button type="button" class="btn btn-outline btn-sm" data-close>Tutup</button></div>`
    });
  }

  /* ---------- ubah status akun ---------- */
  function changeStatus(u, after) {
    const sel = (v, l) => `<option value="${v}" ${u.status === v ? "disabled" : ""}>${l}</option>`;
    Admin.openModal({
      title: "Ubah status akun", size: "sm", submitLabel: "Terapkan",
      body: `<p style="margin-bottom:12px"><b>${esc(u.name)}</b><br><span class="hint">${esc(u.email)} · saat ini: ${esc((STATUS[u.status] || [u.status])[0])}</span></p>
        <div class="form-group"><label>Status baru</label><select class="form-control" name="status">
          ${sel("active", "Aktif — dapat login")}${sel("disabled", "Nonaktif — tidak dapat login")}${sel("blocked", "Blokir — tidak dapat login & tidak dapat reset password")}</select></div>
        <div class="form-group"><label>Alasan (opsional)</label><input class="form-control" name="reason" maxlength="300"></div>
        <p class="hint">Menonaktifkan atau memblokir akan langsung mengakhiri semua sesi login akun ini.</p>`,
      onSubmit: async (f, ctx) => {
        const status = f.status.value;
        if (status === u.status) throw new Error("Pilih status yang berbeda.");
        await patch("/operator/users/" + u.id + "/status", { status, reason: f.reason.value });
        ctx.close(); Admin.toast("Status akun diperbarui."); after && after();
      }
    });
  }
  // Admin.api tidak punya PATCH; gunakan fetch langsung dengan token operator.
  async function patch(endpoint, data) {
    const base = "https://nusa-east-vsxf.vercel.app/api";
    let res;
    try {
      res = await fetch(base + endpoint, { method: "PATCH", headers: { "Content-Type": "application/json", Authorization: `Bearer ${Admin.getToken()}` }, body: JSON.stringify(data) });
    } catch (_) { throw new Error("Tidak dapat menghubungi backend."); }
    const json = await res.json().catch(() => ({}));
    if (res.status === 401) { Admin.logout(true); throw new Error("Sesi berakhir."); }
    if (!res.ok) { const e = new Error(json.error || "Permintaan gagal."); e.status = res.status; throw e; }
    return json;
  }

  function revokeSessions(u, after) {
    Admin.confirmDialog({ title: "Akhiri semua sesi?", confirmLabel: "Akhiri sesi",
      message: `Semua sesi login <b>${esc(u.name)}</b> akan diakhiri dan pengguna harus login kembali.`,
      onConfirm: async () => { const r = await Admin.api.post("/operator/users/" + u.id + "/revoke-sessions", {}); Admin.toast(`${r.ended} sesi diakhiri.`); after && after(); } });
  }

  /* ---------- tampilkan tautan reset (sekali) ---------- */
  function showResetLink(out, who) {
    const url = new URL(out.resetPath, location.href.replace(/operator\/.*$/, "")).href;
    Admin.openModal({
      title: "Tautan reset password", size: "sm", hideFooter: true,
      body: `<p style="margin-bottom:10px">Berikan tautan ini kepada <b>${esc(who)}</b> melalui kanal yang aman (mis. WhatsApp nomor terdaftar).</p>
        <textarea class="form-control" rows="4" readonly id="opResetUrl" style="font-size:.8rem">${esc(url)}</textarea>
        <p class="hint" style="margin-top:8px">Berlaku ${out.expiresInMinutes} menit, hanya dapat dipakai sekali, dan <b>tidak akan ditampilkan lagi</b> setelah jendela ini ditutup.</p>
        <div class="a-modal-actions"><button type="button" class="btn btn-outline btn-sm" data-close>Tutup</button><button type="button" class="btn btn-primary btn-sm" id="opCopy">Salin tautan</button></div>`
    });
    setTimeout(() => {
      const b = document.getElementById("opCopy"); if (!b) return;
      b.addEventListener("click", async () => {
        const t = document.getElementById("opResetUrl");
        try { await navigator.clipboard.writeText(t.value); } catch (_) { t.select(); document.execCommand("copy"); }
        Admin.toast("Tautan disalin.");
      });
    }, 0);
  }

  return { esc, dt, ago, ROLE, STATUS, ACTIONS, actionLabel, roleBadge, statusBadge, resetBadge, onlineDot, avatar, person, kv, idr, table, btn, showUser, changeStatus, revokeSessions, showResetLink, patch };
})();
