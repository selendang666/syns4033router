// Public API barrel — all DB functions
import { getAdapter } from "./driver.js";
import { stringifyJson, parseJson } from "./helpers/jsonCol.js";

// Settings
export {
  getSettings, updateSettings, isCloudEnabled, getCloudUrl, exportSettings,
} from "./repos/settingsRepo.js";

// Provider connections
export {
  getProviderConnections, getProviderConnectionById,
  createProviderConnection, updateProviderConnection, updateProviderConnectionByEmail,
  deleteProviderConnection, deleteProviderConnectionsByProvider,
  deleteProviderConnectionByEmailAndProvider,
  reorderProviderConnections, cleanupProviderConnections,
} from "./repos/connectionsRepo.js";

// Provider nodes
export {
  getProviderNodes, getProviderNodeById,
  createProviderNode, updateProviderNode, deleteProviderNode,
} from "./repos/nodesRepo.js";

// Proxy pools
export {
  getProxyPools, getProxyPoolById,
  createProxyPool, updateProxyPool, deleteProxyPool,
} from "./repos/proxyPoolsRepo.js";

// API keys
export {
  getApiKeys, getApiKeyById, createApiKey, updateApiKey, deleteApiKey, validateApiKey,
} from "./repos/apiKeysRepo.js";

// Combos
export {
  getCombos, getComboById, getComboByName,
  createCombo, updateCombo, deleteCombo,
} from "./repos/combosRepo.js";

// Aliases (model + custom + mitm)
export {
  getModelAliases, setModelAlias, deleteModelAlias,
  getCustomModels, addCustomModel, deleteCustomModel,
  getMitmAlias, setMitmAliasAll,
} from "./repos/aliasRepo.js";

// Pricing
export {
  getPricing, getPricingForModel, updatePricing, resetPricing, resetAllPricing,
} from "./repos/pricingRepo.js";

// Disabled models
export {
  getDisabledModels, getDisabledByProvider, disableModels, enableModels,
} from "./repos/disabledModelsRepo.js";

// Usage
export {
  statsEmitter, trackPendingRequest, getActiveRequests,
  saveRequestUsage, getUsageHistory, getUsageStats, getChartData,
  appendRequestLog, getRecentLogs,
} from "./repos/usageRepo.js";

// Request details
export {
  saveRequestDetail, getRequestDetails, getRequestDetailById,
} from "./repos/requestDetailsRepo.js";

// System prompts (GODMODE JB library, per-model + global wildcard)
export {
  getSystemPrompts, getSystemPromptById, getSystemPromptForModel, GLOBAL_TARGET,
  createSystemPrompt, updateSystemPrompt, deleteSystemPrompt,
} from "./repos/systemPromptsRepo.js";

// Export/import full DB
export async function exportDb() {
  const db = await getAdapter();
  const { exportSettings } = await import("./repos/settingsRepo.js");
  const [providerConnections, providerNodes, proxyPools, apiKeys, combos] = await Promise.all([
    db.all(`SELECT * FROM providerConnections`),
    db.all(`SELECT * FROM providerNodes`),
    db.all(`SELECT * FROM proxyPools`),
    db.all(`SELECT * FROM apiKeys`),
    db.all(`SELECT * FROM combos`),
  ]);

  const out = {
    settings: await exportSettings(),
    providerConnections: providerConnections.map((r) => ({ ...parseJson(r.data, {}), id: r.id, provider: r.provider, authType: r.authType, name: r.name, email: r.email, priority: r.priority, isActive: r.isActive === 1 || r.isActive === true, createdAt: r.createdAt, updatedAt: r.updatedAt })),
    providerNodes: providerNodes.map((r) => ({ ...parseJson(r.data, {}), id: r.id, type: r.type, name: r.name, createdAt: r.createdAt, updatedAt: r.updatedAt })),
    proxyPools: proxyPools.map((r) => ({ ...parseJson(r.data, {}), id: r.id, isActive: r.isActive === 1 || r.isActive === true, testStatus: r.testStatus, createdAt: r.createdAt, updatedAt: r.updatedAt })),
    apiKeys: apiKeys.map((r) => ({ id: r.id, key: r.key, name: r.name, machineId: r.machineId, isActive: r.isActive === 1 || r.isActive === true, createdAt: r.createdAt })),
    combos: combos.map((r) => ({ id: r.id, name: r.name, kind: r.kind, models: parseJson(r.models, []), createdAt: r.createdAt, updatedAt: r.updatedAt })),
    modelAliases: {},
    customModels: [],
    mitmAlias: {},
    pricing: {},
  };

  for (const r of await db.all(`SELECT key, value FROM kv WHERE scope = 'modelAliases'`)) out.modelAliases[r.key] = parseJson(r.value);
  for (const r of await db.all(`SELECT key, value FROM kv WHERE scope = 'customModels'`)) out.customModels.push(parseJson(r.value));
  for (const r of await db.all(`SELECT key, value FROM kv WHERE scope = 'mitmAlias'`)) out.mitmAlias[r.key] = parseJson(r.value);
  for (const r of await db.all(`SELECT key, value FROM kv WHERE scope = 'pricing'`)) out.pricing[r.key] = parseJson(r.value);

  return out;
}

export async function importDb(payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new Error("Invalid database payload");
  }

  // This function wipes every table before it writes anything back. An empty or
  // half-shaped file therefore does not fail — it succeeds, and leaves the
  // router with no keys, no providers, no settings and no combos. Everything is
  // checked here first, before the first DELETE.
  // exportDb writes four of these as objects and six as lists, so the check has
  // to know which is which — requiring a list for modelAliases rejected a
  // perfectly good backup of this very router.
  const ARRAY_COLLECTIONS = [
    "providerConnections",
    "providerNodes",
    "proxyPools",
    "apiKeys",
    "combos",
    "customModels",
  ];
  const OBJECT_COLLECTIONS = ["settings", "modelAliases", "mitmAlias", "pricing"];
  const present = [...ARRAY_COLLECTIONS, ...OBJECT_COLLECTIONS].filter(
    (k) => payload[k] !== undefined,
  );
  if (present.length === 0) {
    throw new Error(
      `This file does not look like a SYNS4033Router backup — none of ${
        [...ARRAY_COLLECTIONS, ...OBJECT_COLLECTIONS].join(", ")
      } are present. Nothing was changed.`,
    );
  }
  for (const key of present) {
    if (OBJECT_COLLECTIONS.includes(key)) {
      if (typeof payload[key] !== "object" || Array.isArray(payload[key])) {
        throw new Error(`Backup field "${key}" must be an object. Nothing was changed.`);
      }
      continue;
    }
    if (!Array.isArray(payload[key])) {
      throw new Error(`Backup field "${key}" must be a list. Nothing was changed.`);
    }
    for (const [i, row] of payload[key].entries()) {
      if (!row || typeof row !== "object" || Array.isArray(row)) {
        throw new Error(`Backup field "${key}" has a bad entry at index ${i}. Nothing was changed.`);
      }
    }
  }

  const db = await getAdapter();

  await db.transaction(async () => {
    // Wipe all tables (keep _meta)
    await db.run(`DELETE FROM settings`);
    await db.run(`DELETE FROM providerConnections`);
    await db.run(`DELETE FROM providerNodes`);
    await db.run(`DELETE FROM proxyPools`);
    await db.run(`DELETE FROM apiKeys`);
    await db.run(`DELETE FROM combos`);
    await db.run(`DELETE FROM kv WHERE scope IN ('modelAliases', 'customModels', 'mitmAlias', 'pricing')`);

    // Settings
    if (payload.settings) {
      await db.run(`INSERT INTO settings(id, data) VALUES(1, ?) ON CONFLICT(id) DO UPDATE SET data = excluded.data`, [stringifyJson(payload.settings)]);
    }

    for (const c of payload.providerConnections || []) {
      const { id, provider, authType, name, email, priority, isActive, createdAt, updatedAt, ...rest } = c;
      await db.run(
        `INSERT INTO providerConnections(id, provider, authType, name, email, priority, isActive, data, createdAt, updatedAt) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [id, provider, authType || "oauth", name || null, email || null, priority || null, isActive === false ? 0 : 1, stringifyJson(rest), createdAt || new Date().toISOString(), updatedAt || new Date().toISOString()]
      );
    }
    for (const n of payload.providerNodes || []) {
      const { id, type, name, createdAt, updatedAt, ...rest } = n;
      await db.run(
        `INSERT INTO providerNodes(id, type, name, data, createdAt, updatedAt) VALUES(?, ?, ?, ?, ?, ?)`,
        [id, type || null, name || null, stringifyJson(rest), createdAt || new Date().toISOString(), updatedAt || new Date().toISOString()]
      );
    }
    for (const p of payload.proxyPools || []) {
      const { id, isActive, testStatus, createdAt, updatedAt, ...rest } = p;
      await db.run(
        `INSERT INTO proxyPools(id, isActive, testStatus, data, createdAt, updatedAt) VALUES(?, ?, ?, ?, ?, ?)`,
        [id, isActive === false ? 0 : 1, testStatus || "unknown", stringifyJson(rest), createdAt || new Date().toISOString(), updatedAt || new Date().toISOString()]
      );
    }
    for (const k of payload.apiKeys || []) {
      await db.run(
        `INSERT INTO apiKeys(id, key, name, machineId, isActive, createdAt) VALUES(?, ?, ?, ?, ?, ?)`,
        [k.id, k.key, k.name || null, k.machineId || null, k.isActive === false ? 0 : 1, k.createdAt || new Date().toISOString()]
      );
    }
    for (const c of payload.combos || []) {
      await db.run(
        `INSERT INTO combos(id, name, kind, models, createdAt, updatedAt) VALUES(?, ?, ?, ?, ?, ?)`,
        [c.id, c.name, c.kind || null, stringifyJson(c.models || []), c.createdAt || new Date().toISOString(), c.updatedAt || new Date().toISOString()]
      );
    }
    for (const [a, m] of Object.entries(payload.modelAliases || {})) {
      await db.run(`INSERT INTO kv(scope, key, value) VALUES('modelAliases', ?, ?)`, [a, stringifyJson(m)]);
    }
    for (const m of payload.customModels || []) {
      const k = `${m.providerAlias}|${m.id}|${m.type || "llm"}`;
      await db.run(`INSERT INTO kv(scope, key, value) VALUES('customModels', ?, ?)`, [k, stringifyJson(m)]);
    }
    for (const [tool, mappings] of Object.entries(payload.mitmAlias || {})) {
      await db.run(`INSERT INTO kv(scope, key, value) VALUES('mitmAlias', ?, ?)`, [tool, stringifyJson(mappings || {})]);
    }
    for (const [provider, models] of Object.entries(payload.pricing || {})) {
      await db.run(`INSERT INTO kv(scope, key, value) VALUES('pricing', ?, ?)`, [provider, stringifyJson(models || {})]);
    }
  });

  return await exportDb();
}

// Eager init helper (optional)
export async function initDb() {
  await getAdapter();
}

// Automation (CodeBuddy & Ammail)
export {
  listCodeBuddyAccounts, getCodeBuddyAccount, insertCodeBuddyAccount,
  bulkDeleteCodeBuddyAccounts, deleteCodeBuddyAccount, markCodeBuddyRunning,
  markCodeBuddySuccess, markCodeBuddyError, markCanvaEnrolled,
  createCodeBuddyJob, getCodeBuddyJob, updateCodeBuddyJobStatus, updateCodeBuddyJobResult,
  insertAmmailOtp, findLatestAmmailOtp, markAmmailOtpUsed, listAmmailOtps,
  getAmmailOtp, deleteAmmailOtp, deleteAmmailOtpsBulk
} from "./repos/automationRepo.js";
