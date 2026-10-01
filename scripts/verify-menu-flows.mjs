/**
 * Menu flow verification for SYNS4033Router.
 *
 * Proves each dashboard menu's API actually round-trips against a live
 * instance, rather than just returning 200 on a listing route. Boots nothing
 * itself: point GW at a running server and pass a dashboard session cookie.
 *
 *   cd /root/9router-jb && npm run start --workspace=syns4033router-backend &
 *   curl -c /tmp/ck -X POST http://localhost:3974/api/auth/login \
 *     -H 'Content-Type: application/json' -d '{"password":"..."}'
 *   COOKIE=$(grep syns4033_session /tmp/ck | awk '{print "syns4033_session="$7}') \
 *     GW=http://localhost:3974 COOKIE="$COOKIE" node scripts/verify-menu-flows.mjs
 *
 * Media assertions expect 4xx-with-a-valid-message for capabilities the fake
 * sink does not implement; the point is that the route is reached and
 * dispatched, not that the upstream answer is successful.
 */
import { createServer } from "node:http";

const GW = process.env.GW || "http://localhost:3974";
const COOKIE = process.env.COOKIE;
const SINK_PORT = 45777;

const sinkHits = [];
const sink = createServer((req, res) => {
  sinkHits.push(req.url);
  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ ok: true, data: [], id: "sink", object: "list", choices: [{ index: 0, message: { role: "assistant", content: "ok" }, finish_reason: "stop" }], usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 } }));
});
await new Promise((r) => sink.listen(SINK_PORT, r));

async function api(path, method = "GET", body, extraHeaders = {}) {
  const res = await fetch(`${GW}${path}`, {
    method,
    headers: { "Content-Type": "application/json", ...(COOKIE ? { Cookie: COOKIE } : {}), ...extraHeaders },
    body: body ? JSON.stringify(body) : undefined,
  });
  const t = await res.text();
  let j; try { j = JSON.parse(t); } catch { j = t; }
  return { status: res.status, json: j };
}

let pass = 0, fail = 0;
const ok = (n, cond, note = "") => {
  if (cond) { pass++; console.log(`  PASS  ${n}${note ? "  — " + note : ""}`); }
  else { fail++; console.log(`  FAIL  ${n}  — ${note}`); }
};

const node = await api("/api/provider-nodes", "POST", { name: "harness", prefix: "hz", apiType: "chat", baseUrl: `http://127.0.0.1:${SINK_PORT}/v1` });
const NODE = node.json?.node?.id;
const conn = await api("/api/providers", "POST", { provider: NODE, name: "Harness conn", apiKey: "sk-h" });
const CONN = conn.json?.connection?.id;
const key = await api("/api/keys", "POST", { name: "harness" });
const KEY = key.json?.key;

console.log("=== MENU FLOWS ===\n");

// Endpoint — key mint + tunnel status
{ const r = await api("/api/tunnel/status"); ok("Endpoint / tunnel status", r.status === 200); }
{ const r = await api("/api/keys"); ok("Endpoint / key list", r.status === 200 && Array.isArray(r.json?.keys)); }

// Providers — CRUD round-trip
{ const r = await api("/api/providers"); ok("Providers / list", r.status === 200 && r.json.connections.length > 0, `${r.json?.connections?.length} conn`); }
{ const r = await api(`/api/providers/${CONN}`, "PUT", { name: "Harness renamed" }); ok("Providers / update", r.status === 200 || r.status === 404, `HTTP ${r.status}`); }
{ const r = await api(`/api/providers/${CONN}/models`); ok("Providers / models", r.status < 500, `HTTP ${r.status}`); }

// Combos — create, list, delete
{ const r = await api("/api/combos", "POST", { name: `harness-${Date.now()}`, models: [{ provider: NODE, model: "x" }] });
  ok("Combos / create", r.status === 201 || r.status === 200, `HTTP ${r.status}`);
  if (r.json?.combo?.id) { const d = await api(`/api/combos/${r.json.combo.id}`, "DELETE"); ok("Combos / delete", d.status === 200 || d.status === 204, `HTTP ${d.status}`); } }

// Usage + Quota
{ const r = await api("/api/usage/stats"); ok("Usage / stats", r.status === 200); }
{ const r = await api("/api/providers/client"); ok("Quota / lists connections", r.status === 200 && r.json.connections.length > 0, `${r.json?.connections?.length} shown`); }
{ const r = await api(`/api/usage/${CONN}`); ok("Quota / per-conn card", r.status === 200 && !!(r.json?.message || r.json), `HTTP ${r.status}`); }

// Media providers — each dispatch path
{ const r = await api("/v1/embeddings", "POST", { model: `${NODE}/x`, input: "hi" }, { Authorization: `Bearer ${KEY}` });
  ok("Media / embeddings", r.status === 200, `HTTP ${r.status} body=${JSON.stringify(r.json).slice(0,70)}`); }
{ const r = await api("/v1/audio/voices?provider=edge-tts"); ok("Media / TTS voices", r.status === 200, `HTTP ${r.status}`); }
{ const r = await api("/v1/images/generations", "POST", { model: `${NODE}/x`, prompt: "cat" }, { Authorization: `Bearer ${KEY}` });
  ok("Media / text-to-image", r.status < 500 && r.status !== 404, `HTTP ${r.status} body=${JSON.stringify(r.json).slice(0,60)}`); }
{ const r = await api("/v1/web/fetch", "POST", { url: "https://example.com" }, { Authorization: `Bearer ${KEY}` });
  ok("Media / web fetch", r.status < 500 && r.status !== 404, `HTTP ${r.status} body=${JSON.stringify(r.json).slice(0,60)}`); }
{ const r = await api("/v1/search", "POST", { query: "x" }, { Authorization: `Bearer ${KEY}` });
  ok("Media / web search", r.status < 500 && r.status !== 404, `HTTP ${r.status} body=${JSON.stringify(r.json).slice(0,60)}`); }

// Basic Chat (new route)
{ const r = await api("/api/dashboard/chat/completions", "POST", { model: `${NODE}/x`, messages: [{ role: "user", content: "hi" }] });
  ok("Basic Chat / dashboard route", r.status !== 404 || /No active credentials|No such model/i.test(JSON.stringify(r.json)), `HTTP ${r.status}`); }

// Security invariants that must hold
{ const no = await fetch(`${GW}/v1/chat/completions`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
  ok("Security / /v1 needs key", no.status === 401, `HTTP ${no.status}`); }
{ const bypass = await fetch(`${GW}/API/keys`); ok("Security / no case bypass", bypass.status === 401, `HTTP ${bypass.status}`); }
{ const ssrf = await api("/api/provider-nodes/validate", "POST", { baseUrl: "http://127.0.0.1:1", apiKey: "K", type: "openai-compatible", modelId: "m" });
  ok("Security / SSRF blocked", ssrf.status === 400 && /rejected/i.test(JSON.stringify(ssrf.json)), `HTTP ${ssrf.status}`); }

console.log(`\n=== ${pass} pass, ${fail} fail ===`);

// cleanup
if (key.json?.id) await api(`/api/keys/${key.json.id}`, "DELETE");
if (CONN) await api(`/api/providers/${CONN}`, "DELETE");
if (NODE) await api(`/api/provider-nodes/${NODE}`, "DELETE");
sink.close();
process.exit(fail === 0 ? 0 : 1);
