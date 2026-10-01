import { injectJailbreak } from "../backend/dist/middleware/jailbreak.js";

const M = "UNIT_MARKER";
const MARKER = "[GODMODE]:";
let fail = 0;

// Injected text always carries the marker now — the idempotency check used to
// look for a string the writers never produced, so it only worked on the paths
// that appended to something already tagged.
const has = (s) => typeof s === "string" && s.includes(M) && s.includes(MARKER);

const t = (name, body, check) => {
  const out = injectJailbreak(JSON.parse(JSON.stringify(body)), M);
  const ok = check(out);
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${name}`);
  if (!ok) { fail++; console.log(`        got: ${JSON.stringify(out).slice(0, 200)}`); }
};

// ---- shape coverage -------------------------------------------------------
console.log("=== shape coverage ===");

t("OpenAI chat messages",
  { messages: [{ role: "user", content: "hi" }] },
  (b) => has(b.messages[0].content) && b.messages[0].role === "system");

t("OpenAI Responses input",
  { input: [{ role: "user", content: "hi" }] },
  (b) => has(b.input[0].content));

t("Claude system string",
  { system: "ctx", messages: [{ role: "user", content: "hi" }] },
  (b) => b.system === `ctx\n${MARKER} ${M}`);

t("Claude system array block",
  { system: [{ type: "text", text: "ctx" }], messages: [] },
  (b) => has(b.system[1].text));

t("Claude system null -> block dibuat",
  { system: null, messages: [] },
  (b) => has(b.system[0].text));

t("Claude system string kosong tanpa newline di depan",
  { system: "", messages: [{ role: "user", content: "hi" }] },
  (b) => b.system === `${MARKER} ${M}`);

// A body with only `messages` is indistinguishable from OpenAI chat, so the
// prompt lands there — asserted explicitly so the ambiguity stays documented.
t("body tanpa system -> messages (indistinguishable dari OpenAI)",
  { messages: [{ role: "user", content: "hi" }] },
  (b) => has(b.messages[0].content));

t("Gemini system_instruction.parts (ada ctx)",
  { system_instruction: { parts: [{ text: "ctx" }] }, contents: [{ role: "user", parts: [{ text: "hi" }] }] },
  (b) => b.system_instruction.parts[0].text === "ctx" && has(b.system_instruction.parts[1].text));

t("Gemini systemInstruction (camelCase)",
  { systemInstruction: { parts: [] }, contents: [] },
  (b) => b.systemInstruction.parts[0].text === `${MARKER} ${M}`);

t("Gemini tanpa instruction block -> snake_case (field yang dibaca REST)",
  { contents: [] },
  (b) => b.system_instruction.parts[0].text === `${MARKER} ${M}`);

// Antigravity nests the whole payload under body.request
// (open-sse/translator/request/antigravity-to-openai.js:6). This shape fell
// through every branch, so the prompt was silently dropped for that provider.
t("Antigravity wrapper, systemInstruction camel",
  { project: "p", model: "gemini-pro", request: { systemInstruction: { parts: [{ text: "ctx" }] }, contents: [{ role: "user", parts: [{ text: "hi" }] }] } },
  (b) => has(b.request.systemInstruction.parts[1].text));

t("Antigravity wrapper, system_instruction snake",
  { model: "gemini-pro", request: { system_instruction: { parts: [{ text: "ctx" }] }, contents: [] } },
  (b) => has(b.request.system_instruction.parts[1].text));

t("Antigravity wrapper, no instruction block",
  { model: "gemini-pro", request: { contents: [{ role: "user", parts: [{ text: "hi" }] }] } },
  (b) => has(b.request.system_instruction.parts[0].text));

// ---- idempotency, every shape, repeated -----------------------------------
// Regression guard: the marker check is dead code unless the write path emits
// the marker, so a retry-safe check has to be proven on each branch.
console.log("\n=== idempotensi (5x injeksi beruntun, tiap shape) ===");

const repeat = (seed, read) => {
  let b = JSON.parse(JSON.stringify(seed));
  for (let i = 0; i < 5; i++) b = injectJailbreak(b, M);
  return read(b);
};

const cases = [
  ["Gemini flat",
   { contents: [{ role: "user", parts: [{ text: "hi" }] }] },
   (b) => b.system_instruction.parts.length === 1],
  ["Antigravity wrapper",
   { request: { contents: [{ role: "user", parts: [{ text: "hi" }] }] } },
   (b) => b.request.system_instruction.parts.length === 1],
  ["Gemini dengan ctx",
   { system_instruction: { parts: [{ text: "ctx" }] }, contents: [] },
   (b) => b.system_instruction.parts.length === 2],
  ["Claude array",
   { system: [{ type: "text", text: "ctx" }], messages: [] },
   (b) => b.system.length === 2],
  ["Claude string",
   { system: "ctx", messages: [] },
   (b) => ((b.system.match(/\[GODMODE\]:/g)) || []).length === 1],
  ["OpenAI messages, tanpa system lama",
   { messages: [{ role: "user", content: "hi" }] },
   (b) => b.messages.length === 2],
  ["OpenAI messages, dengan system lama",
   { messages: [{ role: "system", content: "ctx" }, { role: "user", content: "hi" }] },
   (b) => ((b.messages[0].content.match(/\[GODMODE\]:/g)) || []).length === 1],
  ["OpenAI messages kosong",
   { messages: [] },
   (b) => b.messages.length === 1],
];

for (const [name, seed, check] of cases) {
  const out = repeat(seed, check);
  console.log(`  ${out ? "PASS" : "FAIL"}  retry tidak menumpuk: ${name}`);
  if (!out) fail++;
}

const total = 11 + cases.length;
console.log(`\n=== ${total - fail}/${total} pass ===`);
process.exit(fail ? 1 : 0);