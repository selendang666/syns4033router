
import { useState, useCallback, useRef } from "react";

/**
 * Hook for copy to clipboard with feedback
 * @param {number} resetDelay - Time in ms before resetting copied state (default: 2000)
 * @returns {{ copied: string|null, copy: (text: string, id?: string) => void }}
 */
export function useCopyToClipboard(resetDelay = 2000) {
  const [copied, setCopied] = useState(null);
  const timeoutRef = useRef(null);

  const copy = useCallback((text, id = "default") => {
    const write = async () => {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        const textarea = document.createElement("textarea");
        textarea.value = text;
        textarea.style.position = "fixed";
        textarea.style.opacity = "0";
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand("copy");
        document.body.removeChild(textarea);
      }
    };
    // Fire-and-forget: the button flipped to "Copied!" immediately, before the
    // write had finished — and also when the write rejected. A denied clipboard
    // permission or a non-secure context therefore produced a green checkmark
    // over nothing, and the paste that followed silently carried whatever was on
    // the clipboard before.
    write()
      .then(() => setCopied(id))
      .catch((err) => {
        console.warn("[copy] clipboard write failed:", err?.message || err);
      });

    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    timeoutRef.current = setTimeout(() => {
      setCopied(null);
    }, resetDelay);
  }, [resetDelay]);

  return { copied, copy };
}

