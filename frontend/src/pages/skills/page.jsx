
import { Card, Badge } from "@/shared/components";
import { useState, useEffect, useCallback } from "react";
import { useCopyToClipboard } from "@/shared/hooks/useCopyToClipboard";
import {
  SKILLS,
  SKILLS_REPO_URL,
  getSkillRawUrl,
  getSkillBlobUrl,
  fetchSkillContent,
} from "@/shared/constants/skills";

function CopyButton({ value, label = "Copy link" }) {
  const { copied, copy } = useCopyToClipboard(2000);
  return (
    <button
      onClick={() => copy(value)}
      className="px-2 py-1 rounded-md bg-primary text-white text-[11px] font-medium hover:bg-primary/90 transition-colors cursor-pointer shrink-0 inline-flex items-center gap-1"
      title={value}
    >
      <span className="material-symbols-outlined text-[12px]">
        {copied ? "check" : "content_copy"}
      </span>
      {copied ? "Copied!" : label}
    </button>
  );
}

function SkillRow({ skill, onImport, importing, hideImport }) {
  const url = getSkillRawUrl(skill.id);
  return (
    <div
      className={`flex items-start gap-3 p-4 rounded-[14px] border shadow-[var(--shadow-soft)] transition-colors ${
        skill.isEntry
          ? "border-primary/40 bg-primary/5"
          : "border-border-subtle bg-surface hover:bg-surface-2"
      }`}
    >
      <div
        className={`size-9 rounded-lg flex items-center justify-center shrink-0 ${
          skill.isEntry ? "bg-primary text-white" : "bg-primary/10 text-primary"
        }`}
      >
        <span className="material-symbols-outlined text-[18px]">{skill.icon}</span>
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <h3 className="font-semibold text-sm text-text-main">{skill.name}</h3>
          {skill.isEntry && (
            <Badge variant="primary" size="sm">START HERE</Badge>
          )}
          {skill.endpoint && (
            <Badge variant="default" size="sm">
              <code className="text-[10px]">{skill.endpoint}</code>
            </Badge>
          )}
        </div>
        <p className="text-xs text-text-muted mt-0.5">{skill.description}</p>
        <a
          href={getSkillBlobUrl(skill.id)}
          target="_blank"
          rel="noreferrer"
          className="text-[11px] text-text-muted hover:text-primary mt-1 inline-flex items-center gap-1 break-all"
        >
          {url}
          <span className="material-symbols-outlined text-[12px]">open_in_new</span>
        </a>
      </div>

      <div className="flex flex-col gap-1.5 shrink-0">
        <CopyButton value={url} />
        <button
          onClick={() => onImport(skill)}
          disabled={importing === skill.id || hideImport}
          style={hideImport ? { display: "none" } : undefined}
          className="px-2 py-1 rounded-md border border-border-subtle text-[11px] font-medium text-text-muted hover:text-text-main hover:bg-surface-2 transition-colors cursor-pointer shrink-0 inline-flex items-center justify-center gap-1 disabled:opacity-50 disabled:cursor-not-allowed"
          title="Fetch this skill's text and save it as a System Prompt entry"
        >
          <span className="material-symbols-outlined text-[12px]">
            {importing === skill.id ? "progress_activity" : "download"}
          </span>
          {importing === skill.id ? "Importing" : "Import"}
        </button>
      </div>
    </div>
  );
}

const API_SKILLS = ["syns4033router-chat", "syns4033router-image", "syns4033router-tts", "syns4033router-stt", "syns4033router-embeddings", "syns4033router-web-search", "syns4033router-web-fetch"];
const AGENT_SKILLS = ["using-superpowers", "multi-brain"];

export default function SkillsPage() {
  const [importing, setImporting] = useState(null);
  const [existingTargets, setExistingTargets] = useState([]);

  // Which model targets already hold a system prompt, so Import can say what it
  // is about to collide with instead of failing with a bare 409 later.
  const loadExisting = useCallback(async () => {
    try {
      const res = await fetch("/api/system-prompts");
      const data = res.ok ? await res.json() : {};
      const list = data.prompts || data.systemPrompts || [];
      setExistingTargets(list.map((p) => p.modelTarget));
    } catch {
      setExistingTargets([]);
    }
  }, []);

  useEffect(() => { loadExisting(); }, [loadExisting]);

  // A skill is documentation for a coding agent: it tells the agent which env
  // vars and endpoints exist. Sending that text as a system prompt to a chat
  // model would hand it instructions about tooling it does not have.
  const handleImport = useCallback(async (skill) => {
    if (AGENT_SKILLS.includes(skill.id)) return;
    const target = window.prompt(
      `Import "${skill.name}" as a system prompt.\n\nModel target — use * for every model:`,
      "*",
    );
    if (target === null) return;
    const modelTarget = target.trim();
    if (!modelTarget) return;

    setImporting(skill.id);
    try {
      const content = await fetchSkillContent(skill.id);
      if (existingTargets.includes(modelTarget)) {
        const overwrite = window.confirm(
          `A system prompt already exists for "${modelTarget}".\nReplace it with this skill?`,
        );
        if (!overwrite) return;
        const list = (await (await fetch("/api/system-prompts")).json());
        const rows = list.prompts || list.systemPrompts || [];
        const hit = rows.find((p) => p.modelTarget === modelTarget);
        if (hit) {
          const res = await fetch(`/api/system-prompts/${hit.id}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ prompt: content }),
          });
          if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `HTTP ${res.status}`);
        }
      } else {
        const res = await fetch("/api/system-prompts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ displayName: skill.name, modelTarget, prompt: content }),
        });
        if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `HTTP ${res.status}`);
      }
      await loadExisting();
      alert(`"${skill.name}" imported as a system prompt for ${modelTarget}.`);
    } catch (err) {
      alert(`Could not import "${skill.name}": ${err.message}`);
    } finally {
      setImporting(null);
    }
  }, [existingTargets, loadExisting]);

  const entrySkill = SKILLS.find((s) => s.isEntry);
  const apiSkills = SKILLS.filter((s) => API_SKILLS.includes(s.id));
  const agentSkills = SKILLS.filter((s) => AGENT_SKILLS.includes(s.id));

  return (
    <div className="max-w-4xl mx-auto space-y-8">

      {/* Page Header */}
      <div>
        <div className="flex items-center gap-3 mb-2">
          <div className="size-10 rounded-xl bg-primary/10 flex items-center justify-center">
            <span className="material-symbols-outlined text-primary text-[22px]">extension</span>
          </div>
          <div>
            <h1 className="text-xl font-bold text-text-main">Agent Skills</h1>
            <p className="text-sm text-text-muted">Raw SKILL.md URLs to paste into any AI agent or coding assistant.</p>
          </div>
        </div>
      </div>

      {/* Quick Start */}
      <Card padding="md">
        <div className="flex items-center gap-2 mb-3">
          <span className="material-symbols-outlined text-[16px] text-primary">rocket_launch</span>
          <span className="text-xs font-semibold text-text-main uppercase tracking-wide">Quick Start — Paste this to your AI</span>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex-1 px-3 py-2 rounded-lg bg-surface-2 font-mono text-[12px] text-text-main border border-border-subtle min-w-0 break-all">
            Read this skill and use it: {getSkillRawUrl("syns4033router")}
          </div>
          <CopyButton value={`Read this skill and use it: ${getSkillRawUrl("syns4033router")}`} label="Copy prompt" />
        </div>
        <p className="text-[11px] text-text-muted mt-2">
          This entry skill covers setup, authentication, model discovery, and links to all capability skills below.
        </p>
      </Card>

      {/* Entry Skill */}
      {entrySkill && (
        <section className="space-y-2">
          <h2 className="text-xs font-semibold text-text-muted uppercase tracking-wider px-1">Entry Point</h2>
          <SkillRow skill={entrySkill} onImport={handleImport} importing={importing} />
        </section>
      )}

      {/* API Capability Skills */}
      <section className="space-y-2">
        <h2 className="text-xs font-semibold text-text-muted uppercase tracking-wider px-1">API Capabilities</h2>
        <div className="space-y-2">
          {apiSkills.map((skill) => (
            <SkillRow key={skill.id} skill={skill} onImport={handleImport} importing={importing} hideImport={AGENT_SKILLS.includes(skill.id)} />
          ))}
        </div>
      </section>

      {/* Agent Workflow Skills */}
      <section className="space-y-2">
        <h2 className="text-xs font-semibold text-text-muted uppercase tracking-wider px-1">Agent Workflow</h2>
        <div className="space-y-2">
          {agentSkills.map((skill) => (
            <SkillRow key={skill.id} skill={skill} onImport={handleImport} importing={importing} hideImport={AGENT_SKILLS.includes(skill.id)} />
          ))}
        </div>
      </section>

      {/* GitHub Footer */}
      <Card padding="md">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h2 className="text-sm font-semibold text-text-main">Browse on GitHub</h2>
            <p className="text-xs text-text-muted mt-0.5">
              View source, README, and full skill documentation.
            </p>
          </div>
          <a
            href={`${SKILLS_REPO_URL}/tree/master/skills`}
            target="_blank"
            rel="noreferrer"
            className="text-sm text-primary hover:underline inline-flex items-center gap-1 shrink-0"
          >
            <span className="material-symbols-outlined text-[16px]">open_in_new</span>
            View on GitHub
          </a>
        </div>
      </Card>

    </div>
  );
}
