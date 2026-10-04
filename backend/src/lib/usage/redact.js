/**
 * Usage responses are keyed by, and repeat, the API key that made the request.
 * Emitting it turns a stats page into a credential dump — every key in the
 * install, readable by anyone who can reach /api/usage/*.
 *
 * The key name and a stable hash stay, because a user still needs to tell their
 * own traffic apart. The secret does not leave the server.
 */
export function redactUsageCredentials(payload) {
  if (Array.isArray(payload)) return payload.map(redactUsageCredentials);
  if (!payload || typeof payload !== "object") return payload;

  const out = {};
  for (const [key, value] of Object.entries(payload)) {
    if (typeof value === "string" && /^sk-/.test(value)) {
      out[key] = `sk-${value.slice(3, 11)}…${value.slice(-4)}`;
      continue;
    }
    // Map keys shaped "<apiKey>|<model>|<provider>" keep their tail only.
    const composite = key.indexOf("|");
    if (/^sk-[^|]*\|/.test(key)) {
      out[`key:${key.slice(0, 2 + 8)}…${key.slice(-4)}|${key.slice(composite + 1)}`] =
        redactUsageCredentials(value);
      continue;
    }
    out[key] = redactUsageCredentials(value);
  }
  return out;
}
