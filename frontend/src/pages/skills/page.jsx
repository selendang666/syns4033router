
import { Card, Badge } from "@/shared/components";
import { useCopyToClipboard } from "@/shared/hooks/useCopyToClipboard";
import {
  SKILLS,
  SKILLS_REPO_URL,
  getSkillRawUrl,
  getSkillBlobUrl,
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

function SkillRow({ skill }) {
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

      <CopyButton value={url} />
    </div>
  );
}

const API_SKILLS = ["syns4033router-chat", "syns4033router-image", "syns4033router-tts", "syns4033router-stt", "syns4033router-embeddings", "syns4033router-web-search", "syns4033router-web-fetch"];
const AGENT_SKILLS = ["using-superpowers", "multi-brain"];

export default function SkillsPage() {
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
          <SkillRow skill={entrySkill} />
        </section>
      )}

      {/* API Capability Skills */}
      <section className="space-y-2">
        <h2 className="text-xs font-semibold text-text-muted uppercase tracking-wider px-1">API Capabilities</h2>
        <div className="space-y-2">
          {apiSkills.map((skill) => (
            <SkillRow key={skill.id} skill={skill} />
          ))}
        </div>
      </section>

      {/* Agent Workflow Skills */}
      <section className="space-y-2">
        <h2 className="text-xs font-semibold text-text-muted uppercase tracking-wider px-1">Agent Workflow</h2>
        <div className="space-y-2">
          {agentSkills.map((skill) => (
            <SkillRow key={skill.id} skill={skill} />
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
