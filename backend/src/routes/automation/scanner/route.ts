import { getSettings, updateSettings } from "../../../lib/db/repos/settingsRepo.js";
import { runHealthScanner } from "../../../automation/scanner.js";
import { findSsrfReason } from "../../../lib/net/ssrfGuard.js";

export const dynamic = "force-dynamic";

/**
 * GET /api/automation/scanner — run a health scan.
 * Uses `settings.scanner.urls` ( [{ label?, url }] ) plus each provider
 * connection's own healthUrl/apiBase. Returns per-endpoint results.
 */
export async function GET_handler(req: any, res: any) {
  try {
    const settings = await getSettings();
    const urls = (settings?.scanner?.urls) || [];
    const result = await runHealthScanner({ extraUrls: urls });
    return res.status(200).json(result);
  } catch (e: any) {
    console.error("[Scanner] scan failed:", e?.message || e);
    return res.status(500).json({ error: e?.message || "Health scan failed" });
  }
}

/**
 * POST /api/automation/scanner — run a scan against the supplied URLs.
 * Body: { urls: [{ label?, url }] | [string] }
 * Optionally persists them into settings.scanner.urls when `save` is true.
 */
export async function POST_handler(req: any, res: any) {
  try {
    const { urls = [], save = false } = req.body || {};
    if (!Array.isArray(urls)) {
      return res.status(400).json({ error: "urls must be an array" });
    }

    // The scanner fetches every URL it is given and returns status + latency,
    // which is enough to map the internal network by timing and status alone.
    // Filter before persisting, so a rejected URL cannot be stored and then
    // re-scanned on every later GET.
    const rejected: string[] = [];
    const allowed: any[] = [];
    for (const entry of urls) {
      const url = typeof entry === "string" ? entry : entry?.url;
      const reason = url ? await findSsrfReason(url) : "missing url";
      if (reason) rejected.push(`${url ?? "(no url)"}: ${reason}`);
      else allowed.push(entry);
    }

    if (save) {
      const settings = await getSettings();
      await updateSettings({ scanner: { ...(settings?.scanner || {}), urls: allowed } });
    }

    const result = await runHealthScanner({ extraUrls: allowed });
    if (rejected.length > 0) {
      return res.status(200).json({
        ...result,
        rejected: rejected.map((r) => r.split(": ").slice(1).join(": ")),
        rejectedUrls: rejected.map((r) => r.split(": ")[0]),
        total: (result?.total ?? 0) + rejected.length,
      });
    }
    return res.status(200).json(result);
  } catch (e: any) {
    console.error("[Scanner] scan failed:", e?.message || e);
    return res.status(500).json({ error: e?.message || "Health scan failed" });
  }
}
