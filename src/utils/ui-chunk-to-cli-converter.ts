import type { UIMessageChunk } from "ai";
import chalk from "chalk";
import type { Spinner } from "yocto-spinner";
import { formatMessage, getAgentBgColor, getAgentColor } from "./cli-styling";
import { formatDuration } from "./format-duration";

type SpecificChunk<T extends UIMessageChunk["type"]> = Extract<
  UIMessageChunk,
  { type: T }
>;

interface CliState {
  currentAgentName: string;
  currentContent: string;
  isFirstMessage: boolean;
  activeTools: Map<string, { toolName: string; startTime: number }>;
  reasoningParts: Map<string, { agentName: string; content: string }>;
  textParts: Map<string, { agentName: string; content: string }>;
}

interface PrintCliMessageOptions {
  agentName: string;
  event?: string;
  message: string;
  messageIndex?: number;
  durationMs?: number;
}

/**
 * Converts UIMessageChunk stream to CLI-friendly output
 * This class handles the conversion from UI-focused chunks to terminal display
 */
export class UIChunkToCliConverter {
  private state: CliState;
  private spinner: Spinner;
  private messageIndex?: number;

  constructor(spinner: Spinner, messageIndex?: number) {
    this.spinner = spinner;
    this.messageIndex = messageIndex;
    this.state = {
      currentAgentName: "",
      currentContent: "",
      isFirstMessage: true,
      activeTools: new Map(),
      reasoningParts: new Map(),
      textParts: new Map(),
    };
  }

  /**
   * Process a UIMessageChunk and output appropriate CLI display
   */
  async processChunk(chunk: UIMessageChunk): Promise<void> {
    // Add safety check for chunk and chunk.type
    if (!chunk || typeof chunk !== "object") {
      console.warn("Received invalid chunk:", chunk);
      return;
    }

    if (!chunk.type) {
      console.warn(
        "Received chunk without type:",
        JSON.stringify(chunk, null, 2)
      );
      return;
    }

    switch (chunk.type) {
      case "start":
        await this.handleStart(chunk);
        break;

      case "text-start":
        await this.handleTextStart(chunk);
        break;

      case "text-delta":
        await this.handleTextDelta(chunk);
        break;

      case "text-end":
        await this.handleTextEnd(chunk);
        break;

      case "reasoning-start":
        await this.handleReasoningStart(chunk);
        break;

      case "reasoning-delta":
        await this.handleReasoningDelta(chunk);
        break;

      case "reasoning-end":
        await this.handleReasoningEnd(chunk);
        break;

      case "tool-input-available":
        await this.handleToolStart(chunk);
        break;

      case "tool-output-available":
        await this.handleToolEnd(chunk);
        break;

      case "error":
        await this.handleError(chunk);
        break;

      case "abort":
        await this.handleAbort(chunk);
        break;

      default:
        // Handle data-* types (structured output)
        if (chunk.type?.startsWith("data-")) {
          await this.handleDataChunk(chunk);
        }
        break;
    }
  }

  private async handleStart(chunk: SpecificChunk<"start">): Promise<void> {
    if (chunk.messageId) {
      console.log(chalk.dim(`📤 Message ID: ${chunk.messageId}`));
    }
  }

  private async handleTextStart(
    chunk: SpecificChunk<"text-start">
  ): Promise<void> {
    const agentName = this.getAgentName(chunk);

    if (agentName) {
      this.state.currentAgentName = agentName;
      this.spinner.text = `${agentName} is responding...\n`;
    }

    if (chunk.id) {
      this.state.textParts.set(chunk.id, {
        agentName: agentName || "unknown",
        content: "",
      });
    }
  }

  private async handleTextDelta(
    chunk: SpecificChunk<"text-delta">
  ): Promise<void> {
    const { delta, id } = chunk;

    if (delta && id) {
      const part = this.state.textParts.get(id);
      if (part) {
        part.content += delta;
        this.state.textParts.set(id, part);
      }

      this.spinner.text += delta;
      this.state.currentContent += delta;
    }
  }

  private async handleTextEnd(chunk: SpecificChunk<"text-end">): Promise<void> {
    const agentName = this.getAgentName(chunk);
    const part = this.state.textParts.get(chunk.id);

    if (part?.content) {
      this.spinner.text = "";

      await this.printCliMessage({
        agentName: agentName || part.agentName,
        message: part.content,
        messageIndex: this.messageIndex,
      });

      this.state.textParts.delete(chunk.id);
    }
  }

  private async handleReasoningStart(
    chunk: SpecificChunk<"reasoning-start">
  ): Promise<void> {
    const agentName = this.getAgentName(chunk);
    const thinking = chunk.providerMetadata?.agent?.thinking;

    if (agentName) {
      this.spinner.text = `${agentName} is reasoning...\n`;
      if (thinking) {
        this.spinner.text += chalk.dim(`💭 ${thinking}\n`);
      }
    }

    if (chunk.id) {
      this.state.reasoningParts.set(chunk.id, {
        agentName: agentName || "unknown",
        content: "",
      });
    }
  }

  private async handleReasoningDelta(
    chunk: SpecificChunk<"reasoning-delta">
  ): Promise<void> {
    const { delta, id } = chunk;

    if (delta && id) {
      const part = this.state.reasoningParts.get(id);
      if (part) {
        part.content += delta;
        this.state.reasoningParts.set(id, part);
      }

      this.spinner.text += chalk.dim(delta);
    }
  }

  private async handleReasoningEnd(
    chunk: SpecificChunk<"reasoning-end">
  ): Promise<void> {
    const agentName = this.getAgentName(chunk);
    const part = this.state.reasoningParts.get(chunk.id);

    if (part?.content) {
      this.spinner.text = "";

      await this.printCliMessage({
        agentName: agentName || part.agentName,
        event: "reasoning",
        message: chalk.dim(part.content),
        messageIndex: this.messageIndex,
      });

      this.state.reasoningParts.delete(chunk.id);
    }
  }

  private async handleToolStart(
    chunk: SpecificChunk<"tool-input-available">
  ): Promise<void> {
    const { toolCallId, toolName, input } = chunk;
    const agentName = this.getAgentName(chunk);

    if (toolCallId && toolName) {
      this.state.activeTools.set(toolCallId, {
        toolName,
        startTime: Date.now(),
      });
    }

    await this.printCliMessage({
      agentName: agentName || "unknown",
      event: `tool-call: ${toolName}`,
      message: JSON.stringify(input, null, 2),
      messageIndex: this.messageIndex,
    });
  }

  private async handleToolEnd(
    chunk: SpecificChunk<"tool-output-available">
  ): Promise<void> {
    const { toolCallId, output } = chunk;

    const toolInfo = this.state.activeTools.get(toolCallId);
    if (toolInfo) {
      const durationMs = Date.now() - toolInfo.startTime;

      await this.printCliMessage({
        agentName: this.state.currentAgentName || "unknown",
        event: `tool-end: ${toolInfo.toolName}`,
        message: JSON.stringify(output, null, 2),
        messageIndex: this.messageIndex,
        durationMs,
      });

      this.state.activeTools.delete(toolCallId);
    } else {
      await this.printCliMessage({
        agentName: this.state.currentAgentName || "unknown",
        event: "tool-end: unknown",
        message: JSON.stringify(output, null, 2),
        messageIndex: this.messageIndex,
      });
    }
  }

  private async handleDataChunk(chunk: UIMessageChunk): Promise<void> {
    const { data, type } = chunk as { data: unknown; type: string };
    const agentName = type.replace("data-", "") || "unknown";

    await this.printCliMessage({
      agentName,
      event: "structured-output",
      message: JSON.stringify(data, null, 2),
      messageIndex: this.messageIndex,
    });
  }

  private async handleError(chunk: SpecificChunk<"error">): Promise<void> {
    const { errorText } = chunk;
    console.error(chalk.red(`❌ Error: ${errorText}`));
  }

  private async handleAbort(_chunk: SpecificChunk<"abort">): Promise<void> {
    this.spinner.stop();
    console.log(chalk.yellow("⚠️  Stream aborted"));
  }

  /**
   * Extract agent name from chunk metadata
   */
  private getAgentName(chunk: UIMessageChunk): string | null {
    if ("providerMetadata" in chunk && chunk.providerMetadata?.agent?.name) {
      const name = chunk.providerMetadata.agent.name;
      return typeof name === "string" ? name : null;
    }
    return null;
  }

  /**
   * Print formatted message to CLI using the exact same styling as cli-stream-transformer
   */
  private async printCliMessage({
    agentName,
    event,
    message,
    messageIndex,
    durationMs,
  }: PrintCliMessageOptions): Promise<void> {
    const agentColor = getAgentColor(agentName);
    const agentBgColor = getAgentBgColor(agentName);
    const formattedMessage = formatMessage(message);

    const headerLabel = agentBgColor.white(` ${agentName} `);
    const messageIndexLabel = messageIndex
      ? chalk.gray(` [${messageIndex}]`)
      : "";
    const eventLabel = event ? chalk.gray(` ${event}`) : "";
    const durationLabel =
      typeof durationMs === "number"
        ? chalk.gray(` (${formatDuration(durationMs)})`)
        : "";
    const headerTail = agentColor(" ━━━━━━━━━━ ");
    const header = `\n${headerLabel}${messageIndexLabel}${eventLabel}${durationLabel}${headerTail}\n`;
    const content = agentColor(formattedMessage);

    const footer = agentColor(`\n${"━".repeat(30)}\n`);

    process.stdout.write(header + content + footer);
  }

  /**
   * Reset converter state
   */
  reset(): void {
    this.state = {
      currentAgentName: "",
      currentContent: "",
      isFirstMessage: true,
      activeTools: new Map(),
      reasoningParts: new Map(),
      textParts: new Map(),
    };
  }

  /**
   * Get current accumulated content
   */
  getCurrentContent(): string {
    return this.state.currentContent;
  }

  /**
   * Get current agent name
   */
  getCurrentAgentName(): string {
    return this.state.currentAgentName;
  }
}
