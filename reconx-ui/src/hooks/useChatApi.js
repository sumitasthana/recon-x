import { useState, useCallback, useRef } from 'react';

/**
 * Hook for streaming chat with the ReconX agent via POST /api/chat (SSE).
 *
 * Returns:
 *   - messages: array of { role, content, toolCalls?, toolResults? }
 *   - sendMessage(text): sends a user message and streams the response
 *   - isStreaming: whether the agent is currently responding
 *   - error: error message or null
 *   - clearMessages(): reset the conversation
 */
export function useChatApi() {
  const [messages, setMessages] = useState([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState(null);
  const threadId = useRef('chat-' + Date.now());
  const abortRef = useRef(null);

  const sendMessage = useCallback((text) => {
    if (!text.trim() || isStreaming) return;

    // Add user message
    const userMsg = { role: 'user', content: text };
    setMessages((prev) => [...prev, userMsg]);
    setIsStreaming(true);
    setError(null);

    // Placeholder for the assistant response
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
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        function processChunk() {
          return reader.read().then(({ done, value }) => {
            if (done) {
              setIsStreaming(false);
              return;
            }

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() || '';

            for (const line of lines) {
              if (line.startsWith('data: ')) {
                const dataStr = line.slice(6);
                try {
                  const data = JSON.parse(dataStr);

                  // Determine event type from data structure
                  if (data.tool && data.input !== undefined) {
                    // tool_start event
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
                    // tool_result event
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
                  } else if (data.content !== undefined) {
                    // token event — replace full content
                    setMessages((prev) => {
                      const next = [...prev];
                      const last = { ...next[next.length - 1] };
                      last.content = data.content;
                      next[next.length - 1] = last;
                      return next;
                    });
                  } else if (data.message) {
                    // error event
                    setError(data.message);
                    setIsStreaming(false);
                  }
                } catch {
                  // Not JSON — ignore
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
