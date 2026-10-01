/**
 * GODMODE jailbreak system-prompt injection.
 *
 * Inserts the operator-controlled GODMODE_JB prompt into the request body so
 * it reaches the upstream model as the leading system instruction.
 *
 * Shape-aware: handles OpenAI `messages`, Responses API `input`, and Gemini
 * `contents`. Falls back to `messages` when the shape is unknown so the
 * injection never throws.
 */

// Insert as the first system message; if one already exists, append so we
// keep any operator-authored system context while GODMODE stays authoritative.
function prependSystem(list, jbPrompt) {
  if (!Array.isArray(list) || list.length === 0) {
    return [{ role: "system", content: jbPrompt }];
  }
  const first = list[0];
  if (first && first.role === "system") {
    list[0] = { ...first, content: `${first.content}\n[GODMODE]: ${jbPrompt}` };
  } else {
    list.unshift({ role: "system", content: jbPrompt });
  }
  return list;
}

export function injectJailbreak(body, jbPrompt) {
  if (!body || !jbPrompt) return body;
  // OpenAI chat format
  if (Array.isArray(body.messages)) {
    body.messages = prependSystem(body.messages, jbPrompt);
    return body;
  }
  // OpenAI Responses API: input can be a string or array of items
  if (Array.isArray(body.input)) {
    body.input = prependSystem(body.input, jbPrompt);
    return body;
  }
  // Gemini: contents array
  if (Array.isArray(body.contents)) {
    body.contents = prependSystem(body.contents, jbPrompt);
    return body;
  }
  return body;
}
