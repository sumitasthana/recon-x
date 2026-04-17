import { useState, useCallback, useRef } from 'react';

/**
 * Hook for streaming chat with the ReconX agent via POST /api/chat (SSE).
 *
 * Handles:
 *   - token events (incremental text append)
 *   - tool_start / tool_result events (delegation tracking)
 *   - error events (surface to UI)
 *   - done events (mark streaming complete)
 *   - HTTP stream end (fallback for marking complete)
 *   - Fetch errors (network failures, aborts)
 */
export function useChatApi() {
  const [messages, setMessages] = useState([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState(null);
  const threadId = useRef('chat-' + Date.now());
  const abortRef = useRef(null);

  const sendMessage = useCallback((text) => {
    if (!text.trim() || isStreaming) return;

    const userMsg = { role: 'user', content: text };
    setMessages((prev) => [...prev, userMsg]);
    setIsStreaming(true);
    setError(null);

    const assistantMsg = {
      role: 'assistant',
      content: '',
      toolCalls: [],
      toolResults: [],
    };
    setMessages((prev) => [...prev, assistantMsg]);

    const controller = new AbortController();
    abortRef.current = controller;

    fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: text,
        thread_id: threadId.current,
      }),
      signal: controller.signal,
    })
      .then((response) => {
        if (!response.ok) {
          throw new Error(`Server error: ${response.status}`);
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        let currentEvent = '';  // Track the SSE event type

        function processChunk() {
          return reader.read().then(({ done, value }) => {
            if (done) {
              // HTTP stream ended — ensure we mark streaming complete
              setIsStreaming(false);
              return;
            }

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() || '';

            for (const line of lines) {
              // SSE event type line
              if (line.startsWith('event: ')) {
                currentEvent = line.slice(7).trim();

                // Handle 'done' event immediately — this is the
                // definitive signal that the server is finished.
                if (currentEvent === 'done') {
                  setIsStreaming(false);
                  return; // Stop processing, stream is over
                }
                continue;
              }

              // SSE data line
              if (line.startsWith('data: ')) {
                const dataStr = line.slice(6);
                try {
                  const data = JSON.parse(dataStr);

                  if (data.tool && data.input !== undefined) {
                    // tool_start
                    setMessages((prev) => {
                      const next = [...prev];
                      const last = { ...next[next.length - 1] };
                      last.toolCalls = [
                        ...(last.toolCalls || []),
                        { tool: data.tool, input: data.input },
                      ];
                      next[next.length - 1] = last;
                      return next;
                    });
                  } else if (data.tool && data.output !== undefined) {
                    // tool_result
                    setMessages((prev) => {
                      const next = [...prev];
                      const last = { ...next[next.length - 1] };
                      last.toolResults = [
                        ...(last.toolResults || []),
                        { tool: data.tool, output: data.output },
                      ];
                      next[next.length - 1] = last;
                      return next;
                    });
                  } else if (data.token !== undefined) {
                    // token — append incremental
                    setMessages((prev) => {
                      const next = [...prev];
                      const last = { ...next[next.length - 1] };
                      last.content = (last.content || '') + data.token;
                      next[next.length - 1] = last;
                      return next;
                    });
                  } else if (data.message) {
                    // error from server
                    setError(data.message);
                    setIsStreaming(false);
                  }
                } catch {
                  // Not JSON — ignore (SSE comments, empty lines)
                }
              }
            }

            return processChunk();
          });
        }

        return processChunk();
      })
      .catch((err) => {
        if (err.name !== 'AbortError') {
          setError(err.message);
        }
        setIsStreaming(false);
      });
  }, [isStreaming]);

  const clearMessages = useCallback(() => {
    if (abortRef.current) abortRef.current.abort();
    setMessages([]);
    setError(null);
    setIsStreaming(false);
    threadId.current = 'chat-' + Date.now();
  }, []);

  return { messages, sendMessage, isStreaming, error, clearMessages };
}
