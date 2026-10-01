import { v4 as uuidv4 } from "uuid";
import { getAdapter } from "../driver.js";

function rowToSp(row) {
  if (!row) return null;
  return {
    id: row.id,
    displayName: row.displayName,
    modelTarget: row.modelTarget,
    prompt: row.prompt,
    isActive: row.isActive === 1 || row.isActive === true,
    injectLive: row.injectLive === 1 || row.injectLive === true,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function num(b) { return b === true || b === 1 || b === "1" ? 1 : 0; }

// List all, optionally filtered to injectable live entries.
export async function getSystemPrompts({ liveOnly = false } = {}) {
  const db = await getAdapter();
  const rows = liveOnly
    ? await db.all(`SELECT * FROM systemPrompts WHERE isActive = 1 AND injectLive = 1 ORDER BY modelTarget ASC`)
    : await db.all(`SELECT * FROM systemPrompts ORDER BY createdAt ASC`);
  return rows.map(rowToSp);
}

export async function getSystemPromptById(id) {
  const db = await getAdapter();
  return rowToSp(await db.get(`SELECT * FROM systemPrompts WHERE id = ?`, [id]));
}

// Wildcard target — an entry with modelTarget "*" is the global default that
// applies to every provider/model that has no specific entry of its own.
export const GLOBAL_TARGET = "*";

// Resolve the active + live entry for a model target, at request time.
// Precedence: exact target first, then the global wildcard. Returns the exact
// match on a tie so a per-model entry always beats the global one.
export async function getSystemPromptForModel(modelTarget) {
  const db = await getAdapter();
  const row = await db.get(
    `SELECT * FROM systemPrompts
      WHERE isActive = 1 AND injectLive = 1
        AND (modelTarget = ? OR modelTarget = ?)
      ORDER BY CASE WHEN modelTarget = ? THEN 0 ELSE 1 END
      LIMIT 1`,
    [modelTarget, GLOBAL_TARGET, modelTarget]
  );
  return rowToSp(row);
}

export async function createSystemPrompt(data) {
  const db = await getAdapter();
  const now = new Date().toISOString();
  const sp = {
    id: uuidv4(),
    displayName: data.displayName ?? data.modelTarget,
    modelTarget: data.modelTarget,
    prompt: data.prompt ?? "",
    isActive: data.isActive !== false,
    injectLive: data.injectLive === true,
    createdAt: now,
    updatedAt: now,
  };
  if (!sp.modelTarget) throw new Error("modelTarget is required");
  if (!sp.prompt) throw new Error("prompt is required");
  await db.run(
    `INSERT INTO systemPrompts(id, displayName, modelTarget, prompt, isActive, injectLive, createdAt, updatedAt)
     VALUES(?, ?, ?, ?, ?, ?, ?, ?)`,
    [sp.id, sp.displayName, sp.modelTarget, sp.prompt, num(sp.isActive), num(sp.injectLive), sp.createdAt, sp.updatedAt]
  );
  return sp;
}

export async function updateSystemPrompt(id, data) {
  const db = await getAdapter();
  let result = null;
  await db.transaction(async () => {
    const row = await db.get(`SELECT * FROM systemPrompts WHERE id = ?`, [id]);
    if (!row) return;
    const cur = rowToSp(row);
    const merged = {
      ...cur,
      ...data,
      id,
      updatedAt: new Date().toISOString(),
    };
    await db.run(
      `UPDATE systemPrompts SET displayName = ?, modelTarget = ?, prompt = ?, isActive = ?, injectLive = ?, updatedAt = ? WHERE id = ?`,
      [merged.displayName, merged.modelTarget, merged.prompt, num(merged.isActive), num(merged.injectLive), merged.updatedAt, id]
    );
    result = rowToSp(await db.get(`SELECT * FROM systemPrompts WHERE id = ?`, [id]));
  });
  return result;
}

export async function deleteSystemPrompt(id) {
  const db = await getAdapter();
  const res = await db.run(`DELETE FROM systemPrompts WHERE id = ?`, [id]);
  return (res?.changes ?? 0) > 0;
}
