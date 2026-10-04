/**
 * Portal users get a trimmed request-detail entry.
 *
 * Two reasons, and they are not the same one:
 *
 * 1. Size. `request` and `providerRequest` were byte-identical, so every entry
 *    carried the full prompt twice — 2.2 KB of the 2.5 KB per row, 51 KB for a
 *    default page of twenty.
 *
 * 2. The system prompt. `request.messages` includes the role:"system" turn the
 *    router injects, which is the operator's own wording. A portal account is
 *    not allowed to change it, so it is not allowed to read it either — a
 *    user who can copy the prompt out of the usage log can reconstruct it and
 *    use it directly, which is the one thing the split exists to prevent.
 *
 * Admin keeps the full row; that is where this data is meant to be read.
 */
export function trimRequestDetailForUser(entry) {
  if (!entry || typeof entry !== "object") return entry;
  const { providerRequest, request, ...rest } = entry;

  if (request && typeof request === "object") {
    const messages = Array.isArray(request.messages) ? request.messages : null;
    rest.request = messages
      ? {
          ...request,
          messageCount: messages.length,
          // Roles and sizes, not contents: enough to see the shape of the call
          // without handing over either the operator prompt or the user's text.
          messages: messages.map((m) => ({
            role: m?.role ?? "unknown",
            chars: String(m?.content ?? "").length,
          })),
        }
      : { keys: Object.keys(request) };
  }

  return rest;
}
