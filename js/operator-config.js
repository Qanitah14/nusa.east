/* Konfigurasi portal Super User / Operator. Dimuat SEBELUM js/admin.js. */
window.NUSAEAST_PORTAL = {
  role: "super_user",
  tokenKey: "nusaeast_operator_token",
  userKey: "nusaeast_operator_user",
  loginEndpoint: "/auth/operator-login",
  panelName: "Agency Control Center",
  menuLabel: "Menu operator",
  profileHref: "profile.html",
  
nav: [
  {
    key: "dashboard",
    href: "index.html",
    label: "Dashboard",
    icon: "fa-gauge-high"
  },
  {
    key: "users",
    href: "users.html",
    label: "Manajemen Pengguna",
    icon: "fa-users-gear"
  },
  {
    key: "customers",
    href: "customers.html",
    label: "Data Pelanggan",
    icon: "fa-address-card"
  },
  {
    key: "sessions",
    href: "sessions.html",
    label: "Status Login",
    icon: "fa-user-clock"
  },
  {
    key: "activity",
    href: "activity.html",
    label: "Riwayat Aktivitas",
    icon: "fa-clock-rotate-left"
  },
  {
    key: "resets",
    href: "resets.html",
    label: "Reset Password",
    icon: "fa-key"
  },
  {
    key: "accounts",
    href: "accounts.html",
    label: "Manajemen Akun",
    icon: "fa-user-shield"
  },
  {
    key: "roles",
    href: "roles.html",
    label: "Manajemen Role",
    icon: "fa-user-tag"
  },
  {
    key: "profile",
    href: "profile.html",
    label: "Profil Operator",
    icon: "fa-circle-user"
  }
]

};
