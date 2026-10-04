/**
 * Keep runtime wording out of client-facing responses.
 *
 * Node errors name internal functions, variable shapes and filesystem paths —
 * "Cannot destructure property 'kind' of '(intermediate value)' as it is
 * undefined" tells an attacker the router's internal object layout. Our own
 * messages ("Missing API key", "Unknown provider: …") stay, because the caller
 * cannot fix the request without them.
 *
 * Lives here rather than in open-sse/ because routes under src/routes compile
 * into dist/ while open-sse/ is copied whole; a route importing from open-sse
 * resolves to a path that does not exist at runtime.
 */
const INTERNAL_ERROR_PATTERNS = [
  /Maximum call stack/i,
  /\b(?:TypeError|RangeError|ReferenceError|SyntaxError)\b/,
  /\bis not a function\b/i,
  /Cannot read (?:propert|properties)/i,
  /Cannot destructure/i,
  /\bundefined is not\b/i,
  /\bnull is not\b/i,
  /\b(?:ENOENT|EACCES|EPIPE|ECONNRESET|EAI_AGAIN)\b/,
  /\bat\s+\S+\s+\(.*:\d+:\d+\)/, // stack frame: at fn (file:line:col)
  /\.js:\d+:\d+|\.ts:\d+:\d+/,
];

export function isInternalError(message) {
  if (typeof message !== "string") return false;
  return INTERNAL_ERROR_PATTERNS.some((re) => re.test(message));
}

/**
 * @param {unknown} message  caught error message
 * @param {string} [fallback] wording to use when the message looks internal
 * @returns {string} a message that is safe to return to the caller
 */
export function publicMessage(message, fallback = "Internal server error") {
  return isInternalError(message) ? fallback : message;
}