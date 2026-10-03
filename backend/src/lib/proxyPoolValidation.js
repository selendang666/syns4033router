// Proxy pool input validation, shared by POST /api/proxy-pools and
// PUT /api/proxy-pools/:id. Both write to the same column and both are used to
// dial upstream, so they must agree on what a usable value looks like — the two
// used to drift, which left PUT accepting anything POST rejected.

export const VALID_PROXY_TYPES = ["http", "vercel", "cloudflare", "deno"];

const PROXY_SCHEMES = ["http", "https", "socks4", "socks5", "socks5h"];

/**
 * @returns {{ error?: string }}
 */
export function validateProxyUrl(proxyUrl, type = "http") {
  if (typeof proxyUrl !== "string" || !proxyUrl.trim()) {
    return { error: "Proxy URL is required" };
  }
  const trimmed = proxyUrl.trim();

  let parsed;
  try {
    parsed = new URL(trimmed);
  } catch {
    return {
      error:
        type === "http"
          ? "Proxy URL must be a valid URL, e.g. http://host:port or socks5://host:port"
          : "Relay URL must be a valid https URL",
    };
  }

  const scheme = parsed.protocol.replace(":", "");
  if (type === "http") {
    if (!PROXY_SCHEMES.includes(scheme)) {
      return { error: `Proxy URL scheme must be one of ${PROXY_SCHEMES.join(", ")} (got "${scheme}")` };
    }
  } else if (scheme !== "https") {
    return { error: `A ${type} relay URL must use https (got "${scheme}")` };
  }

  if (!parsed.hostname) {
    return { error: "Proxy URL must include a host" };
  }
  return {};
}
