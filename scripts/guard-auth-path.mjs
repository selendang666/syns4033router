#!/usr/bin/env node
/**
 * Regression gate for the auth-path bug class that reached production.
 *
 * Express matches its app.use() mount points case-insensitively, so "/API/keys"
 * reaches the /api handlers. A case-sensitive `req.path === "/api/"` guard lets
 * it past the middleware entirely — that was a full unauthenticated bypass of
 * the dashboard API (settings/database plaintext credentials, key minting, and
 * PATCH requireLogin:false to disable auth for everyone). See aa0440b.
 *
 * Runs in the verify `test` phase, so a regression fails before deploy.
 *
 * Deliberately narrow. An earlier revision also flagged `const res = await
 * fetch()` shadowing and produced 11 candidates, none of which were proven to
 * crash — a shadow inside a block that only ever reads the fetch response is
 * harmless. A gate that cries wolf gets deleted, so that rule is not here;
 * grep for it instead.
 */
import { readdirSync, statSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname.replace(/\/$/, "");
const SCAN = ["backend/src", "backend/open-sse"].map((d) => join(ROOT, d));
const SKIP = new Set(["node_modules", "dist", "__pycache__"]);

/**
 * The real signature is an assignment, not a comparison: the handler binds
 * `const path = req.path` and every prefix check then runs against `path`.
 * Matching on `req.path ===` alone missed it entirely — which is exactly what
 * reintroducing the bug and re-running this guard proved.
 */
const RAW_BINDING = /\b(?:const|let)\s+(\w+)\s*=\s*req\.path\s*;/;
const NORMALISED = /\b(?:const|let)\s+\w+\s*=\s*req\.path\.toLowerCase\(\)/;
const CHECKS_A_VAR = /\b(\w+)\s*(?:===|\.startsWith\()/g;

const violations = [];
let scanned = 0;

const walk = (dir) => {
  for (const entry of readdirSync(dir)) {
    if (SKIP.has(entry)) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full);
    else if (/\.(?:js|ts|mjs|cjs)$/.test(entry)) scan(full);
  }
};

function scan(file) {
  scanned++;
  const src = readFileSync(file, "utf8");
  const lines = src.split("\n");

  const raw = src.match(RAW_BINDING);
  if (!raw) return;
  // Already normalised elsewhere in the file — nothing to catch.
  if (NORMALISED.test(src)) return;
  // Only a real finding if the bound variable is then used in a check.
  if (![...src.matchAll(CHECKS_A_VAR)].some((m) => m[1] === raw[1])) return;

  const i = lines.findIndex((l) => RAW_BINDING.test(l));
  violations.push({ file: relative(ROOT, file), line: i + 1, text: lines[i].trim() });
}

for (const dir of SCAN) {
  // Only a missing tree is tolerated — a blanket catch turns a real crash in
  // scan() into a clean bill of health.
  try { walk(dir); } catch (e) { if (e?.code !== "ENOENT") throw e; }
}

if (violations.length === 0) {
  console.log(`[guard] clean — ${scanned} files, no case-sensitive req.path guard`);
  process.exit(0);
}
for (const v of violations) {
  console.error(`[guard] case-sensitive req.path  ${v.file}:${v.line}\n         ${v.text}`);
}
console.error(`\n[guard] ${violations.length} violation(s)`);
process.exit(1);
