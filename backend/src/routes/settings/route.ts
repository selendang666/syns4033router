
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

    // The password and the OIDC secret were the only two that were ever removed.
    // Every other credential in the settings row — proxy password, webhook
    // secret, Cloudflare tokens, the Telegram bot token — came back in plain text
    // to anyone holding a dashboard session, on every GET. They are dropped and
    // replaced with a boolean so the UI can still show what is configured.
    const SECRET_SETTING_KEYS = [
      "codebuddy_proxy_password",
      "ammail_webhook_secret",
      "ammail_cf_api_token",
      "ammail_cf_telegram_bot_token",
      "codebuddy_2captcha_api_key",
      "ammail_api_key",
    ];
    for (const key of SECRET_SETTING_KEYS) {
      if (!(key in safeSettings)) continue;
      const value = safeSettings[key];
      safeSettings[`${key.replace(/([A-Z])/g, "_$1").toLowerCase()}Configured`] =
        !!value && String(value).length > 0;
      delete safeSettings[key];
    }
    
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
        // Nothing is stored yet, so there is no current password to compare
        // against. "Already authenticated" was not enough: on a fresh deploy the
        // only thing protecting the dashboard is INITIAL_PASSWORD, and this let
        // any live session install a password of its own without ever naming it.
        // Set the secret in the environment instead.
        return res.status(409).json({
          error:
            "No dashboard password is stored yet. Set INITIAL_PASSWORD in the environment and restart, then sign in with it.",
        });
      }

      const salt = await bcrypt.genSalt(10);
      body.password = await bcrypt.hash(body.newPassword, salt);
      delete body.newPassword;
      delete body.currentPassword;
    }

    // A secret that arrives empty is almost always the form echoing back a field
    // it could not read, not a request to erase the stored value. GET no longer
    // returns these, so without this the first save of any unrelated setting on
    // the profile page would wipe them.
    const SECRET_WRITE_KEYS = [
      "oidcClientSecret",
      "codebuddy_proxy_password",
      "ammail_webhook_secret",
      "ammail_cf_api_token",
      "ammail_cf_telegram_bot_token",
      "codebuddy_2captcha_api_key",
      "ammail_api_key",
    ];
    for (const key of SECRET_WRITE_KEYS) {
      if (!Object.prototype.hasOwnProperty.call(body, key)) continue;
      if (!body[key] || !String(body[key]).trim()) {
        delete body[key];
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
