import { handleChat } from "../../../../sse/handlers/chat.js";
import { initTranslators } from "../../../../../open-sse/translator/index.js";

/**
 * POST /api/dashboard/chat/completions
 *
 * The Basic Chat page posts a plain OpenAI-shaped body to this path, but the
 * route never existed, so the page was dead: POST returned the same 404 as a
 * fictional path. It points at handleChat — the same entry point
 * /v1/chat/completions uses — rather than reimplementing routing, fallback and
 * streaming.
 *
 * It lives under /api/ so the dashboard session cookie authenticates it. The
 * /v1 surface is public and now requires an API key by default, which a
 * logged-in dashboard session has no reason to hold.
 */
export const dynamic = "force-dynamic";

let initialized = false;

async function ensureInitialized() {
  if (!initialized) {
    await initTranslators();
    initialized = true;
  }
}

export async function POST_handler(req, res) {
  await ensureInitialized();

  const fullUrl = `${req.protocol}://${req.get("host")}${req.originalUrl}`;
  const webReq = new Request(fullUrl, {
    method: req.method,
    headers: new Headers(req.headers),
    body: req.method !== "GET" && req.method !== "HEAD" ? JSON.stringify(req.body) : undefined,
  });

  return await handleChat(webReq, null, { authAlreadyChecked: true });
}
