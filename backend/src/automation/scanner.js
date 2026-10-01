/**
 * Provider health scanner.
 *
 * Runs a lightweight HTTP health check against configured provider endpoints
 * and records the result on each provider connection (status, latency,
 * lastTested, lastError).
 *
 * Config-driven: the list of health URLs to probe comes from
 * `settings.scanner.urls` ( [{ label, url }] ). Each connection can additionally
 * carry a per-connection `healthUrl` or `apiBase` in its JSON `data` — the
 * scanner probes that when the global list doesn't cover the provider. It
 * never fabricates base URLs; providers without a resolvable endpoint are
 * reported as `skipped`, not `dead`.
 */
import { getProviderConnections, updateProviderConnection } from "../models/index.js";

const SCANNER_TIMEOUT_MS = 6000;

function normalizeUrl(raw) {
  if (!raw || typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  // Accept bare host (assume https) or full URL.
  const url = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    return new URL(url).toString().replace(/\/$/, "");
  } catch {
    return null;
  }
}

export async function probeHealth(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), SCANNER_TIMEOUT_MS);
  const t0 = Date.now();
  try {
    const res = await fetch(url, { method: "GET", signal: controller.signal });
    return {
      ok: res.status < 500, // 4xx still means the service is up/reachable
      status: res.status,
      latencyMs: Date.now() - t0,
    };
  } catch (e) {
    return { ok: false, status: 0, latencyMs: Date.now() - t0, error: e?.message || String(e) };
  } finally {
    clearTimeout(timer);
  }
}

export async function runHealthScanner({ extraUrls = [] } = {}) {
  const connections = await getProviderConnections();
  const results = [];

  // Probe any extra configured endpoints (from settings/route) independently.
  for (const entry of extraUrls) {
    const url = normalizeUrl(entry?.url || entry);
    if (!url) continue;
    const health = await probeHealth(url + "/v1/health");
    results.push({
      id: null,
      provider: entry?.label || "external",
      name: entry?.label || null,
      url,
      status: health.ok ? "ok" : "dead",
      httpStatus: health.status,
      latencyMs: health.latencyMs,
      error: health.error || null,
    });
  }

  for (const conn of connections) {
    // Per-connection endpoint (healthUrl or apiBase from connection data) wins.
    let url = normalizeUrl(conn.healthUrl || conn.apiBase);

    if (!url) {
      results.push({
        id: conn.id,
        provider: conn.provider,
        name: conn.name || conn.email || null,
        status: "skipped",
        reason: "no health/endpoint URL configured",
      });
      continue;
    }

    const health = await probeHealth(url + "/v1/health");
    const patch = {
      testStatus: health.ok ? "ok" : "fail",
      lastTested: new Date().toISOString(),
      lastError: health.ok ? null : (health.error ? String(health.error).slice(0, 300) : `HTTP ${health.status}`),
      // Preserve isActive semantics: a reachable endpoint keeps it active.
      isActive: conn.isActive,
    };
    await updateProviderConnection(conn.id, patch);

    results.push({
      id: conn.id,
      provider: conn.provider,
      name: conn.name || conn.email || null,
      url,
      status: health.ok ? "ok" : "dead",
      httpStatus: health.status,
      latencyMs: health.latencyMs,
      error: health.error || null,
    });
  }

  return {
    scannedAt: new Date().toISOString(),
    total: connections.length,
    results,
  };
}
