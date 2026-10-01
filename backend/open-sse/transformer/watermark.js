/**
 * Watermark — injects a watermark line into an SSE stream right before the
 * terminal "data: [DONE]".
 *
 * Implemented as a Web TransformStream (compatible with the router's Web
 * ReadableStream pipeline, see pipeThrough usage in streamHandler.js). It is
 * chunk-boundary safe: incoming bytes are buffered and only flushed once the
 * "[DONE]" sentinel has actually been seen, so a split "[DONE]" across two
 * chunks never loses the watermark.
 */

const ENCODER = new TextEncoder();
const DECODER = new TextDecoder("utf-8");

export function createWatermarkStream(watermark = '{"watermark":"© SYNS4033ROUTER"}', log = null) {
  let buf = "";
  let injected = false;

  return new TransformStream({
    transform(chunk, controller) {
      buf += DECODER.decode(chunk, { stream: true });
      const doneIdx = buf.indexOf("data: [DONE]");
      if (doneIdx === -1) {
        // No [DONE] yet — flush everything that cannot be part of a pending
        // "[DONE]" split (keep a trailing margin of 12 chars).
        const keep = Math.max(0, buf.length - 12);
        if (keep > 0) {
          controller.enqueue(ENCODER.encode(buf.slice(0, keep)));
          buf = buf.slice(keep);
        }
        return;
      }
      if (!injected) {
        controller.enqueue(ENCODER.encode(buf.slice(0, doneIdx)));
        controller.enqueue(ENCODER.encode(`data: ${watermark}\n\n`));
        if (log) log?.debug?.("WATERMARK", "injected before [DONE]");
        buf = buf.slice(doneIdx);
        injected = true;
      }
      controller.enqueue(ENCODER.encode(buf));
      buf = "";
    },
    flush(controller) {
      if (buf) controller.enqueue(ENCODER.encode(buf));
      buf = "";
    },
  });
}

/**
 * Pipe a Web ReadableStream through the watermark when enabled.
 * Returns the original stream untouched when watermarking is off — callers
 * never need to branch.
 */
export function maybeWatermark(readable, { watermarkEnabled = false, watermark = undefined, log = null } = {}) {
  if (!watermarkEnabled || !readable) return readable;
  return readable.pipeThrough(createWatermarkStream(watermark, log));
}
