// Transform OpenAI SSE stream to Ollama JSON lines format
export function transformToOllama(response, model) {
  let buffer = "";
  let pendingToolCalls = {};
  
  const transform = new TransformStream({
    transform(chunk, controller) {
      const text = new TextDecoder().decode(chunk);
      buffer += text;
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        if (!line.startsWith("data:")) continue;
        const data = line.slice(5).trim();
        
        if (data === "[DONE]") {
          const ollamaEnd = JSON.stringify({ model, message: { role: "assistant", content: "" }, done: true }) + "\n";
          controller.enqueue(new TextEncoder().encode(ollamaEnd));
          return;
        }

        try {
          const parsed = JSON.parse(data);
          const delta = parsed.choices?.[0]?.delta || {};
          const content = delta.content || "";
          const toolCalls = delta.tool_calls;

          if (toolCalls) {
            for (const tc of toolCalls) {
              const idx = tc.index;
              if (!pendingToolCalls[idx]) {
                pendingToolCalls[idx] = { id: tc.id, function: { name: "", arguments: "" } };
              }
              if (tc.function?.name) pendingToolCalls[idx].function.name += tc.function.name;
              if (tc.function?.arguments) pendingToolCalls[idx].function.arguments += tc.function.arguments;
            }
          }

          if (content) {
            const ollama = JSON.stringify({ model, message: { role: "assistant", content }, done: false }) + "\n";
            controller.enqueue(new TextEncoder().encode(ollama));
          }

          const finishReason = parsed.choices?.[0]?.finish_reason;
          if (finishReason === "tool_calls" || finishReason === "stop") {
            const toolCallsArr = Object.values(pendingToolCalls);
            if (toolCallsArr.length > 0) {
              const formattedCalls = toolCallsArr.map(tc => ({
                function: {
                  name: tc.function.name,
                  arguments: (() => { try { return JSON.parse(tc.function.arguments || "{}"); } catch { return {}; } })()
                }
              }));
              const ollama = JSON.stringify({ 
                model, 
                message: { role: "assistant", content: "", tool_calls: formattedCalls }, 
                done: true
              }) + "\n";
              controller.enqueue(new TextEncoder().encode(ollama));
              pendingToolCalls = {};
            } else if (finishReason === "stop") {
              const ollamaEnd = JSON.stringify({ model, message: { role: "assistant", content: "" }, done: true }) + "\n";
              controller.enqueue(new TextEncoder().encode(ollamaEnd));
            }
          }
        } catch (e) {
          // Silently ignore parse errors
        }
      }
    },
    flush(controller) {
      const ollamaEnd = JSON.stringify({ model, message: { role: "assistant", content: "" }, done: true }) + "\n";
      controller.enqueue(new TextEncoder().encode(ollamaEnd));
    }
  });

  if (!response.body) {
    return new Response("", { status: response.status, headers: { "Content-Type": "application/x-ndjson" } });
  }

  // An error response is JSON, not SSE — the transform above ignores anything
  // that does not start with "data:", so passing one through produced a 200
  // with an empty stream. That masked every rejection (a missing API key, an
  // unknown provider) as a successful empty answer. Keep the upstream status
  // and surface the message in the Ollama error field instead.
  if (response.status >= 400) {
    return new Response(
      JSON.stringify({
        model,
        error: `upstream returned ${response.status}`,
        done: true,
      }) + "\n",
      {
        status: response.status,
        headers: { "Content-Type": "application/x-ndjson", "Access-Control-Allow-Origin": "*" },
      },
    );
  }

  return new Response(response.body.pipeThrough(transform), {
    status: response.status,
    headers: { "Content-Type": "application/x-ndjson", "Access-Control-Allow-Origin": "*" },
  });
}

