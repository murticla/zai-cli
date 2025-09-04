import type { Spinner } from "yocto-spinner";
import { UIChunkToCliConverter } from "./ui-chunk-to-cli-converter";

/**
 * Enhanced handler that properly processes UIMessageChunk streams for CLI display
 * This uses the official AI SDK readUIMessageStream for proper stream handling
 */
export async function handleUIMessageStreamForCli(
  rawStream: ReadableStream,
  options: {
    spinner: Spinner;
    messageIndex?: number;
    onComplete?: (content: string, agentName: string) => void;
    onError?: (error: Error) => void;
  }
): Promise<{ content: string; agentName: string }> {
  const { spinner, messageIndex, onComplete, onError } = options;

  try {
    // The rawStream is a Response body (ReadableStream<Uint8Array>) from createUIMessageStreamResponse
    // We need to parse it properly to extract UIMessageChunk objects
    const reader = rawStream.getReader();
    const decoder = new TextDecoder();
    const converter = new UIChunkToCliConverter(spinner, messageIndex);

    let finalContent = "";
    let finalAgentName = "";
    let buffer = "";

    try {
      while (true) {
        const { done, value } = await reader.read();

        if (done) {
          if (buffer.trim()) {
            try {
              const chunk = JSON.parse(buffer.trim());
              await converter.processChunk(chunk);
              finalContent = converter.getCurrentContent();
              finalAgentName = converter.getCurrentAgentName();
            } catch (error) {
              console.warn("Failed to parse final buffer chunk:", buffer);
            }
          }
          break;
        }

        const text = decoder.decode(value, { stream: true });
        buffer += text;

        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          const trimmedLine = line.trim();
          if (!trimmedLine) continue;

          try {
            if (trimmedLine.startsWith("data: ")) {
              const data = trimmedLine.slice(6);

              if (data === "[DONE]") {
                break;
              }

              const chunk = JSON.parse(data);

              await converter.processChunk(chunk);
            } else if (trimmedLine.startsWith("{")) {
              const chunk = JSON.parse(trimmedLine);
              await converter.processChunk(chunk);
            }

            finalContent = converter.getCurrentContent();
            finalAgentName = converter.getCurrentAgentName();
          } catch (error) {
            console.warn("Failed to parse chunk:", trimmedLine, error);
          }
        }
      }

      const result = { content: finalContent, agentName: finalAgentName };
      onComplete?.(finalContent, finalAgentName);
      return result;
    } finally {
      reader.releaseLock();
    }
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    onError?.(err);
    throw err;
  }
}
