
import { getCombos, createCombo, getComboByName } from "../../lib/localDb.js";

export const dynamic = "force-dynamic";

// Validate combo name: only a-z, A-Z, 0-9, -, _
const VALID_NAME_REGEX = /^[a-zA-Z0-9_.\-]+$/;

// A combo's models reach routing code that assumes strings — it calls
// modelStr.includes(). Anything else passed through here reached that code
// verbatim and surfaced as "modelStr.includes is not a function" to the caller.
// An empty list passed too, then failed at request time with "Invalid model
// format", which says nothing about the real problem.
export function validateComboModels(models) {
  if (models === undefined) return { ok: true };
  if (!Array.isArray(models)) return { ok: false, error: "Models must be an array" };
  if (models.length === 0) return { ok: false, error: "Add at least one model to the combo" };
  if (!models.every((m) => typeof m === "string" && m.trim().length > 0)) {
    return { ok: false, error: "Each model must be a non-empty string" };
  }
  return { ok: true };
}

// GET /api/combos - Get all combos
export async function GET(req, res) {
  try {
    const combos = await getCombos();
    return res.json({ combos });
  } catch (error) {
    console.log("Error fetching combos:", error);
    return res.status(500).json({ error: "Failed to fetch combos" });
  }
}

// POST /api/combos - Create new combo
export async function POST_handler(req, res) {
  try {
    const body = req.body;
    const { name, models, kind } = body;

    if (!name) {
      return res.status(400).json({ error: "Name is required" });
    }

    // Validate name format
    if (!VALID_NAME_REGEX.test(name)) {
      return res.status(400).json({ error: "Name can only contain letters, numbers, -, _ and ." });
    }

    // Check if name already exists
    const existing = await getComboByName(name);
    if (existing) {
      return res.status(400).json({ error: "Combo name already exists" });
    }

    const modelsCheck = validateComboModels(models);
    if (!modelsCheck.ok) {
      return res.status(400).json({ error: modelsCheck.error });
    }

    const combo = await createCombo({ name, models: models || [], kind: kind || null });

    return res.status(201).json(combo);
  } catch (error) {
    console.log("Error creating combo:", error);
    return res.status(500).json({ error: "Failed to create combo" });
  }
}
