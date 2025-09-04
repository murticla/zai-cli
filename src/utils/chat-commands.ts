import chalk from "chalk";
import {
  clearChatSession,
  getChatSession,
  saveChatHistory,
} from "../terminal-helpers";
import { startupMessage } from "../utils";

export function clearTerminal() {
  process.stdout.write("\x1Bc");
}

export interface ChatCommandResult {
  shouldContinue: boolean;
  shouldExit: boolean;
  updatedAgent?: string | null;
}

export async function handleChatCommand(
  prompt: string
): Promise<ChatCommandResult> {
  const command = prompt.toLowerCase();

  if (command === "exit" || command === "/exit") {
    console.log(chalk.bold.cyan("👋 Goodbye!"));
    process.exit(0);
  }

  if (command === "save" || command === "/save") {
    try {
      const chatSession = getChatSession();
      if (chatSession.length === 0) {
        console.log(
          chalk.yellowBright(
            "⚠️  No chat history to save yet. Start chatting first!"
          )
        );
        return { shouldContinue: true, shouldExit: false };
      }

      const savedPath = await saveChatHistory();
      console.log(chalk.greenBright(`✅ Chat history saved to: ${savedPath}`));
      console.log(
        chalk.blueBright(`📝 Total entries saved: ${chatSession.length}`)
      );
    } catch (error) {
      console.error(chalk.redBright("❌ Error saving chat history:"), error);
    }
    return { shouldContinue: true, shouldExit: false };
  }

  if (
    command === "reset" ||
    command === "/reset" ||
    command === "clear" ||
    command === "/clear"
  ) {
    const chatSession = getChatSession();
    const entryCount = chatSession.length;

    clearChatSession();
    clearTerminal();

    // Re-display the startup message
    startupMessage();

    if (entryCount > 0) {
      console.log(
        chalk.greenBright(
          `✅ Chat session reset! Cleared ${entryCount} previous entries.`
        )
      );
    } else {
      console.log(chalk.greenBright("✅ Chat session reset!"));
    }
    console.log(chalk.blueBright("🆕 Starting fresh chat session...\n"));

    return { shouldContinue: true, shouldExit: false };
  }

  // Not a recognized command
  return { shouldContinue: false, shouldExit: false };
}
