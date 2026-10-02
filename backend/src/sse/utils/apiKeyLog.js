/**
 * API-key log line shared by the /v1 handlers.
 *
 * Each handler used to carry its own copy, and the copies drifted: the wording
 * was fixed in chat.js while embeddings/search/fetch kept claiming "local mode"
 * on requests that were about to be 401'd. One definition, one wording.
 *
 * Callers must read `settings` before calling, so `requireApiKey` is the value
 * actually in effect rather than a guess.
 */
export function logApiKeyAuth(log, apiKey, requireApiKey, authAlreadyChecked = false) {
  if (apiKey) {
    log.debug("AUTH", `API Key: ${log.maskKey(apiKey)}`);
    return;
  }
  // An internal caller already behind the dashboard session guard skips the key
  // check below. Saying it "will be rejected" sent me hunting a 401 that the
  // request was never going to hit.
  if (authAlreadyChecked) {
    log.debug("AUTH", "No API key provided (internal call, auth already checked)");
    return;
  }
  log.debug(
    "AUTH",
    requireApiKey
      ? "No API key provided (requireApiKey=true, request will be rejected)"
      : "No API key provided (local mode, key not required)",
  );
}
