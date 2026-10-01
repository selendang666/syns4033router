
import { useState, useEffect, useCallback } from "react";
import { Card, Button, Modal, Input, Toggle, ConfirmModal, ModelSelectModal, SegmentedControl } from "@/shared/components";
import PlaygroundTab from "./PlaygroundTab";

const EMPTY_FORM = { displayName: "", modelTarget: "", prompt: "" };
const GLOBAL_TARGET = "*";

export default function SystemPromptPage() {
  const [tab, setTab] = useState("library"); // library | playground
  const [prompts, setPrompts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState(null);

  // CRUD modals
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [confirmDelete, setConfirmDelete] = useState(null);

  // Browse model picker
  const [browseOpen, setBrowseOpen] = useState(false);
  const [activeProviders, setActiveProviders] = useState([]);

  // Playground editor
  const [playgroundTarget, setPlaygroundTarget] = useState(null); // entry id being edited in playground
  const [playgroundText, setPlaygroundText] = useState("");

  const showToast = useCallback((msg) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2500);
  }, []);

  const fetchData = useCallback(async () => {
    try {
      const [spRes, provRes] = await Promise.all([
        fetch("/api/system-prompts"),
        fetch("/api/providers"),
      ]);
      if (spRes.ok) {
        const d = await spRes.json();
        setPrompts(d.prompts || []);
      }
      if (provRes.ok) {
        const d = await provRes.json();
        setActiveProviders(d.connections || []);
      }
    } catch (e) {
      console.error("Error fetching:", e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const openCreate = () => {
    setForm(EMPTY_FORM);
    setEditing(null);
    setShowCreateModal(true);
  };

  // Global entry — modelTarget "*" applies to every provider/model that has no
  // entry of its own. At most one can exist (UNIQUE(modelTarget)).
  const openCreateGlobal = () => {
    setForm({ displayName: "Global — semua provider", modelTarget: GLOBAL_TARGET, prompt: "" });
    setEditing(null);
    setShowCreateModal(true);
  };

  const openEdit = (sp) => {
    setForm({ displayName: sp.displayName || "", modelTarget: sp.modelTarget, prompt: sp.prompt });
    setEditing(sp);
    setShowCreateModal(true);
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (!form.modelTarget.trim()) { showToast("⚠ Model target wajib"); return; }
    if (!form.prompt.trim()) { showToast("⚠ Prompt wajib"); return; }
    try {
      const res = await fetch(editing ? `/api/system-prompts/${editing.id}` : "/api/system-prompts", {
        method: editing ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (res.ok) {
        showToast("✓ System prompts disimpan");
        setShowCreateModal(false);
        await fetchData();
      } else {
        const err = await res.json();
        showToast(`⚠ ${err.error || "Gagal simpan"}`);
      }
    } catch (err) {
      console.error(err);
      showToast("⚠ Gagal simpan");
    }
  };

  const toggleField = async (sp, field) => {
    try {
      const res = await fetch(`/api/system-prompts/${sp.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [field]: !sp[field] }),
      });
      if (res.ok) await fetchData();
      else showToast("⚠ Gagal update");
    } catch (e) { console.error(e); showToast("⚠ Gagal update"); }
  };

  const handleDelete = async () => {
    try {
      await fetch(`/api/system-prompts/${confirmDelete.id}`, { method: "DELETE" });
      showToast("✓ Dihapus");
      setConfirmDelete(null);
      await fetchData();
    } catch (e) { console.error(e); showToast("⚠ Gagal hapus"); }
  };

  // Browse model -> prefills new entry for that model
  const onBrowseSelect = (model) => {
    const value = model?.value || model?.id || model?.name || "";
    setForm({ displayName: "", modelTarget: value, prompt: "" });
    setEditing(null);
    setShowCreateModal(true);
    setBrowseOpen(false);
  };

  // Playground: open a single entry's prompt for live editing
  const openPlayground = (sp) => {
    setPlaygroundTarget(sp);
    setPlaygroundText(sp.prompt);
    setTab("playground");
  };

  // "Load semua → Playground" — concatenate all prompts into playground editor
  const loadAllToPlayground = () => {
    if (!prompts.length) { showToast("⚠ Belum ada entry"); return; }
    const text = prompts.map((p) => `<!-- ${p.displayName} → ${p.modelTarget} -->\n${p.prompt}`).join("\n\n");
    setPlaygroundTarget({ _all: true });
    setPlaygroundText(text);
    setTab("playground");
  };

  const savePlayground = async () => {
    if (playgroundTarget?._all) {
      showToast("⚠ 'Load semua' adalah sandbox — save per-entry di Library");
      return;
    }
    try {
      const res = await fetch(`/api/system-prompts/${playgroundTarget.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: playgroundText }),
      });
      if (res.ok) { showToast("✓ Playground disimpan"); await fetchData(); }
      else showToast("⚠ Gagal simpan di Playground");
    } catch (e) { console.error(e); showToast("⚠ Gagal simpan"); }
  };

  const liveCount = prompts.filter((p) => p.isActive && p.injectLive).length;

  return (
    <div className="mx-auto max-w-6xl px-6 py-6">
      {/* Header */}
      <div className="mb-5 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-text-main">System Prompt</h1>
          <p className="text-sm text-text-muted">
            {prompts.length} entri · {liveCount} live counter
          </p>
        </div>
        <SegmentedControl
          value={tab}
          onChange={setTab}
          options={[
            { value: "library", label: "Library" },
            { value: "playground", label: "Playground" },
          ]}
        />
      </div>

      {/* Toast */}
      {toast && (
        <div className="mb-4 rounded-lg bg-green-500/10 border border-green-500/30 px-4 py-2 text-sm text-green-600 dark:text-green-400">
          {toast}
        </div>
      )}

      {tab === "library" && (
        <>
          {/* Toolbar */}
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <Button variant="outline" onClick={() => setBrowseOpen(true)}>Browse model</Button>
            <Button variant="outline" onClick={openCreateGlobal}>+ Global (semua provider)</Button>
            <Button variant="outline" onClick={loadAllToPlayground}>Load semua → Playground</Button>
            <div className="flex-1" />
            <Button onClick={openCreate}>+ Tambah JB</Button>
          </div>

          {loading ? (
            <p className="text-sm text-text-muted">Loading…</p>
          ) : prompts.length === 0 ? (
            <Card className="p-6 text-sm text-text-muted">
              Belum ada system prompt. Klik <b>+ Tambah JB</b> buat bikin entri per model.
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {prompts.map((sp) => (
                <Card key={sp.id} className="p-4 flex flex-col gap-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="truncate font-medium text-text-main">{sp.displayName || sp.modelTarget}</span>
                        {sp.modelTarget === GLOBAL_TARGET && (
                          <span className="rounded bg-purple-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-purple-600 dark:text-purple-400">GLOBAL</span>
                        )}
                        {sp.injectLive && sp.isActive && (
                          <span className="rounded bg-green-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-green-600 dark:text-green-400">LIVE</span>
                        )}
                      </div>
                      <div className="mt-0.5 truncate text-xs text-text-muted">
                        {sp.modelTarget === GLOBAL_TARGET ? " Berlaku ke semua provider & model" : sp.modelTarget}
                      </div>
                    </div>
                    <div className="flex shrink-0 gap-1.5">
                      <Button size="sm" variant="outline" onClick={() => openPlayground(sp)}>Playground</Button>
                      <Button size="sm" variant="outline" onClick={() => openEdit(sp)}>Edit</Button>
                      <Button size="sm" variant="danger" onClick={() => setConfirmDelete(sp)}>Hapus</Button>
                    </div>
                  </div>

                  <p className="line-clamp-3 rounded bg-surface-hover p-2 text-xs text-text-muted break-words whitespace-pre-wrap">
                    {sp.prompt}
                  </p>

                  <div className="mt-auto flex flex-col gap-2 border-t border-border-subtle pt-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-text-muted">Aktif</span>
                      <Toggle checked={sp.isActive} onChange={() => toggleField(sp, "isActive")} />
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-text-muted">Inject ke request customer (live)</span>
                      <Toggle checked={sp.injectLive} onChange={() => toggleField(sp, "injectLive")} />
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </>
      )}

      {tab === "playground" && (
        <>
          {/* "Load semua" used to land here as a concatenated draft. Keep that
              reachable by seeding the playground textarea with it. */}
          {playgroundTarget && !playgroundTarget._all && (
            <div className="mb-3 flex items-center justify-between rounded-lg border border-border-subtle bg-surface-2 px-3 py-2">
              <span className="text-xs text-text-muted">
                Draft dari entry <b>{playgroundTarget.displayName}</b> — atau edit di bawah lalu Simpan balik.
              </span>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => setPlaygroundTarget(null)}>Batal</Button>
                <Button size="sm" onClick={savePlayground}>Simpan</Button>
              </div>
            </div>
          )}
          <PlaygroundTab
            prompts={prompts}
            setToast={showToast}
            initialDraft={
              playgroundTarget && !playgroundTarget._all ? playgroundTarget.prompt : undefined
            }
          />
        </>
      )}

      {/* Create / Edit modal */}
      <Modal isOpen={showCreateModal} onClose={() => setShowCreateModal(false)} title={editing ? "Edit System Prompt" : "Tambah System Prompt"}>
        <form onSubmit={handleSave} className="flex flex-col gap-3">
          <div>
            <label className="mb-1 block text-xs text-text-muted">Display name</label>
            <Input value={form.displayName} onChange={(e) => setForm({ ...form, displayName: e.target.value })} placeholder="big-pickle-JB" />
          </div>
          <div>
            <label className="mb-1 block text-xs text-text-muted">Model target (public alias, atau <code>*</code> = semua provider)</label>
            <Input value={form.modelTarget} onChange={(e) => setForm({ ...form, modelTarget: e.target.value })} placeholder="oc/big-pickle — atau * untuk global" />
            <button type="button" className="mt-1 text-xs text-primary hover:underline" onClick={() => setBrowseOpen(true)}>Browse model aktif…</button>
            {form.modelTarget === GLOBAL_TARGET && (
              <p className="mt-1 text-[11px] text-purple-500">
                Entry GLOBAL disuntik ke setiap provider/model yang belum punya entry sendiri.
              </p>
            )}
          </div>
          <div>
            <label className="mb-1 block text-xs text-text-muted">Prompt (XML-style custom tag)</label>
            <textarea
              className="min-h-[200px] w-full rounded-lg border border-border-subtle bg-surface p-2 font-mono text-sm outline-none focus:border-primary"
              value={form.prompt}
              onChange={(e) => setForm({ ...form, prompt: e.target.value })}
              placeholder="<project_instructions>\n…\n</project_instructions>"
            />
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="outline" onClick={() => setShowCreateModal(false)}>Batal</Button>
            <Button type="submit">Simpan</Button>
          </div>
        </form>
      </Modal>

      {/* Browse model */}
      <ModelSelectModal
        isOpen={browseOpen}
        onClose={() => setBrowseOpen(false)}
        onSelect={onBrowseSelect}
        activeProviders={activeProviders}
        title="Browse Model"
        kindFilter={null}
      />

      {/* Confirm delete */}
      <ConfirmModal
        isOpen={!!confirmDelete}
        onClose={() => setConfirmDelete(null)}
        onConfirm={handleDelete}
        title="Hapus system prompt?"
        message={`Hapus "${confirmDelete?.displayName || confirmDelete?.modelTarget}"?`}
      />
    </div>
  );
}
