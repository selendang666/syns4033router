import {
  getSystemPromptById,
  updateSystemPrompt,
  deleteSystemPrompt,
} from "../../../lib/localDb.js";

export const dynamic = "force-dynamic";

// GET /api/system-prompts/:id
export async function GET_handler(req, res, { params }) {
  try {
    const { id } = await params;
    const sp = await getSystemPromptById(id);
    if (!sp) return res.status(404).json({ error: "Not found" });
    return res.json(sp);
  } catch (error) {
    console.error("[SystemPrompts] get failed:", error?.message || error);
    return res.status(500).json({ error: "Failed to fetch system prompt" });
  }
}

// PUT /api/system-prompts/:id — update fields or toggle isActive/injectLive
// body: partial { displayName?, modelTarget?, prompt?, isActive?, injectLive? }
export async function PUT_handler(req, res, { params }) {
  try {
    const { id } = await params;
    const body = req.body || {};
    const sp = await getSystemPromptById(id);
    if (!sp) return res.status(404).json({ error: "Not found" });

    const updated = await updateSystemPrompt(id, body);
    return res.json(updated);
  } catch (error) {
    console.error("[SystemPrompts] update failed:", error?.message || error);
    return res.status(500).json({ error: error?.message || "Failed to update system prompt" });
  }
}

// DELETE /api/system-prompts/:id
export async function DELETE_handler(req, res, { params }) {
  try {
    const { id } = await params;
    const ok = await deleteSystemPrompt(id);
    if (!ok) return res.status(404).json({ error: "Not found" });
    return res.json({ ok: true });
  } catch (error) {
    console.error("[SystemPrompts] delete failed:", error?.message || error);
    return res.status(500).json({ error: "Failed to delete system prompt" });
  }
}
