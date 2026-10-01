// Unit coverage for the jailbreak injector across every wire shape the
// gateway accepts. The E2E harness can only observe the shape its fake
// provider is wired for, so this is where Claude's top-level `system` and
// Gemini's `system_instruction` are actually pinned down.
//
// Runs against the built output, so build first:
//   npm run build --workspace=syns4033router-backend && node scripts/verify-inject-jailbreak.mjs
import { pathToFileURL } from "node:url";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const mod = join(here, "..", "backend", "dist", "middleware", "jailbreak.js");
const { injectJailbreak } = await import(pathToFileURL(mod).href);

const M = "UNIT_MARKER";
let fail = 0;
const t = (name, body, check) => {
  const out = injectJailbreak(JSON.parse(JSON.stringify(body)), M);
  const ok = check(out);
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${name}`);
  if (!ok) { fail++; console.log(`        got: ${JSON.stringify(out).slice(0, 160)}`); }
};

console.log("=== injectJailbreak unit (semua shape) ===\n");

t("OpenAI chat (tidak ada system)",
  { messages: [{ role: "user", content: "hi" }] },
  (b) => b.messages[0].role === "system" && b.messages[0].content === M);

t("OpenAI chat (system ada -> append)",
  { messages: [{ role: "system", content: "ctx" }, { role: "user", content: "hi" }] },
  (b) => b.messages[0].content === `ctx\n[GODMODE]: ${M}`);

t("Claude system = string",
  { system: "ctx", messages: [{ role: "user", content: "hi" }] },
  (b) => b.system === `ctx\n[GODMODE]: ${M}` && b.messages[0].role === "user");

t("Claude system = block array",
  { system: [{ type: "text", text: "ctx" }], messages: [{ role: "user", content: "hi" }] },
  (b) => b.system.length === 2 && b.system[1].text === M);

// A body with only `messages` is indistinguishable from OpenAI chat, so the
// messages branch is the right (and only) guess.
t("body tanpa system -> messages ( indistinguishable dari OpenAI)",
  { messages: [{ role: "user", content: "hi" }] },
  (b) => b.messages[0].role === "system" && b.messages[0].content === M);

t("Gemini system_instruction.parts (ada ctx)",
  { system_instruction: { parts: [{ text: "ctx" }] }, contents: [{ role: "user", parts: [{ text: "hi" }] }] },
  (b) => b.system_instruction.parts.length === 2 && b.system_instruction.parts[1].text === M);

t("Gemini systemInstruction (camelCase)",
  { systemInstruction: { parts: [] }, contents: [] },
  (b) => b.systemInstruction.parts.length === 1 && b.systemInstruction.parts[0].text === M);

t("Gemini tanpa instruction block",
  { contents: [{ role: "user", parts: [{ text: "hi" }] }] },
  (b) => b.system_instruction.parts[0].text === M);

t("Responses input",
  { input: [{ role: "user", content: "hi" }] },
  (b) => b.input[0].role === "system");

const once = injectJailbreak({ messages: [{ role: "user", content: "hi" }] }, M);
const twice = injectJailbreak(once, M);
const count = (twice.messages[0].content.match(/GODMODE/g) || []).length;
t("idempoten: retry tidak menumpuk", twice, () => count === 1 && twice.messages.length === 2);


// Antigravity wraps the whole Gemini payload in body.request
// (open-sse/translator/request/antigravity-to-openai.js). This shape fell
// through every branch, so the prompt was silently dropped for that provider.
t("Antigravity wrapper, systemInstruction camel",
  { project: "p", model: "gemini-pro", request: { systemInstruction: { parts: [{ text: "ctx" }] }, contents: [{ role: "user", parts: [{ text: "hi" }] }] } },
  (b) => b.request.systemInstruction.parts.some((x) => x.text?.includes(M)));
t("Antigravity wrapper, system_instruction snake",
  { model: "gemini-pro", request: { system_instruction: { parts: [{ text: "ctx" }] }, contents: [] } },
  (b) => b.request.system_instruction.parts.some((x) => x.text === M));
t("Antigravity wrapper, no instruction block",
  { model: "gemini-pro", request: { contents: [{ role: "user", parts: [{ text: "hi" }] }] } },
  (b) => b.request.system_instruction?.parts?.[0]?.text === M);

// An empty system string should not leave a bare leading newline.
t("Claude empty system has no leading newline",
  { system: "", messages: [{ role: "user", content: "hi" }] },
  (b) => b.system === `[GODMODE]: ${M}`);

console.log(`\n=== ${13 - fail}/13 pass ===`);
process.exit(fail ? 1 : 0);
