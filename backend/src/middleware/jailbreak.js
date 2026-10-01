/**
 * GODMODE jailbreak system-prompt injection.
 *
 * Inserts the operator-controlled prompt into the request body so it reaches
 * the upstream model as a system instruction.
 *
 * Shape-aware. OpenAI chat uses `messages`, the Responses API uses `input`,
 * and both of the other wire formats carry the system instruction *outside* the
 * turn array: Claude uses a top-level `system` (string or block array) and
 * Gemini uses `system_instruction.parts`. Splicing a system turn into those
 * arrays is wrong — Claude only accepts user/assistant in `messages` and
 * Gemini only user/model in `contents` — so those get their own field.
 *
 * Idempotent: a marker check keeps a retry from stacking the same prompt.
 */

const MARKER = "[GODMODE]:";

function textOf(content) {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) return content.map((c) => (typeof c === "string" ? c : c?.text ?? "")).join("");
  return "";
}

// Insert as the first system message; if one already exists, append so we
// keep any operator-authored system context while GODMODE stays authoritative.
function prependSystem(list, jbPrompt) {
  if (!Array.isArray(list) || list.length === 0) {
    return [{ role: "system", content: jbPrompt }];
  }
  const first = list[0];
  if (first && first.role === "system") {
    const existing = textOf(first.content);
    if (existing.includes(MARKER)) return list; // already injected
    list[0] = { ...first, content: `${existing}\n${MARKER} ${jbPrompt}` };
  } else {
    list.unshift({ role: "system", content: jbPrompt });
  }
  return list;
}

// Claude: `system` is a top-level string or an array of { type, text } blocks.
// Same append-not-replace contract as the chat shape.
function prependClaudeSystem(body, jbPrompt) {
  const sys = body.system;
  if (typeof sys === "string") {
    if (sys.includes(MARKER)) return;
    body.system = `${sys}\n${MARKER} ${jbPrompt}`;
  } else if (Array.isArray(sys)) {
    if (textOf(sys.map((b) => b?.text ?? "")).includes(MARKER)) return;
    body.system = [...sys, { type: "text", text: jbPrompt }];
  } else {
    body.system = [{ type: "text", text: jbPrompt }];
  }
}

// Gemini: system_instruction is { parts: [{ text }] }. The repo already writes
// this shape in open-sse/rtk/caveman.js, so match it.
function prependGeminiSystem(body, jbPrompt) {
  const target = body.request && typeof body.request === "object" ? body.request : body;
  // Prefer whichever spelling the body already uses. When it has neither,
  // default to system_instruction — that is the field name the Gemini REST
  // endpoint actually reads; systemInstruction is the SDK spelling.
  const key = Object.prototype.hasOwnProperty.call(target, "systemInstruction")
    ? "systemInstruction"
    : "system_instruction";
  const existing = target[key];
  if (existing && Array.isArray(existing.parts)) {
    if (textOf(existing.parts.map((p) => p?.text ?? "")).includes(MARKER)) return;
    existing.parts.push({ text: jbPrompt });
  } else {
    target[key] = { parts: [{ text: jbPrompt }] };
  }
}

export function injectJailbreak(body, jbPrompt) {
  if (!body || !jbPrompt) return body;

  // Order matters. A Claude request carries BOTH a top-level `system` and a
  // `messages` array, so the messages check has to come second or it claims
  // the body and the prompt never reaches `system` — which is the only field
  // Claude reads. Same story for Gemini and `contents`.
  if (body.system !== undefined) {
    prependClaudeSystem(body, jbPrompt);
    return body;
  }
  if (body.system_instruction !== undefined || body.systemInstruction !== undefined) {
    prependGeminiSystem(body, jbPrompt);
    return body;
  }
  // OpenAI chat format
  if (Array.isArray(body.messages)) {
    body.messages = prependSystem(body.messages, jbPrompt);
    return body;
  }
  // OpenAI Responses API: input can be a string or array of items
  if (Array.isArray(body.input)) {
    body.input = prependSystem(body.input, jbPrompt);
    return body;
  }
  // Gemini without an explicit instruction block yet
  if (Array.isArray(body.contents)) {
    prependGeminiSystem(body, jbPrompt);
    return body;
  }
  return body;
}
