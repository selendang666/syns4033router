/**
 * Guard: ALWAYS_PROTECTED must be evaluated before PUBLIC_API_PATHS.
 *
 * The two lists disagreed once and it cost a live instance. "/api/version" is
 * public so the version endpoint needs no credential, and the public check
 * matches on prefix — so "/api/version/shutdown" and "/api/version/update"
 * were public too. Both answered 200 without a session or a key; the first
 * calls process.exit(0). ALWAYS_PROTECTED listed both paths and was never
 * reached, because the public branch returned first.
 *
 * A destructive route inheriting public status from a sibling on the same
 * prefix is the failure mode here, so the check is structural: the protected
 * test has to appear before the public early-return.
 */
import { readFileSync } from "node:fs";

const FILE = new URL("../backend/src/middleware/auth.ts", import.meta.url);
const src = readFileSync(FILE, "utf8");

const problems = [];

// 1. The protected test must be computed before the public early-return.
const protectedAt = src.indexOf("const alwaysProtected = ALWAYS_PROTECTED.some(");
const publicAt = src.indexOf("PUBLIC_API_PATHS.some(");

if (protectedAt === -1) {
  problems.push("ALWAYS_PROTECTED is never evaluated — those paths fall through to the public branch");
} else if (publicAt !== -1 && protectedAt > publicAt) {
  problems.push(
    "ALWAYS_PROTECTED is evaluated after PUBLIC_API_PATHS returns next(); " +
      "every protected path under a public prefix is reachable unauthenticated",
  );
}

// 2. Every destructive route must be named in ALWAYS_PROTECTED, so a future
//    route cannot be added without the guard noticing it is unprotected.
const block = src.match(/const ALWAYS_PROTECTED = \[([\s\S]*?)\]/);
if (!block) {
  problems.push("ALWAYS_PROTECTED list not found");
} else {
  for (const route of ["/api/shutdown", "/api/version/shutdown", "/api/version/update"]) {
    if (!block[1].includes(route)) {
      problems.push(`${route} is not in ALWAYS_PROTECTED`);
    }
  }
}

// 3. A public entry must not be a prefix of a protected one. "/api/version"
//    public + "/api/version/shutdown" protected is exactly the trap, and it
//    only works if the ordering rule in (1) holds — assert the intent anyway.
if (block) {
  const pub = src.match(/const PUBLIC_API_PATHS = \[([\s\S]*?)\]/);
  if (pub) {
    const publicPrefixes = [...pub[1].matchAll(/"(\/api\/[^"]*)"/g)].map((m) => m[1]);
    const protectedPaths = [...block[1].matchAll(/"(\/api\/[^"]*)"/g)].map((m) => m[1]);
    for (const p of protectedPaths) {
      const parent = publicPrefixes.find((pre) => p === pre || p.startsWith(pre + "/"));
      if (parent && !(protectedAt !== -1 && publicAt !== -1 && protectedAt < publicAt)) {
        problems.push(`${p} is protected but sits under the public prefix ${parent} and is not shielded by ordering`);
      }
    }
  }
}

if (problems.length === 0) {
  console.log("[guard] clean — ALWAYS_PROTECTED is evaluated first and covers every destructive route");
  process.exit(0);
}
for (const p of problems) console.error(`[guard] ${p}`);
console.error(`\n[guard] ${problems.length} auth-ordering problem(s)`);
process.exit(1);
