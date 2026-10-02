/**
 * Playground tab — the "try it before you ship it" half of the System Prompt
 * page. Runs a prompt against a model through the same handleChat path the
 * gateway uses, optionally against a no-prompt baseline, so the operator sees
 * what the prompt actually changes instead of assuming it.
 */
import { useEffect, useState, useCallback } from "react";
import { Card, Button, Input, ModelSelectModal } from "@/shared/components";

const EMPTY = { model: "", message: "", prompt: "", entryId: "", compare: true };

function Leg({ title, tone, leg, note }) {
  if (!leg) {
    return (
      <div className="rounded-lg border border-border-subtle bg-surface-2 p-3">
        <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-text-muted">{title}</div>
        <p className="text-xs text-text-muted">{note}</p>
      </div>
    );
  }
  return (
    <div className={`rounded-lg border p-3 ${leg.ok ? "border-border-subtle bg-surface-2" : "border-red-500/40 bg-red-500/5"}`}>
      <div className="mb-1 flex items-center gap-2">
        <span className={`text-[11px] font-semibold uppercase tracking-wide ${tone}`}>{title}</span>
        {leg.ok ? (
          <span className="rounded bg-green-500/15 px-1.5 py-0.5 text-[10px] text-green-600 dark:text-green-400">200</span>
        ) : (
          <span className="rounded bg-red-500/15 px-1.5 py-0.5 text-[10px] text-red-600 dark:text-red-400">
            {leg.status}
          </span>
        )}
      </div>
      <pre className="max-h-56 overflow-auto whitespace-pre-wrap break-words text-xs text-text-main">
        {leg.output || "(empty)"}
      </pre>
    </div>
  );
}

export default function PlaygroundTab({ prompts, setToast, initialDraft }) {
  const [form, setForm] = useState({ ...EMPTY, prompt: initialDraft || "" });
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const [modelOpen, setModelOpen] = useState(false);
  const [providers, setProviders] = useState([]);

  // "Load semua → Playground" and per-entry Playground hand over a draft.
  useEffect(() => {
    if (initialDraft) setForm((f) => ({ ...f, prompt: initialDraft, entryId: "" }));
  }, [initialDraft]);

  useEffect(() => {
    fetch("/api/providers", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setProviders(d?.connections || []))
      .catch(() => setProviders([]));
  }, []);

  // Pre-fill from the library, not from a blank draft. Both fields started
  // empty, so opening the tab and pressing Run produced a 2.5s toast and no
  // request — it read as a dead button — and once a model was chosen the run
  // still reported "No prompt supplied for this run" because Source defaulted
  // to the empty draft. Load the first entry and its model, which is what
  // someone opening this tab is about to test.
  useEffect(() => {
    setForm((f) => {
      if (f.entryId) return f;
      const entry = prompts.find((p) => p.modelTarget && p.modelTarget !== "*") || prompts[0];
      if (entry) {
        return {
          ...f,
          entryId: entry.id,
          prompt: entry.prompt,
          model: entry.modelTarget !== "*" ? entry.modelTarget : f.model,
        };
      }
      if (f.model) return f;
      const firstModel = providers
        .flatMap((c) => c.models || [])
        .map((m) => (typeof m === "string" ? m : m?.id || m?.model))
        .filter(Boolean)[0];
      return firstModel ? { ...f, model: firstModel } : f;
    });
  }, [prompts, providers]);

  const pickEntry = useCallback(
    (id) => {
      const e = prompts.find((p) => p.id === id);
      setForm((f) => ({
        ...f,
        entryId: id,
        prompt: e ? e.prompt : f.prompt,
        model: e && e.modelTarget !== "*" ? e.modelTarget : f.model,
      }));
    },
    [prompts],
  );

  const run = async (e) => {
    e?.preventDefault?.();
    if (!form.model) return setToast("⚠ Pilih model dulu");
    if (!form.message.trim()) return setToast("⚠ Message wajib diisi");
    setBusy(true);
    setResult(null);
    try {
      const res = await fetch("/api/system-prompts/try", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: form.model,
          message: form.message,
          prompt: form.entryId ? undefined : form.prompt,
          entryId: form.entryId || undefined,
          compare: form.compare,
        }),
      });
      const data = await res.json();
      if (!res.ok) return setToast(`⚠ ${data.error || "Gagal run"}`);
      setResult(data);
    } catch (err) {
      setToast("⚠ Gagal run");
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={run} className="flex flex-col gap-4">
      <Card className="p-4 flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-text-muted">Model</span>
          <Input
            value={form.model}
            onChange={(e) => setForm({ ...form, model: e.target.value })}
            placeholder="cc/claude-opus-4-8"
            className="min-w-[240px] flex-1"
          />
          <Button type="button" variant="outline" onClick={() => setModelOpen(true)}>
            Browse model
          </Button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-text-muted">Source</span>
          <select
            value={form.entryId}
            onChange={(e) => pickEntry(e.target.value)}
            className="rounded-lg border border-border-subtle bg-surface px-2 py-1.5 text-xs text-text-main"
          >
            <option value="">— draft (teks di bawah) —</option>
            {prompts.map((p) => (
              <option key={p.id} value={p.id}>
                {p.displayName || p.modelTarget}
                {p.modelTarget === "*" ? " (global)" : ""}
              </option>
            ))}
          </select>
          <label className="ml-auto flex items-center gap-2 text-xs text-text-muted">
            <input
              type="checkbox"
              checked={form.compare}
              onChange={(e) => setForm({ ...form, compare: e.target.checked })}
            />
            Bandingkan vs baseline (tanpa prompt)
          </label>
        </div>

        <div>
          <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-text-muted">
            System prompt
          </label>
          <textarea
            value={form.prompt}
            onChange={(e) => setForm({ ...form, prompt: e.target.value, entryId: "" })}
            disabled={!!form.entryId}
            placeholder="<project_instructions>…</project_instructions>"
            className="min-h-[140px] w-full rounded-lg border border-border-subtle bg-surface p-2 font-mono text-xs text-text-main outline-none focus:border-primary disabled:opacity-50"
          />
          {form.entryId && (
            <p className="mt-1 text-[11px] text-text-muted">
              Locked to the selected entry — clear the dropdown to edit a draft.
            </p>
          )}
        </div>

        <div>
          <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-text-muted">
            Message
          </label>
          <textarea
            value={form.message}
            onChange={(e) => setForm({ ...form, message: e.target.value })}
            placeholder="Your test message…"
            className="min-h-[80px] w-full rounded-lg border border-border-subtle bg-surface p-2 text-sm text-text-main outline-none focus:border-primary"
          />
        </div>

        <div className="flex items-center gap-2">
          <Button type="submit" disabled={busy || !form.model.trim()} title={!form.model.trim() ? "Isi model dulu" : undefined}>
            {busy ? "Running…" : "Run"}
          </Button>
          {!form.model.trim() && (
            <span className="text-xs text-amber-500">
              Isi model dulu — klik “Browse model” atau ketik di kolom Model.
            </span>
          )}
          {result && (
            <span className="text-[11px] text-text-muted">{result.durationMs} ms · {result.model}</span>
          )}
        </div>
      </Card>

      {result && (
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          <Leg
            title="Dengan prompt"
            tone="text-purple-500"
            leg={result.withPrompt}
            note="No prompt supplied for this run."
          />
          {result.compared && (
            <Leg
              title="Baseline (tanpa prompt)"
              tone="text-text-muted"
              leg={result.baseline}
              note="Baseline was not run."
            />
          )}
        </div>
      )}

      <ModelSelectModal
        isOpen={modelOpen}
        onClose={() => setModelOpen(false)}
        onSelect={(m) => {
          setForm((f) => ({ ...f, model: m?.value || m?.id || m?.name || "" }));
          setModelOpen(false);
        }}
        activeProviders={providers}
        title="Browse Model"
        kindFilter={null}
      />
    </form>
  );
}
