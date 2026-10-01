#!/usr/bin/env node
/**
 * Secure-by-default gate.
 *
 * Both switches below are read with a bare truthiness test by their callers:
 *   backend/src/middleware/auth.ts   `if (!requireLogin ...) return next()`
 *   backend/src/sse/handlers/*.js    `if (settings.requireApiKey) { ... }`
 *
 * So omitting either key from DEFAULT_SETTINGS does not disable the feature —
 * it silently inverts it. That is how requireApiKey left every /v1 endpoint
 * open until 6fb7f14. A missing default must fail here, not in production.
 *
 * Env overrides are allowed to loosen these (ENABLE_* / REQUIRE_*), but only
 * when explicitly set — that is a deliberate operator action, not a default.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname.replace(/\/$/, "");
const FILE = join(ROOT, "backend/src/lib/db/repos/settingsRepo.js");
const src = readFileSync(FILE, "utf8");

// The block closes with `\n };` — a leading space is not optional.
const DEFAULT_BLOCK = src.match(/const DEFAULT_SETTINGS = \{([\s\S]*?)\n\s*\};/);
if (!DEFAULT_BLOCK) {
  console.error("[guard] could not locate DEFAULT_SETTINGS in settingsRepo.js");
  process.exit(1);
}
const body = DEFAULT_BLOCK[1];

// Truthy value inside DEFAULT_SETTINGS only; the env overrides live elsewhere.
// The keys are indented, so anchor on leading whitespace, not column 0.
const required = [
  ["requireLogin", /^\s*requireLogin:\s*true\s*,/m, "dashboard login"],
  ["requireApiKey", /^\s*requireApiKey:\s*true\s*,/m, "LLM surface (/v1)"],
];

const missing = required.filter(([, re]) => !re.test(body));
if (missing.length === 0) {
  console.log("[guard] clean — requireLogin and requireApiKey both default to true");
  process.exit(0);
}
for (const [key] of missing) {
  console.error(
    `[guard] ${key} is not defaulted to true — every reader treats it as falsy, ` +
    `which opens the ${required.find((r) => r[0] === key)[2]} to unauthenticated access.`,
  );
}
console.error(`\n[guard] ${missing.length} insecure default(s)`);
process.exit(1);
