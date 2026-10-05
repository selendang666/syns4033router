import { useCallback, useEffect, useState } from "react";

export default function MyKey() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/my-key");
      if (!res.ok) throw new Error((await res.json()).error || "Failed to load");
      setData(await res.json());
      setError(null);
    } catch (e) {
      setError(e.message);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const revoke = async () => {
    if (!confirm("Cabut API key ini? Panggilan berikutnya akan ditolak.")) return;
    setBusy(true);
    try {
      const res = await fetch("/api/my-key", { method: "DELETE" });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || "Failed to revoke");
      setNotice("Key dicabut.");
      await load();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  if (error && !data) return <p className="text-sm text-error">{error}</p>;
  if (!data) return <p className="text-sm text-text-muted">Memuat…</p>;

  return (
    <div className="max-w-2xl mx-auto">
      <h1 className="text-3xl font-semibold tracking-tight text-text-main">Key Saya</h1>
      <p className="text-text-muted mt-2">
        Satu akun, satu API key. Nilai penuhnya hanya ditampilkan sekali saat
        dibuat — di sini selalu disamar.
      </p>

      <dl className="mt-6 rounded-lg border border-border-subtle bg-surface divide-y divide-border-subtle">
        <div className="flex items-center justify-between px-5 py-3">
          <dt className="text-sm text-text-muted">Username</dt>
          <dd className="font-mono text-sm text-text-main">{data.username}</dd>
        </div>
        <div className="flex items-center justify-between px-5 py-3">
          <dt className="text-sm text-text-muted">API key</dt>
          <dd className="font-mono text-sm text-text-main">
            {data.hasKey ? data.keyMasked : "—"}
          </dd>
        </div>
        <div className="flex items-center justify-between px-5 py-3">
          <dt className="text-sm text-text-muted">Status</dt>
          <dd>
            {!data.hasKey ? (
              <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-error/10 text-error">
                Dicabut
              </span>
            ) : data.keyActive ? (
              <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-success/10 text-success">
                Aktif
              </span>
            ) : (
              <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-text-muted/20 text-text-muted">
                Nonaktif
              </span>
            )}
          </dd>
        </div>
      </dl>

      {notice && <p className="mt-4 text-sm text-text-muted">{notice}</p>}
      {error && <p className="mt-4 text-sm text-error">{error}</p>}

      <div className="mt-6">
        <button
          onClick={revoke}
          disabled={busy || !data.hasKey}
          className="px-4 py-2 rounded-full bg-error text-surface text-xs font-semibold disabled:opacity-50"
        >
          {busy ? "Mencabut…" : "Cabut API key"}
        </button>
      </div>
    </div>
  );
}
