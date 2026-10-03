// Base URLs on provider nodes are dialled at request time, so they have to be
// real http(s) endpoints. POST and PUT both write the same column and both were
// storing whatever they were given — "bukan-url" and "javascript:alert(1)" came
// back 201 and were saved as working endpoints.
//
// The label differs per call site ("Embedding base URL", "Base URL") but the
// rule does not, so it lives here rather than being copied into each route.

export function validateEndpointUrl(raw, label = "Base URL") {
  const value = typeof raw === "string" ? raw.trim() : "";
  if (!value) return { error: `${label} is required` };

  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    return { error: `${label} must be a valid URL, e.g. http://host:port or https://host/path` };
  }

  const scheme = parsed.protocol.replace(":", "");
  if (scheme !== "http" && scheme !== "https") {
    return { error: `${label} must use http or https (got "${scheme}")` };
  }
  if (!parsed.hostname) {
    return { error: `${label} must include a host` };
  }
  return {};
}
