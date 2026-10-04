import { AI_PROVIDERS } from "../../../../shared/constants/providers.js";
import { publicMessage } from "../../../../lib/publicMessage.js";

// Provider → internal voices API. Edge/local-device share the generic endpoint.
const PROVIDER_API = {
  elevenlabs: (origin) => `${origin}/api/media-providers/tts/elevenlabs/voices`,
  deepgram: (origin) => `${origin}/api/media-providers/tts/deepgram/voices`,
  inworld: (origin) => `${origin}/api/media-providers/tts/inworld/voices`,
  "edge-tts": (origin) => `${origin}/api/media-providers/tts/voices?provider=edge-tts`,
  "local-device": (origin) => `${origin}/api/media-providers/tts/voices?provider=local-device`,
};

export async function OPTIONS() {
  return new Response(null, {
    headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET, OPTIONS" },
  });
}

// GET /v1/audio/voices?provider={p}[&lang=xx]
// Returns OpenAI-style list with each voice's full model id ready for /v1/audio/speech
export async function GET_handler(req, res) {
  try {
    // This handler fetches its own /api/media-providers/* endpoints, and that
    // is by definition the same process — so talk to it over loopback on the
    // port it is actually listening on. Deriving the origin from
    // req.protocol/req.get("host") or the X-Forwarded-* headers was wrong in
    // both environments: "http://localhost" hit port 80 and 502'd, and behind
    // Railway's proxy the forwarded host sent the request out over the public
    // internet, where the forwarded session cookie was rejected and it 401'd.
    const port = process.env.PORT || req.socket?.localPort;
    const origin = `http://127.0.0.1:${port}`;
    const searchParams = new URL(req.originalUrl, "http://placeholder").searchParams;
    const provider = searchParams.get("provider");
    const lang = searchParams.get("lang");

    if (!provider || !PROVIDER_API[provider]) {
      return Response.json(
        { error: { message: `provider must be one of: ${Object.keys(PROVIDER_API).join(", ")}`, type: "invalid_request_error" } },
        { status: 400, headers: { "Access-Control-Allow-Origin": "*" } },
      );
    }

    const baseUrl = PROVIDER_API[provider](origin);
    const url = lang ? `${baseUrl}${baseUrl.includes("?") ? "&" : "?"}lang=${encodeURIComponent(lang)}` : baseUrl;
    // This handler fetches its own /api/media-providers/* endpoints over HTTP,
    // and those sit behind the dashboard session guard — so the caller's cookie
    // has to be forwarded, or the inner route answers 401 and this surfaces it
    // as an upstream error.
    const cookie = req.headers?.cookie;
    const upstream = await fetch(url, {
      cache: "no-store",
      headers: cookie ? { cookie } : undefined,
    });
    const data = await upstream.json();
    if (!upstream.ok || data.error) {
      return Response.json(
        { error: { message: data.error || `Upstream ${upstream.status}`, type: "server_error" } },
        { status: upstream.status, headers: { "Access-Control-Allow-Origin": "*" } },
      );
    }

    // Internal API shape: { voices } when lang filter, else { byLang, languages }
    const rawVoices = lang
      ? (data.voices || [])
      : Object.values(data.byLang || {}).flatMap((l) => l.voices || []);

    // Use provider alias for /v1/audio/speech model param (matches skill convention e.g. el/, dg/, edge-tts/)
    const alias = AI_PROVIDERS[provider]?.alias || provider;
    const data_out = rawVoices.map((v) => ({
      id: v.id,
      name: v.name,
      lang: v.lang || "",
      gender: v.gender || "",
      model: `${alias}/${v.id}`,
    }));

    return Response.json({ object: "list", data: data_out }, {
      headers: { "Access-Control-Allow-Origin": "*" },
    });
  } catch (err) {
    return Response.json(
      { error: { message: publicMessage(err.message, "Failed to list voices"), type: "server_error" } },
      { status: 502, headers: { "Access-Control-Allow-Origin": "*" } },
    );
  }
}
