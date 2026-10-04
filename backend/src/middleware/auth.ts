import { Request, Response, NextFunction } from "express";
import { getDashboardAuthSession } from "../lib/auth/dashboardSession.js";
import { getSettings, validateApiKey } from "../lib/localDb.js";
import { getConsistentMachineId } from "../shared/utils/machineId.js";

const CLI_TOKEN_HEADER = "x-9r-cli-token";
const CLI_TOKEN_SALT = "9r-cli-auth";

let cachedCliToken: string | null = null;
async function getCliToken() {
  if (!cachedCliToken)
    cachedCliToken = await getConsistentMachineId(CLI_TOKEN_SALT);
  return cachedCliToken;
}

async function hasValidCliToken(req: Request) {
  const token = req.headers[CLI_TOKEN_HEADER] as string | undefined;
  if (!token) return false;
  return token === (await getCliToken());
}

/**
 * Collapse the spellings that resolve to the same route so a prefix check
 * cannot be side-stepped: repeated slashes, percent-encoded slashes and dots,
 * and a trailing slash. Express decodes req.path for us, so we decode once more
 * to catch anything that arrived still-encoded.
 */
function normalizePath(raw) {
  let decoded = raw;
  try {
    decoded = decodeURIComponent(raw);
  } catch {
    // Malformed percent-encoding: fall back to the raw path rather than throw.
  }
  const collapsed = decoded.replace(/\/{2,}/g, "/");
  const rooted = collapsed.startsWith("/") ? collapsed : "/" + collapsed;
  return decodeURIComponent(
    rooted.replace(/\/\.\//g, "/").replace(/\/\.$/, "")
  ).replace(/\/+$/, "").toLowerCase();
}

// Public paths — no auth required
const PUBLIC_API_PATHS = [
  "/api/health",
  "/api/init",
  "/api/locale",
  "/api/auth/login",
  "/api/auth/logout",
  "/api/auth/status",
  "/api/version",
  "/api/settings/require-login",
  "/api/automation/ammail/webhook",
];

const PUBLIC_PREFIXES = ["/v1", "/v1beta", "/api/v1", "/api/v1beta"];

// Dashboard accounts carry a role. "user" is a portal account limited to their
// own key and aggregate stats; "admin" owns the router. Admin paths answer 404
// to a user rather than 403 — a 403 confirms the route exists, which is the one
// thing the split is meant to hide.
const ALWAYS_PROTECTED = ["/api/shutdown",
  "/api/settings/database",
  "/api/version/shutdown",
  "/api/version/update",
  "/api/keys",
  "/api/settings",
  "/api/providers",
  "/api/provider-nodes",
  "/api/system-prompts",
  "/api/admin",
  "/api/system-prompts",
  "/api/combos",
  "/api/translator",
  "/api/media-providers",
  "/api/mcp",
  "/api/automation",
  "/api/mitm",
  "/api/proxy-pools",
  "/api/cve",
];

// One list, two gates. ALWAYS_PROTECTED keeps an LLM API key out of the
// dashboard; ADMIN_PATHS additionally keeps a "user"-role session out of it.
// They were maintained separately, which left /api/combos and /api/admin
// reachable with an API key while the role check assumed they were covered.
// A user gets 404 rather than 403: a 403 would confirm the route exists.
const ADMIN_PATHS = ALWAYS_PROTECTED;

const isAdminPath = (path: string) =>
  ADMIN_PATHS.some((p) => path === p || path.startsWith(p + "/"));


const PROTECTED_API_PATHS = [
  "/api/settings",
  "/api/keys",
  "/api/providers",
  "/api/provider-nodes",
  "/api/proxy-pools",
  "/api/combos",
  "/api/models",
  "/api/usage",
  "/api/oauth",
  "/api/media-providers",
  "/api/pricing",
  "/api/tags",
  "/api/tunnel",
  "/api/cli-tools",
  "/api/automation",
];

export async function authMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
) {
  // Normalise before every prefix comparison below. Express matches its
  // `app.use` mounts case-insensitively, so "/API/keys" reaches these routes;
  // comparing the raw path let it skip the public-prefix and protected checks
  // and fall through to the unauthenticated branch.
  // Normalise before any prefix match. "//api/keys" and "/api%2fkeys" both
  // reach the keys handler but are different strings than "/api/keys", so a
  // raw req.path comparison let an API key walk straight past ALWAYS_PROTECTED.
  const path = normalizePath(req.path);

  // ALWAYS_PROTECTED is checked first, on purpose. "/api/version" is public so
  // the version endpoint needs no key, but the prefix match made every
  // /api/version/* public too — including /api/version/shutdown and
  // /api/version/update, which returned 200 and killed the server for anyone
  // who asked. The ALWAYS_PROTECTED entries were dead code behind this return.
  const alwaysProtected = ALWAYS_PROTECTED.some(
    (p) => path === p || path.startsWith(p + "/")
  );
  if (alwaysProtected) {
    // fall through to the credential checks below
  } else {
    if (PUBLIC_API_PATHS.some((p) => path === p || path.startsWith(p + "/")))
      return next();
    if (PUBLIC_PREFIXES.some((p) => path.startsWith(p)))
      return next();
  }

  // Allow CLI token
  if (await hasValidCliToken(req)) return next();

  try {
    const settings = await getSettings();
    const requireLogin = settings?.requireLogin ?? false;

    // Check JWT cookie. verifyDashboardAuthToken throws the claims away, so read
    // the session instead — the role check below needs them.
    const token = req.cookies?.["syns4033_session"];
    if (token) {
      const session = await getDashboardAuthSession(token);
      if (session) {
        // No role claim means the session predates roles — the password and
        // OIDC logins do not set one — and those are the router's own operator.
        // Treating them as "user" would lock the admin out of their own router.
        const role = session.role === "user" ? "user" : "admin";
        if (role !== "admin" && isAdminPath(path)) {
          // Not "Forbidden": a 403 would confirm the route exists.
          return res.status(404).json({ error: "Not found" });
        }
        (req as { session?: Record<string, unknown> }).session = { ...session, role };
        return next();
      }
    }

    // If login not required and path not always-protected
    if (!requireLogin && !alwaysProtected) {
      // Protected paths are only enforced when requireLogin=true.
      // When login is not required, allow dashboard API paths freely.
      return next();
    }

    // An API key is an LLM-traffic credential: it exists so OpenAI-compatible
    // clients can call /v1/*. It must never stand in for a dashboard session.
    // Without this gate a single customer key read /api/settings/database —
    // the whole database — and could mint or delete other keys, which is
    // full admin by another name.
    if (!alwaysProtected) {
      const apiKey = (req.headers["x-api-key"] ||
        req.headers["authorization"]?.replace("Bearer ", "")) as
        | string
        | undefined;
      if (apiKey) {
        const valid = await validateApiKey(apiKey);
        if (valid) return next();
      }
    }

    return res.status(401).json({ error: "Unauthorized" });
  } catch (err) {
    console.error("[auth]", err);
    return res.status(500).json({ error: "Auth error" });
  }
}
