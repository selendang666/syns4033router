import { handleChat } from "../../../../sse/handlers/chat.js";
import { initTranslators } from "../../../../../open-sse/translator/index.js";
import { transformToOllama } from "../../../../../open-sse/utils/ollamaTransform.js";

let initialized = false;

async function ensureInitialized() {
  if (!initialized) {
    await initTranslators();
    initialized = true;
  }
}

export async function OPTIONS() {
  return new Response(null, {
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "*"
    }
  });
}

export async function POST_handler(req, res) {
  await ensureInitialized();

  // `request` was never in scope here — the handler only receives the Express
  // (req, res), so every call threw "request is not defined" and this Ollama-
  // compat route 500'd for every request. Build the web Request the handlers
  // expect, the same way v1/chat/completions does.
  const fullUrl = `${req.protocol}://${req.get("host")}${req.originalUrl}`;
  const webReq = new Request(fullUrl, {
    method: req.method,
    headers: new Headers(req.headers),
    body: req.method !== "GET" && req.method !== "HEAD" ? JSON.stringify(req.body) : undefined,
  });

  // Read the model off a clone so the body is still available to handleChat.
  let modelName = "llama3.2";
  try {
    const body = await webReq.clone().json();
    modelName = body.model || "llama3.2";
  } catch { /* keep the default */ }

  const response = await handleChat(webReq);
  return transformToOllama(response, modelName);
}

