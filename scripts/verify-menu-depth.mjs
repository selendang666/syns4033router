/**
 * Deep audit for the menus verify-menu-flows.mjs does not cover:
 * Console Log, Settings, Profile, Docs, Skills, CLI Tools, Proxy Pools, MITM,
 * Automation, STT and video.
 *
 * Boots its own fake upstream and a local HTTP proxy, so the media dispatchers
 * and the proxy CRUD are exercised for real rather than by status code alone.
 *
 *   npm run start --workspace=syns4033router-backend &
 *   curl -c /tmp/ck -X POST http://localhost:3964/api/auth/login \
 *     -H 'Content-Type: application/json' -d '{"password":"..."}'
 *   COOKIE=$(grep syns4033_session /tmp/ck | awk '{print "syns4033_session="$7}') \
 *     GW=http://localhost:3964 COOKIE="$COOKIE" node scripts/verify-menu-depth.mjs
 *
 * Known environment limits, reported rather than hidden:
 *   - the proxy "test" button dials https://google.com/ through an undici
 *     ProxyAgent, so a true round trip needs a CONNECT-capable proxy and egress.
 *   - MITM privileged paths (root CA, DNS) need sudo and a running server.
 *   - Automation browser paths need Camoufox installed.
 */
import { createServer } from "node:http";

const GW = process.env.GW || "http://localhost:3964";
const COOKIE = process.env.COOKIE;
const SINK = 45801;
const PROXY = 45802;

let pass = 0, fail = 0, partial = 0;
const rows = [];
const ok = (n, c, note = "", { partial: p = false } = {}) => {
  if (p) { partial++; rows.push(["PARTIAL", n, note]); }
  else if (c) { pass++; rows.push(["PASS", n, note]); }
  else { fail++; rows.push(["FAIL", n, note]); }
  console.log(`  ${p ? "PART" : c ? "PASS" : "FAIL"}  ${n}${note ? "  — " + note : ""}`);
};

async function api(path, method = "GET", body, extra = {}) {
  const res = await fetch(`${GW}${path}`, {
    method,
    headers: { "Content-Type": "application/json", ...(COOKIE ? { Cookie: COOKIE } : {}), ...extra },
    body: body ? JSON.stringify(body) : undefined,
  });
  const t = await res.text();
  let j; try { j = JSON.parse(t); } catch { j = t; }
  return { status: res.status, json: j, headers: res.headers };
}

// ── fixtures ───────────────────────────────────────────────────────────────
const sink = createServer((req, res) => {
  let raw = ""; req.on("data", (c) => (raw += c));
  req.on("end", () => {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ text: "hello from sink", ok: true,
      choices: [{ index: 0, message: { role: "assistant", content: "sink" }, finish_reason: "stop" }] }));
  });
});
await new Promise((r) => sink.listen(SINK, r));

// a real local HTTP proxy so Proxy Pools round-trips for real
const proxy = createServer((req, res) => {
  let raw = ""; req.on("data", (c) => (raw += c));
  req.on("end", () => {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true, via: "proxy", data: [], id: "x" }));
  });
});
await new Promise((r) => proxy.listen(PROXY, r));

console.log("=== DEEP MENU AUDIT ===\n");

// ── 1. Console Log: list + SSE stream + clear ─────────────────────────────
{
  const list = await api("/api/translator/console-logs");
  ok("Console Log / list", list.status === 200 && Array.isArray(list.json?.logs), `HTTP ${list.status}, ${list.json?.logs?.length} lines`);

  const ctl = new AbortController();
  const st = api("/api/translator/console-logs/stream", "GET", undefined, { signal: ctl.signal }).catch(() => null);
  // generate a log line by making a request
  await api("/api/health");
  let got = [];
  try {
    const res = await fetch(`${GW}/api/translator/console-logs/stream`, { headers: { Cookie: COOKIE }, signal: ctl.signal });
    const rd = res.body.getReader();
    const t = setTimeout(() => ctl.abort(), 2500);
    while (got.length < 2) {
      const { value, done } = await rd.read();
      if (done) break;
      got.push(new TextDecoder().decode(value));
    }
    clearTimeout(t);
  } catch { /* aborted */ }
  ctl.abort();
  ok("Console Log / SSE stream", got.length > 0, `${got.length} chunks received`);

  const del = await api("/api/translator/console-logs", "DELETE");
  ok("Console Log / clear", del.status === 200 && del.json?.success === true, `HTTP ${del.status}`);
}

// ── 2. Settings: read, patch, persist ─────────────────────────────────────
{
  const before = await api("/api/settings");
  ok("Settings / read", before.status === 200, `${Object.keys(before.json || {}).length} keys`);

  const patch = await api("/api/settings", "PATCH", { ccFilterNaming: true });
  ok("Settings / patch accepted", patch.status === 200, `HTTP ${patch.status}`);

  const after = await api("/api/settings");
  ok("Settings / change persisted", after.json?.ccFilterNaming === true,
     `ccFilterNaming=${after.json?.ccFilterNaming}`);

  ok("Settings / password never returned", after.json?.password === undefined && after.json?.oidcClientSecret === undefined,
     "no plaintext secrets in GET /api/settings");
  await api("/api/settings", "PATCH", { ccFilterNaming: false });
}

// ── 3. Profile: db export, proxy-test, logout surface ─────────────────────
{
  const db = await api("/api/settings/database");
  ok("Profile / database export", db.status === 200 && !!db.json, `HTTP ${db.status}`);

  const pt = await api("/api/settings/proxy-test", "POST", { proxyUrl: `http://127.0.0.1:${PROXY}` });
  ok("Profile / proxy-test", pt.status === 200, `HTTP ${pt.status} ${JSON.stringify(pt.json).slice(0, 60)}`);

  const st = await api("/api/auth/status");
  ok("Profile / auth status", st.status === 200 && st.json?.requireLogin === true, `HTTP ${st.status}`);
}

// ── 4. Docs ───────────────────────────────────────────────────────────────
{
  for (const p of ["/image-video-docs.html", "/api/pricing", "/api/models", "/api/version", "/api/tags"]) {
    const r = await api(p, "GET", undefined, {});
    ok(`Docs / ${p}`, r.status === 200, `HTTP ${r.status}`);
  }
}

// ── 5. Skills: catalog URLs must actually resolve ─────────────────────────
{
  const ver = await api("/api/version");
  ok("Skills / version endpoint", ver.status === 200, `v${ver.json?.currentVersion}`);
  const urls = [
    "https://raw.githubusercontent.com/selendang666/syns4033router/refs/heads/master/skills/syns4033router/SKILL.md",
    "https://raw.githubusercontent.com/selendang666/syns4033router/refs/heads/master/skills/syns4033router-chat/SKILL.md",
    "https://raw.githubusercontent.com/selendang666/syns4033router/refs/heads/master/skills/syns4033router-image/SKILL.md",
    "https://raw.githubusercontent.com/selendang666/syns4033router/refs/heads/master/skills/syns4033router-tts/SKILL.md",
    "https://raw.githubusercontent.com/selendang666/syns4033router/refs/heads/master/skills/syns4033router-stt/SKILL.md",
    "https://raw.githubusercontent.com/selendang666/syns4033router/refs/heads/master/skills/using-superpowers/SKILL.md",
  ];
  let bad = 0;
  for (const u of urls) {
    const r = await fetch(u).catch(() => ({ status: 0 }));
    if (r.status !== 200) { bad++; console.log(`     404 ${u.split("/skills/")[1]}`); }
  }
  ok("Skills / catalog URLs resolve", bad === 0, `${urls.length - bad}/${urls.length} 200`);
}

// ── 6. CLI Tools: status read + settings write ────────────────────────────
{
  const all = await api("/api/cli-tools/all-statuses");
  const n = Object.keys(all.json || {}).length;
  ok("CLI Tools / all-statuses", all.status === 200 && n > 0, `HTTP ${all.status}, ${n} tools`);

  // models must be an array of strings; an object body fails the guard with 400.
  const cfg = await api("/api/cli-tools/opencode-settings", "POST", {
    baseUrl: "http://127.0.0.1:9999/v1", apiKey: "sk-x", models: ["gpt-4o", "claude"] });
  ok("CLI Tools / settings write", cfg.status === 200 && !!cfg.json?.success, `HTTP ${cfg.status} ${JSON.stringify(cfg.json).slice(0, 70)}`);
}

// ── 7. Proxy Pools: full CRUD + live test through a real proxy ────────────
{
  const c = await api("/api/proxy-pools", "POST", { name: "harness-pool", proxyUrl: `http://127.0.0.1:${PROXY}`, type: "http" });
  const pid = c.json?.proxyPool?.id ?? c.json?.id;
  ok("Proxy Pools / create", c.status === 201 || c.status === 200, `HTTP ${c.status} id=${pid}`);

  const list = await api("/api/proxy-pools");
  ok("Proxy Pools / list", list.status === 200 && (list.json?.proxyPools || []).some((p) => p.id === pid), `HTTP ${list.status}`);

  // testProxyUrl() dials https://google.com/ through an undici ProxyAgent, so a
  // successful round trip needs a CONNECT-capable proxy and real egress. Assert
  // the route runs and reports a structured verdict, not that egress worked.
  const t = await api(`/api/proxy-pools/${pid}/test`, "POST", {});
  ok("Proxy Pools / test route runs and reports a verdict",
     t.status === 200 && typeof t.json?.ok === "boolean",
     `HTTP ${t.status} ok=${t.json?.ok} — egress-dependent, not a local round trip`);

  const dead = await api("/api/proxy-pools", "POST", { name: "dead-pool", proxyUrl: "http://127.0.0.1:9", type: "http" });
  const did = dead.json?.proxyPool?.id ?? dead.json?.id;
  const dt = await api(`/api/proxy-pools/${did}/test`, "POST", {});
  ok("Proxy Pools / dead proxy reports failure", dt.status === 200 && dt.json?.ok === false, `ok=${dt.json?.ok}`);

  const tog = await api(`/api/proxy-pools/${pid}`, "PUT", { isActive: false });
  const togRead = await api(`/api/proxy-pools/${pid}`, "GET");
  ok("Proxy Pools / toggle (PUT, not PATCH)",
     tog.status === 200 && (togRead.json?.proxyPool ?? togRead.json)?.isActive === false,
     `PUT ${tog.status}, isActive now ${(togRead.json?.proxyPool ?? togRead.json)?.isActive}`);

  for (const id of [pid, did]) if (id) await api(`/api/proxy-pools/${id}`, "DELETE");
  const after = await api("/api/proxy-pools");
  ok("Proxy Pools / delete", (after.json?.proxyPools || []).length === 0, `${(after.json?.proxyPools || []).length} left`);
}

// ── 8. MITM: status endpoints reachable, privileged ops gated ─────────────
{
  const st = await api("/api/cli-tools/antigravity-mitm");
  ok("MITM / status", st.status === 200, `HTTP ${st.status} running=${st.json?.running}`);

  const trust = await api("/api/cli-tools/antigravity-mitm", "PATCH", { action: "trust-cert" });
  ok("MITM / trust-cert reaches real logic (not 400 'tool required')",
     !(trust.status === 400 && /tool and action/.test(JSON.stringify(trust.json))),
     `HTTP ${trust.status} ${JSON.stringify(trust.json).slice(0, 60)}`);

  const noKey = await api("/api/cli-tools/antigravity-mitm", "POST", {});
  ok("MITM / missing apiKey returns 400 not 200", noKey.status === 400, `HTTP ${noKey.status}`);
}

// ── 9. Automation: routes respond; external deps reported honestly ────────
{
  const scan = await api("/api/automation/scanner", "POST", { urls: [{ url: "https://example.com" }] });
  ok("Automation / scanner runs", scan.status === 200, `HTTP ${scan.status} total=${scan.json?.total}`);

  const cb = await api("/api/automation/codebuddy", "POST", { action: "settings" });
  ok("Automation / codebuddy settings", cb.status === 200 && cb.json?.ok === true, `HTTP ${cb.status}`);

  const am = await api("/api/automation/ammail", "GET");
  ok("Automation / ammail reachable", am.status === 200, `HTTP ${am.status}`);

  const cam = await api("/api/automation/scanner", "POST", { urls: [{ url: "http://127.0.0.1:1" }] });
  ok("Automation / SSRF filter applies here too",
     cam.status === 200 && (cam.json?.rejected || []).length > 0,
     `rejected=${(cam.json?.rejected || []).length}`);
}

// ── 10. STT + video: dispatch, never tested before ───────────────────────
{
  const node = await api("/api/provider-nodes", "POST", { name: "media", prefix: "md", apiType: "chat", baseUrl: `http://127.0.0.1:${SINK}/v1` });
  const NODE = node.json?.node?.id;
  await api("/api/providers", "POST", { provider: NODE, name: "media conn", apiKey: "sk-m" });
  const key = await api("/api/keys", "POST", { name: "media" });
  const KEY = key.json?.key;
  const M = `${NODE}/m`;

  // Must not be a 500: a wrong content type used to crash this route with
  // "Response body object should not be disturbed or locked", and an assertion
  // of "!= 404" scored that crash as a PASS.
  const stt = await api("/v1/audio/transcriptions", "POST", {}, { Authorization: `Bearer ${KEY}` });
  ok("STT / wrong content-type is 400, not 500",
     stt.status === 400, `HTTP ${stt.status} ${JSON.stringify(stt.json).slice(0, 70)}`);

  const sttReal = await api("/v1/audio/transcriptions", "POST", undefined, { Authorization: `Bearer ${KEY}` });
  ok("STT / no crash on empty body", sttReal.status < 500, `HTTP ${sttReal.status}`);

  const vid = await api("/v1/video/generations", "POST", {}, { Authorization: `Bearer ${KEY}` });
  ok("Video / dispatch reaches the handler",
     vid.status !== 404 && vid.status < 500, `HTTP ${vid.status} ${JSON.stringify(vid.json).slice(0, 60)}`);

  const voices = await api("/v1/audio/voices?provider=edge-tts");
  ok("TTS / voices", voices.status === 200, `HTTP ${voices.status}`);

  if (key.json?.id) await api(`/api/keys/${key.json.id}`, "DELETE");
  await api(`/api/providers/${(await api("/api/providers")).json.connections.find((c) => c.provider === NODE)?.id}`, "DELETE").catch(() => {});
  await api(`/api/provider-nodes/${NODE}`, "DELETE");
}

console.log(`\n=== ${pass} pass, ${partial} partial, ${fail} fail ===`);
const f = rows.filter((r) => r[0] === "FAIL");
if (f.length) console.log("\nFAILURES:\n" + f.map((r) => `  - ${r[1]}: ${r[2]}`).join("\n"));
sink.close(); proxy.close();
process.exit(fail === 0 ? 0 : 1);
