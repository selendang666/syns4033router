// systemPrompts table — per-model JB/system-prompt library (GODMODE).
// Fresh DBs also get this via m001 (it iterates TABLES), but existing DBs
// stamped at v2 need an explicit migration.
export default {
  version: 3,
  name: "system-prompts",
  up(db) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS systemPrompts (
        id TEXT PRIMARY KEY,
        displayName TEXT,
        modelTarget TEXT NOT NULL,
        prompt TEXT NOT NULL,
        isActive INTEGER DEFAULT 1,
        injectLive INTEGER DEFAULT 0,
        createdAt TEXT NOT NULL,
        updatedAt TEXT NOT NULL,
        UNIQUE(modelTarget)
      )
    `);
    db.exec("CREATE INDEX IF NOT EXISTS idx_sp_model ON systemPrompts(modelTarget)");
    db.exec("CREATE INDEX IF NOT EXISTS idx_sp_active ON systemPrompts(isActive)");
  }
};
