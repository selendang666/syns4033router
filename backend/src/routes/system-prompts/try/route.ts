// Import paths are resolved against the BUILT file
// (backend/dist/routes/system-prompts/try), because tsc mirrors src/ into
// dist/ and the relative depth differs by one level. A wrong depth is not a
// type error — it kills the whole boot with "Failed to import N route file(s)",
// so these are computed, not counted. open-sse/ is not compiled and stays at
// the package root, hence the extra level.
import { handleChat } from "../../../sse/handlers/chat.js";
import { initTranslators } from "../../../../open-sse/translator/index.js";
import { injectJailbreak } from "../../../middleware/jailbreak.js";
import { getSystemPromptById } from "../../../lib/localDb.js";

/**
 * POST /api/system-prompts/try
 * The playground: send a prompt + a user message to a model, optionally
 * compare against the same message with no system prompt, so the operator can
 * see what the jailbreak actually changes instead of guessing.
 *
 * body: {
 *   model, message,
 *   prompt?,        // raw prompt to try
 *   entryId?,       // or a saved library entry to try
 *   compare?,       // also run a no-prompt baseline (default true)
 *   stream?         // ignored — always buffered so both sides can be compared
 * }
 *
 * Both legs go through the real handleChat(), so what is measured here is the
 * same code path production uses. The prompted leg injects via the same
 * injectJailbreak() as chatCore, so the test cannot drift from live behaviour.
 */
export const dynamic = "force-dynamic";

let initialized = false;
async function ensureInitialized() {
  if (!initialized) {
    await initTranslators();
    initialized = true;
  }
}

const MAX_MESSAGE = 8000;
const MAX_PROMPT = 32000;

  function toWebRequest(req, body, extraHeaders = {}) {
    const url = `${req.protocol}://${req.get("host")}/v1/chat/completions`;
    return new Request(url, {
      method: "POST",
      headers: new Headers({ "content-type": "application/json", ...extraHeaders }),
      body: JSON.stringify(body),
    });
  }

/** Run one leg and normalise whatever shape comes back into plain text. */
async function runLeg(req, { model, message, systemPrompt }) {
  const messages = systemPrompt
    ? injectJailbreak({ messages: [{ role: "user", content: message }] }, systemPrompt).messages
    : [{ role: "user", content: message }];

  // Without this header the handler re-injects the very entry this leg is
  // meant to be contrasted against, and the baseline comes back identical to
  // the prompted one — the comparison then proves nothing.
  const headers = systemPrompt ? {} : { "x-skip-system-prompt": "1" };
  const response = await handleChat(
    toWebRequest(req, { model, messages, stream: false, max_tokens: 512 }, headers),
    null,
    { authAlreadyChecked: true },
  );

  if (response instanceof Response) {
    if (response.status >= 400) {
      const raw = await response.text().catch(() => "");
      let message = raw;
      try { message = JSON.parse(raw)?.error?.message || raw; } catch { /* keep raw */ }
      return { ok: false, status: response.status, output: message };
    }
    const data = await response.json().catch(() => null);
    return { ok: true, output: data?.choices?.[0]?.message?.content ?? JSON.stringify(data) };
  }
  return { ok: false, status: 500, output: "No response from router" };
}

export async function POST_handler(req, res) {
  try {
    await ensureInitialized();

    const { model, message, prompt, entryId, compare = true } = req.body || {};
    if (!model || typeof model !== "string") {
      return res.status(400).json({ error: "model is required" });
    }
    if (!message || typeof message !== "string" || !message.trim()) {
      return res.status(400).json({ error: "message is required" });
    }
    if (message.length > MAX_MESSAGE) {
      return res.status(400).json({ error: `message too long (max ${MAX_MESSAGE})` });
    }

    let systemPrompt = typeof prompt === "string" ? prompt.trim() : "";
    if (entryId) {
      const entry = await getSystemPromptById(entryId);
      if (!entry) return res.status(404).json({ error: "system prompt entry not found" });
      systemPrompt = entry.prompt;
    }
    if (systemPrompt.length > MAX_PROMPT) {
      return res.status(400).json({ error: `prompt too long (max ${MAX_PROMPT})` });
    }

    const startedAt = Date.now();
    const withPrompt = systemPrompt
      ? await runLeg(req, { model, message, systemPrompt })
      : null;
    const baseline = compare
      ? await runLeg(req, { model, message, systemPrompt: null })
      : null;

    return res.json({
      model,
      usedEntryId: entryId || null,
      compared: Boolean(compare),
      withPrompt,
      baseline,
      durationMs: Date.now() - startedAt,
    });
  } catch (error) {
    console.error("[SystemPrompts] try failed:", error?.message || error);
    return res.status(500).json({ error: error?.message || "Playground run failed" });
  }
}
