import type { BaseMessage } from "@langchain/core/messages";
import { AIMessage, HumanMessage } from "@langchain/core/messages";
import chalk from "chalk";
import fs from "node:fs";
import path from "node:path";
import yoctoSpinner from "yocto-spinner";
import { env } from "./config/env";
import type { InterruptHandler } from "./index";
import { APIClient, type StreamConfig } from "./services/api-client";
import { handleUIMessageStreamForCli } from "./utils/ui-message-cli-handler";

/**
 * Utility function to strip ANSI escape codes for clean log files
 */
function stripAnsiCodes(text: string): string {
  const esc = 0x1b;
  const escapeChar = String.fromCharCode(esc);
  const ansiRegex = new RegExp(`${escapeChar}\\[[0-9;]*m`, "g");
  return text.replace(ansiRegex, "").replace(/\[[0-9]+m/g, "");
}

let messageHistory: BaseMessage[] = [];

interface MessageMetadata {
  timestamp: Date;
  user: string;
  agent: string | null;
}

let messageMetadata: MessageMetadata[] = [];

export function clearChatSession() {
  messageHistory = [];
  messageMetadata = [];
}

export function getChatSession(): Array<{
  timestamp: Date;
  user: string;
  agent: string | null;
  prompt: string;
  response: string;
  cleanResponse?: string;
}> {
  const chatEntries: Array<{
    timestamp: Date;
    user: string;
    agent: string | null;
    prompt: string;
    response: string;
    cleanResponse?: string;
  }> = [];

  for (let i = 0; i < messageHistory.length; i += 2) {
    const userMessage = messageHistory[i];
    const aiMessage = messageHistory[i + 1];
    const metadata = messageMetadata[Math.floor(i / 2)];

    if (
      userMessage?._getType() === "human" &&
      aiMessage?._getType() === "ai" &&
      metadata
    ) {
      const response = aiMessage.content.toString();
      chatEntries.push({
        timestamp: metadata.timestamp,
        user: metadata.user,
        agent: metadata.agent,
        prompt: userMessage.content.toString(),
        response,
        cleanResponse: stripAnsiCodes(response),
      });
    }
  }

  return chatEntries;
}

export async function saveChatHistory(): Promise<string> {
  const chatSession = getChatSession();
  if (chatSession.length === 0) {
    throw new Error("No chat history to save");
  }

  const logsDir = path.join(process.cwd(), "logs", "terminal");
  await fs.promises.mkdir(logsDir, { recursive: true });

  const now = new Date();
  const timestamp =
    now.toISOString().replace(/[:.]/g, "-").split("T")[0] +
    "_" +
    now.toISOString().replace(/[:.]/g, "-").split("T")[1].split(".")[0];

  const filename = `${timestamp}_chat_history.log`;
  const filepath = path.join(logsDir, filename);

  // Format chat history
  let logContent = "AI Agents Studio - Terminal Chat History\n";
  logContent += `Generated: ${now.toISOString()}\n`;
  logContent += `Total Entries: ${chatSession.length}\n`;
  logContent += `${"=".repeat(80)}\n\n`;

  for (const entry of chatSession) {
    logContent += `[${entry.timestamp.toISOString()}]\n`;
    logContent += `User (${entry.user}): ${entry.prompt}\n`;
    logContent += `Agent: ${entry.agent || "Main AI Supervisor"}\n`;
    // Use clean response without ANSI codes for better log file highlighting
    const cleanResponse = entry.cleanResponse || stripAnsiCodes(entry.response);
    logContent += `Response: ${cleanResponse}\n`;
    logContent += `${"-".repeat(40)}\n\n`;
  }

  await fs.promises.writeFile(filepath, logContent, "utf-8");
  return filepath;
}

export async function streamAIResponse({
  prompt,
  userName = "User",
  thread_id,
  interruptHandler,
  signal,
}: {
  prompt: string;
  thread_id?: string | null;
  userName?: string;
  interruptHandler?: InterruptHandler;
  signal: AbortSignal;
}) {
  const userMessage = new HumanMessage({ content: prompt });
  messageHistory.push(userMessage);

  const apiClient = new APIClient({
    baseUrl: env.API_BASE_URL,
    zaiApiKey: env.ZAI_API_KEY,
  });

  const spinner = yoctoSpinner({
    text: `${chalk.bold.cyan("AI:")} ${chalk.yellow("Thinking...")}`,
  }).start();

  try {
    if (thread_id === null) {
      await handleAskMode(apiClient, prompt, spinner, signal);
    } else {
      await handleChatMode(
        apiClient,
        prompt,
        thread_id || "new",
        userName,
        interruptHandler,
        spinner,
        signal
      );
    }
  } catch (error) {
    spinner.error("Request failed");

    if (signal.aborted) {
      console.log(chalk.yellow("\n⚠️  Request was cancelled"));
    } else {
      console.error(
        chalk.red("\n❌ Error:"),
        error instanceof Error ? error.message : String(error)
      );
    }
    throw error;
  }

  console.log("\n");
}

async function handleAskMode(
  apiClient: APIClient,
  prompt: string,
  spinner: any,
  _signal: AbortSignal
) {
  const askRequest = {
    messages: [{ role: "user" as const, content: prompt }],
    stream: false,
  };

  spinner.text = `${chalk.bold.cyan("AI:")} ${chalk.yellow("Processing...")}`;

  const response = await apiClient.ask(askRequest);

  spinner.success("Response received");

  // Display the response
  if (response && response.length > 0) {
    const aiMessage = response[response.length - 1];
    if (aiMessage && aiMessage.content) {
      console.log(chalk.bold.cyan("AI:"));
      console.log(chalk.whiteBright(aiMessage.content));

      // Add AI response to history
      const aiMsg = new AIMessage({ content: aiMessage.content });
      messageHistory.push(aiMsg);

      // Store metadata
      messageMetadata.push({
        timestamp: new Date(),
        user: "User",
        agent: aiMessage.name || null,
      });
    }
  }
}

async function handleChatMode(
  apiClient: APIClient,
  prompt: string,
  thread_id: string,
  userName: string,
  _interruptHandler: InterruptHandler | undefined,
  spinner: any,
  signal: AbortSignal
) {
  // Create or use existing thread
  let threadId = thread_id;

  if (!threadId || threadId === "new") {
    spinner.text = `${chalk.bold.cyan("AI:")} ${chalk.yellow(
      "Creating new thread..."
    )}`;

    const newThread = await apiClient.createNewThread({ userId: userName });
    threadId = newThread.threadId;

    console.log(chalk.dim(`🧵 Thread: ${threadId}`));
  }

  // Prepare stream config
  const streamConfig: StreamConfig = {
    threadId,
    content: prompt,
    userId: userName,
    messageId: crypto.randomUUID(),
  };

  spinner.text = `${chalk.bold.cyan("AI:")} ${chalk.yellow("Connecting...")}`;

  // Start streaming
  const rawStream = await apiClient.streamChat(streamConfig, signal);

  spinner.success("Connected");

  let currentAgentName: string | null = null;
  let currentContent = "";

  try {
    // Use our enhanced UIMessageChunk CLI handler
    const result = await handleUIMessageStreamForCli(rawStream, {
      spinner,
      messageIndex: messageMetadata.length + 1,
      onComplete: (finalContent, agentName) => {
        currentContent = finalContent;
        currentAgentName = agentName || currentAgentName;
      },
      onError: (error) => {
        console.error(chalk.red(`\n❌ Stream error: ${error.message}`));
        throw error;
      },
    });

    // Extract the final content and agent name
    currentContent = result.content;
    currentAgentName = result.agentName || currentAgentName;

    // Add AI response to history
    if (currentContent.trim()) {
      const aiMessage = new AIMessage({
        content: currentContent.trim(),
        name: currentAgentName || undefined,
      });
      messageHistory.push(aiMessage);

      // Store metadata
      messageMetadata.push({
        timestamp: new Date(),
        user: userName,
        agent: currentAgentName,
      });
    }
  } catch (error) {
    if (signal.aborted) {
      console.log(chalk.yellow("\n⚠️  Request was cancelled"));
    } else {
      console.error(
        chalk.red(
          `\n❌ Stream error: ${
            error instanceof Error ? error.message : String(error)
          }`
        )
      );
    }
    throw error;
  }
}
