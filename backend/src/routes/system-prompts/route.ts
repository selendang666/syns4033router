import {
  getSystemPrompts,
  getSystemPromptById,
  createSystemPrompt,
  updateSystemPrompt,
  deleteSystemPrompt,
  GLOBAL_TARGET,
} from "../../lib/localDb.js";

export const dynamic = "force-dynamic";

// GET /api/system-prompts?liveOnly=true|false — list library
export async function GET(req, res) {
  try {
    const liveOnly = req.query?.liveOnly === "true";
    const prompts = await getSystemPrompts({ liveOnly });
    // isGlobal lets the panel render the wildcard entry distinctly.
    return res.json({
      prompts: prompts.map((p) => ({ ...p, isGlobal: p.modelTarget === GLOBAL_TARGET })),
    });
  } catch (error) {
    console.error("[SystemPrompts] list failed:", error?.message || error);
    return res.status(500).json({ error: "Failed to fetch system prompts" });
  }
}

// POST /api/system-prompts — create entry
// body: { displayName?, modelTarget, prompt, isActive?, injectLive? }
// modelTarget "*" creates the global entry applied to every provider/model.
export async function POST_handler(req, res) {
  try {
    const { displayName, modelTarget, prompt, isActive, injectLive } = req.body || {};
    if (!modelTarget || typeof modelTarget !== "string") {
      return res.status(400).json({ error: "modelTarget is required" });
    }
    if (!prompt || typeof prompt !== "string" || !prompt.trim()) {
      return res.status(400).json({ error: "prompt is required" });
    }

    // One entry per model target — reject duplicate
    const existing = await getSystemPrompts({});
    if (existing.some((p) => p.modelTarget === modelTarget)) {
      return res.status(409).json({ error: `System prompt already exists for model "${modelTarget}"` });
    }

    const created = await createSystemPrompt({
      displayName: displayName || modelTarget,
      modelTarget,
      prompt,
      isActive: isActive !== false,
      injectLive: injectLive === true,
    });
    return res.status(201).json(created);
  } catch (error) {
    console.error("[SystemPrompts] create failed:", error?.message || error);
    return res.status(500).json({ error: error?.message || "Failed to create system prompt" });
  }
}
