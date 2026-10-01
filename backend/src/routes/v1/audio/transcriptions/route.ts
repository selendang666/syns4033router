import { handleStt } from "../../../../sse/handlers/stt.js";

// Allow large audio uploads — 5min for processing large files
export const maxDuration = 300;

export async function OPTIONS() {
  return new Response(null, {
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "*",
    },
  });
}

import { Readable } from "node:stream";

/** POST /v1/audio/transcriptions - OpenAI Whisper compatible STT */
export async function POST_handler(req, res) {
  // express.json() drains a JSON body before this route runs, so wrapping the
  // spent stream in Readable.toWeb() made `new Request` throw. Only multipart
  // reaches here anyway — reject the rest instead of letting it 500.
  if (!String(req.headers["content-type"] || "").toLowerCase().includes("multipart/form-data")) {
    return res.status(400).json({
      error: {
        message: "Missing required field: file (send multipart/form-data)",
        type: "invalid_request_error",
        code: "bad_request",
      },
    });
  }

  const fullUrl = `${req.protocol}://${req.get('host')}${req.originalUrl}`;
  const webReq = new Request(fullUrl, {
    method: req.method,
    headers: new Headers(req.headers),
    body: req.method !== 'GET' && req.method !== 'HEAD' ? Readable.toWeb(req) : undefined,
    duplex: 'half'
  });
  return await handleStt(webReq);
}
