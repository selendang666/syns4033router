
import { getSettings, updateSettings } from "../../lib/localDb.js";
import { applyOutboundProxyEnv } from "../../lib/network/outboundProxy.js";
import { resetComboRotation } from "../../../open-sse/services/combo.js";
import bcrypt from "bcryptjs";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const SETTINGS_RESPONSE_HEADERS = {
  "Cache-Control": "no-store"
};

export async function GET(req, res) {
  try {
    const settings = await getSettings();
    const { password, oidcClientSecret, ...safeSettings } = settings;
    safeSettings.oidcConfigured = !!(safeSettings.oidcIssuerUrl && safeSettings.oidcClientId && oidcClientSecret);
    
    // Env wins only when actually set. Reading these straight from env
    // discarded the stored value, so toggling either switch in the UI wrote to
    // the DB and the GET still reported false — the Translator menu could then
    // never be enabled from the dashboard at all.
    const enableRequestLogs = process.env.ENABLE_REQUEST_LOGS !== undefined
      ? process.env.ENABLE_REQUEST_LOGS === "true"
      : safeSettings.enableRequestLogs === true;
    const enableTranslator = process.env.ENABLE_TRANSLATOR !== undefined
      ? process.env.ENABLE_TRANSLATOR === "true"
      : safeSettings.enableTranslator === true;
    
    res.set(SETTINGS_RESPONSE_HEADERS);
    return res.json({ 
      ...safeSettings, 
      enableRequestLogs,
      enableTranslator,
      hasPassword: !!password,
      initialPasswordConfigured: !!process.env.INITIAL_PASSWORD,
      passwordConfigured: !!password || !!process.env.INITIAL_PASSWORD,
    });
  } catch (error) {
    console.log("Error getting settings:", error);
    return res.status(500).json({ error: error.message });
  }
}

// Security-critical switches. These are read as booleans but the frontend
// reads them with `!== false`, so anything that is not exactly `false` shows as
// enabled in the UI — while auth.ts reads `?? false`, where null reads as
// disabled. Storing a non-boolean opened the whole dashboard while the toggle
// still said "Require login: on". Normalise at the boundary instead of trusting
// the caller: a real toggle sends a boolean, anything else is a mistake.
const BOOLEAN_SETTINGS = [
  "requireLogin",
  "requireApiKey",
  "tunnelDashboardAccess",
  "outboundProxyEnabled",
  "cavemanEnabled",
  "enableObservability",
  "enableRequestLogs",
  "enableTranslator",
  "debugMitm",
  "debugRoutes",
];

function coerceBooleans(body) {
  for (const key of BOOLEAN_SETTINGS) {
    if (!Object.prototype.hasOwnProperty.call(body, key)) continue;
    const value = body[key];
    if (typeof value === "boolean") continue;
    if (value === null || value === undefined) {
      // Absent means "not configured", and every one of these defaults to on
      // where it gates access — so fall back to true rather than false.
      body[key] = true;
      continue;
    }
    if (typeof value === "string") {
      const lowered = value.trim().toLowerCase();
      if (["true", "1", "yes", "on"].includes(lowered)) { body[key] = true; continue; }
      if (["false", "0", "no", "off", ""].includes(lowered)) { body[key] = false; continue; }
    }
    body[key] = Boolean(value);
  }
}

export async function PATCH_handler(req, res) {
  try {
    const body = req.body;
    coerceBooleans(body);

    // If updating password, hash it
    if (body.newPassword) {
      const settings = await getSettings();
      const currentHash = settings.password;

      // Verify current password if it exists
      if (currentHash) {
        if (!body.currentPassword) {
          return res.status(400).json({ error: "Current password required" });
        }
        const isValid = await bcrypt.compare(body.currentPassword, currentHash);
        if (!isValid) {
          return res.status(401).json({ error: "Invalid current password" });
        }
      } else {
        // The request is already authenticated; no old password exists yet.
        delete body.currentPassword;
      }

      const salt = await bcrypt.genSalt(10);
      body.password = await bcrypt.hash(body.newPassword, salt);
      delete body.newPassword;
      delete body.currentPassword;
    }

    if (Object.prototype.hasOwnProperty.call(body, "oidcClientSecret")) {
      if (!body.oidcClientSecret || !String(body.oidcClientSecret).trim()) {
        delete body.oidcClientSecret;
      }
    }

    const settings = await updateSettings(body);

    // Apply outbound proxy settings immediately (no restart required)
    if (
      Object.prototype.hasOwnProperty.call(body, "outboundProxyEnabled") ||
      Object.prototype.hasOwnProperty.call(body, "outboundProxyUrl") ||
      Object.prototype.hasOwnProperty.call(body, "outboundNoProxy")
    ) {
      applyOutboundProxyEnv(settings);
    }

    // Invalidate combo rotation state when strategy settings change
    if (
      Object.prototype.hasOwnProperty.call(body, "comboStrategy") ||
      Object.prototype.hasOwnProperty.call(body, "comboStickyRoundRobinLimit") ||
      Object.prototype.hasOwnProperty.call(body, "comboStrategies")
    ) {
      resetComboRotation();
    }

    const { password, oidcClientSecret, ...safeSettings } = settings;
    safeSettings.oidcConfigured = !!(safeSettings.oidcIssuerUrl && safeSettings.oidcClientId && oidcClientSecret);
    res.set(SETTINGS_RESPONSE_HEADERS);
    return res.json(safeSettings);
  } catch (error) {
    console.log("Error updating settings:", error);
    return res.status(500).json({ error: error.message });
  }
}
