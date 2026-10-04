import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { authMiddleware } from "./middleware/auth.js";
import { buildAutoRouter } from "./autoRouter.js";

const PORT = Number(process.env.PORT) || 3001;
const FRONTEND_ORIGIN = process.env.FRONTEND_ORIGIN || "http://localhost:5177";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FRONTEND_DIST = path.resolve(__dirname, "../../frontend/dist");

const app = express();

// ─── Security ─────────────────────────────────────────────────────────────────
app.use(helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false }));

// ─── CORS ─────────────────────────────────────────────────────────────────────
// Reflecting whatever Origin the browser sends means any site on the internet
// can read credentialed responses. SameSite=Lax on the session cookie is what
// currently stops that; flipping it to None for a cross-origin integration would
// turn every /api/* response into a public dump. So only origins that were
// asked for are reflected, and the dashboard's own fetches never need CORS.
const CORS_ALLOWED_ORIGINS = new Set(
  (process.env.CORS_ALLOWED_ORIGINS || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean)
);

app.use(cors({
  origin: (origin, callback) => {
    // No Origin header means a non-browser client (curl, SDK, CLI tool); CORS
    // does not apply to those and blocking them would break the router.
    if (!origin) return callback(null, true);
    if (CORS_ALLOWED_ORIGINS.has(origin)) return callback(null, true);
    return callback(null, false);
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "x-api-key", "x-9r-cli-token"],
}));

// ─── Body Parsing ─────────────────────────────────────────────────────────────
app.use(cookieParser());
app.use(express.json({ limit: "128mb" }));
app.use(express.urlencoded({ extended: true, limit: "128mb" }));

// Reject absurdly nested bodies before a handler walks them. A few thousand
// levels of arrays parse fine and then overflow the stack somewhere further in,
// which surfaced as a 500 with "Maximum call stack size exceeded" in the
// response. Real requests nest a handful of levels; the cap is far above that.
const MAX_BODY_DEPTH = 64;
app.use((req, res, next) => {
  const tooDeep = (value: unknown, depth = 0): boolean => {
    if (depth > MAX_BODY_DEPTH) return true;
    if (Array.isArray(value)) return value.some((item) => tooDeep(item, depth + 1));
    if (value && typeof value === "object") {
      return Object.values(value).some((item) => tooDeep(item, depth + 1));
    }
    return false;
  };
  if (req.body && typeof req.body === "object" && tooDeep(req.body)) {
    return res.status(400).json({ error: "Request body nested too deeply" });
  }
  return next();
});

// ─── Health Check (no auth) ────────────────────────────────────────────────────
app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", version: "3.0.0", ts: Date.now() });
});

// ─── Auth Middleware ───────────────────────────────────────────────────────────
// Authentication only applies to API/proxy traffic. Applying it globally would
// prevent the login page and SPA assets from loading when login is required.
//
// The path MUST be compared case-insensitively. Express matches its `app.use`
// mount points case-insensitively by default, so "/API/keys" reaches the
// /api routes while a case-sensitive `startsWith("/api/")` here lets it slip
// past the guard entirely — a full unauthenticated bypass of the dashboard API.
app.use((req, res, next) => {
  const path = req.path.toLowerCase();
  if (
    path === "/api" ||
    path.startsWith("/api/") ||
    path === "/v1" ||
    path.startsWith("/v1/") ||
    path === "/v1beta" ||
    path.startsWith("/v1beta/")
  ) {
    return authMiddleware(req, res, next);
  }
  return next();
});

// ─── Auto-mount all routes ────────────────────────────────────────────────────
async function start() {
  const apiRouter = await buildAutoRouter();
  app.use("/api", (req, res, next) => {
    console.log("API request:", req.method, req.url, req.originalUrl);
    apiRouter(req, res, next);
  });

  // LLM proxy remaps: /v1/* → /api/v1/*
  app.use("/v1", (req, res, next) => {
    req.url = "/v1" + req.url;
    apiRouter(req, res, next);
  });
  app.use("/v1beta", (req, res, next) => {
    req.url = "/v1beta" + req.url;
    apiRouter(req, res, next);
  });

  app.use(["/api", "/v1", "/v1beta"], (_req, res) => {
    res.status(404).json({ error: "Not found" });
  });

  // Serve the production SPA from the same origin as the API.
  app.use(express.static(FRONTEND_DIST, { index: false, redirect: false }));
  app.use((req, res, next) => {
    if (req.method === "GET" && req.accepts("html")) {
      return res.sendFile(path.join(FRONTEND_DIST, "index.html"));
    }
    return next();
  });

  // ─── 404 Fallback ──────────────────────────────────────────────────────────
  app.use((_req, res) => res.status(404).json({ error: "Not found" }));

  // ─── Error Handler ─────────────────────────────────────────────────────────
  app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error("[server] unhandled error:", err);
    if (!res.headersSent) res.status(500).json({ error: "Internal server error" });
  });

  app.listen(PORT, () => {
    console.log(`\n🚀 SYNS4033Router Backend running on http://localhost:${PORT}`);
    console.log(`   Frontend origin: ${FRONTEND_ORIGIN}`);
    console.log(`   Environment: ${process.env.NODE_ENV || "development"}\n`);
  });
}

start().catch((err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});

export { app };
