import { useCallback, useEffect, useState } from "react";

const mask = (key) => (key ? `${key.slice(0, 11)}…${key.slice(-4)}` : "—");

export default function Member() {
  const [users, setUsers] = useState([]);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ username: "", password: "" });
  const [newKey, setNewKey] = useState(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/users");
      if (!res.ok) throw new Error((await res.json()).error || "Failed to load");
      setUsers((await res.json()).users || []);
      setError(null);
    } catch (e) {
      setError(e.message);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const create = async (ev) => {
    ev.preventDefault();
    setBusy(true);
    setNotice(null);
    setError(null);
    try {
      const res = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to create user");
      // Shown once and never again — the list only carries the key id, so this is
      // the single chance to hand it over.
      setNewKey(data.key);
      setForm({ username: "", password: "" });
      await load();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const remove = async (user) => {
    if (!confirm(`Hapus ${user.username}? API key-nya ikut dicabut.`)) return;
    try {
      const res = await fetch(`/api/admin/users/${user.id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to delete");
      setNotice(`${user.username} dihapus, key-nya dicabut.`);
      await load();
    } catch (e) {
      setError(e.message);
    }
  };

  return (
    <div className="max-w-4xl mx-auto">
      <h1 className="text-3xl font-semibold tracking-tight text-text-main">Member</h1>
      <p className="text-text-muted mt-2">
        Satu akun satu API key. Key dibuat bersama akun dan ikut terhapus kalau
        akunnya dihapus.
      </p>

      <form onSubmit={create} className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="flex-1">
          <label className="block text-xs font-semibold uppercase tracking-wider text-text-muted mb-1.5">
            Username
          </label>
          <input
            value={form.username}
            onChange={(e) => setForm({ ...form, username: e.target.value })}
            placeholder="3-32 karakter: huruf, angka, . _ -"
            className="w-full px-3 py-2 rounded-full bg-surface border border-border-subtle text-sm text-text-main"
          />
        </div>
        <div className="flex-1">
          <label className="block text-xs font-semibold uppercase tracking-wider text-text-muted mb-1.5">
            Password
          </label>
          <input
            type="password"
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
            placeholder="minimal 8 karakter"
            className="w-full px-3 py-2 rounded-full bg-surface border border-border-subtle text-sm text-text-main"
          />
        </div>
        <button
          type="submit"
          disabled={busy}
          className="px-4 py-2 rounded-full bg-primary text-surface text-xs font-semibold disabled:opacity-60"
        >
          {busy ? "Membuat…" : "Buat akun"}
        </button>
      </form>

      {newKey && (
        <div className="mt-4 rounded-lg border border-border-subtle bg-surface p-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-text-muted">
            Key baru — tampil sekali saja
          </p>
          <div className="mt-2 flex items-center gap-3">
            <code className="flex-1 font-mono text-sm text-text-main break-all">{newKey}</code>
            <button
              onClick={() => setNewKey(null)}
              className="text-xs text-text-muted hover:text-primary"
            >
              Tutup
            </button>
          </div>
        </div>
      )}

      {error && <p className="mt-4 text-sm text-error">{error}</p>}
      {notice && <p className="mt-4 text-sm text-text-muted">{notice}</p>}

      <table className="mt-6 w-full text-sm">
        <thead>
          <tr className="text-left text-xs uppercase tracking-wider text-text-muted">
            <th className="pb-2 font-semibold">Username</th>
            <th className="pb-2 font-semibold">Role</th>
            <th className="pb-2 font-semibold">Key</th>
            <th className="pb-2 font-semibold">Dibuat</th>
            <th className="pb-2" />
          </tr>
        </thead>
        <tbody>
          {users.length === 0 && (
            <tr>
              <td colSpan={5} className="py-6 text-text-muted">
                Belum ada akun.
              </td>
            </tr>
          )}
          {users.map((u) => (
            <tr key={u.id} className="border-t border-border-subtle">
              <td className="py-2.5 font-medium text-text-main">{u.username}</td>
              <td className="py-2.5 text-text-muted">{u.role}</td>
              <td className="py-2.5 font-mono text-xs text-text-muted">{mask(u.keyId)}</td>
              <td className="py-2.5 text-text-muted">
                {new Date(u.createdAt).toLocaleDateString("id-ID")}
              </td>
              <td className="py-2.5 text-right">
                <button
                  onClick={() => remove(u)}
                  className="text-xs text-text-muted hover:text-error transition-colors"
                >
                  Hapus
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
