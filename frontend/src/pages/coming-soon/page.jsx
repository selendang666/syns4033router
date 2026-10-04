import { Link, useLocation } from "react-router-dom";

// Menu entries that are navigable but have no page yet. Saying so beats an
// empty shell, and the tier badge shows where the entry belongs once the
// access model lands.
const TIER = {
  "/dashboard/pemakaian": "user",
  "/dashboard/live-traffic": "user",
  "/dashboard/token-saver": "user",
  "/dashboard/api-health": "admin",
  "/dashboard/cloudflare-deploy": "admin",
  "/dashboard/anti-roseller": "admin",
  "/dashboard/paket-harga": "admin",
  "/dashboard/member": "admin",
  "/dashboard/model-rebranding": "admin",
};

export default function ComingSoon() {
  const { pathname } = useLocation();
  const tier = TIER[pathname];

  return (
    <div className="max-w-2xl mx-auto">
      <h1 className="text-3xl font-semibold tracking-tight text-text-main">Belum dibangun</h1>
      <p className="text-text-muted mt-2">
        Menu ini sudah ada di navigasi, halamannya belum. Tidak ada data yang dimuat dan
        tidak ada yang perlu dikonfigurasi di sini.
      </p>

      {tier && (
        <div className="mt-6 inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary/10 text-primary text-xs font-semibold">
          <span className="material-symbols-outlined text-[16px]">shield</span>
          {tier === "admin" ? "Tier admin" : "Tier user"}
        </div>
      )}

      <Link
        to="/dashboard/endpoint"
        className="mt-6 inline-flex items-center gap-1 text-sm text-text-muted hover:text-primary transition-colors"
      >
        <span className="material-symbols-outlined text-lg">arrow_back</span>
        Kembali ke Endpoint
      </Link>
    </div>
  );
}
