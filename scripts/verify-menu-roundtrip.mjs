/**
 * Menu round-trip audit against a live router.
 *
 * Each menu gets create -> read -> update -> delete, using the verb the
 * frontend actually sends. Listing alone proves nothing: a menu can list fine
 * and fail on the first write. Verbs are taken from the frontend call sites,
 * not guessed — a PATCH against a route that only exports PUT returns 404 and
 * reads as a break when it is not one.
 *
 *   curl -c /tmp/ck -X POST $GW/api/auth/login -H 'Content-Type: application/json' \
 *     -d '{"password":"..."}'
 *   GW=... COOKIE="syns4033_session=..." node scripts/verify-menu-roundtrip.mjs
 */
const GW = process.env.GW || "http://localhost:3001";
const COOKIE = process.env.COOKIE || "";
const TAG = process.env.TAG || "rt-" + Date.now();

const results = [];
function record(menu, check, ok, detail) {
  results.push({ menu, check, ok, detail: detail || "" });
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${menu.padEnd(16)} ${check}${ok || !detail ? "" : "\n          → " + String(detail).slice(0, 150)}`);
}

async function api(path, { method = "GET", body, headers = {} } = {}) {
  const res = await fetch(GW + path, {
    method,
    headers: { "Content-Type": "application/json", Cookie: COOKIE, ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { /* not json */ }
  return { status: res.status, json, text: text.slice(0, 200) };
}

async function roundTrip(menu, { listPath, create, update, remove, createdKey }) {
  const before = await api(listPath);
  const n0 = Array.isArray(before.json) ? before.json.length
    : (before.json?.items ?? before.json?.rows ?? before.json?.[createdKey] ?? []).length;
  record(menu, "list", before.status === 200, before.status);

  let created = null;
  if (create) {
    const c = await api(create.path, { method: create.method || "POST", body: create.body });
    record(menu, "create", c.status >= 200 && c.status < 300, `${c.status} ${c.text}`);
    // Create responses are not uniform: system-prompts and keys return the id
    // at the top level, proxy-pools wraps it in { proxyPool: { id } }. Look in
    // all of them or the delete step silently never runs and the harness leaves
    // its own rows behind.
    created = c.json?.id ?? c.json?.data?.id ?? null;
    if (!created && c.json) {
      const wrapper = Object.values(c.json).find(
        (v) => v && typeof v === "object" && typeof v.id === "string",
      );
      if (wrapper) created = wrapper.id;
    }
  }

  if (created) {
    const one = await api(listPath.replace(/\?.*$/, "").replace(/\/$/, "") + "/" + created);
    record(menu, "read one", one.status === 200, `${one.status} ${one.text}`);

    if (update) {
      const u = await api(update.path.replace(":id", created), {
        method: update.method || "PUT",
        body: update.body,
      });
      record(menu, "update", u.status >= 200 && u.status < 300, `${u.status} ${u.text}`);
    }

    if (remove) {
      const d = await api(remove.path.replace(":id", created), { method: remove.method || "DELETE" });
      record(menu, "delete", d.status >= 200 && d.status < 300, `${d.status} ${d.text}`);
    }
  }

  const after = await api(listPath);
  const n1 = Array.isArray(after.json) ? after.json.length
    : (after.json?.items ?? after.json?.rows ?? after.json?.[createdKey] ?? []).length;
  record(menu, "back to start", n1 === n0, `${n0} → ${n1}`);
}

console.log(`=== MENU ROUND-TRIP against ${GW} (tag ${TAG}) ===\n`);

await roundTrip("system-prompt", {
  listPath: "/api/system-prompts", createdKey: "prompts",
  create: { path: "/api/system-prompts", body: { modelTarget: TAG, prompt: "rt probe", displayName: TAG } },
  update: { path: `/api/system-prompts/:id`, method: "PUT", body: { prompt: "rt probe v2" } },
  remove: { path: "/api/system-prompts/:id" },
});

await roundTrip("keys", {
  listPath: "/api/keys", createdKey: "keys",
  create: { path: "/api/keys", body: { name: TAG } },
  remove: { path: "/api/keys/:id" },
});

await roundTrip("combos", {
  listPath: "/api/combos", createdKey: "combos",
  create: { path: "/api/combos", body: { name: TAG, models: [] } },
  update: { path: `/api/combos/:id`, method: "PUT", body: { name: TAG + "-v2" } },
  remove: { path: "/api/combos/:id" },
});

await roundTrip("proxy-pools", {
  listPath: "/api/proxy-pools", createdKey: "proxyPools",
  create: { path: "/api/proxy-pools", body: { name: TAG, proxyUrl: "http://127.0.0.1:8080" } },
  update: { path: `/api/proxy-pools/:id`, method: "PUT", body: { name: TAG + "-v2" } },
  remove: { path: "/api/proxy-pools/:id" },
});

// Read-only menus: any non-5xx means the handler ran.
console.log("");
for (const [menu, path] of [
  ["endpoint", "/api/settings"],
  ["providers", "/api/provider-nodes"],
  ["usage", "/api/models/availability"],
  ["quota", "/api/providers/client"],
  ["console-log", "/api/translator/console-logs"],
  ["cli-tools", "/api/cli-tools/all-statuses"],
  ["automation", "/api/automation/ammail"],
  ["mitm", "/api/cli-tools/all-statuses"],
  ["media", "/api/media-providers/tts/voices?provider=edge-tts"],
  ["docs", "/api/health"],
  ["settings", "/api/settings/database"],
  ["remote", "/api/tunnel/status"],
]) {
  const r = await api(path);
  record(menu, "reachable", r.status < 500, `${r.status} ${r.text}`);
}

const failed = results.filter((r) => !r.ok);
console.log(`\n=== ${results.length - failed.length}/${results.length} pass ===`);
if (failed.length) {
  console.log("gagal:");
  for (const f of failed) console.log(`  ${f.menu} · ${f.check} — ${f.detail}`);
}
process.exit(failed.length ? 1 : 0);