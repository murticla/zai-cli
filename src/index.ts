import chalk from "chalk";
import { Command } from "commander";
import { exec } from "node:child_process";
import * as readline from "node:readline";
import { promisify } from "node:util";
import * as prompts from "prompts";
import { clearChatSession, streamAIResponse } from "./terminal-helpers";
import { startupMessage } from "./utils";
import { clearTerminal, handleChatCommand } from "./utils/chat-commands";
import { loadHistory, saveToHistory } from "./utils/human-message-history";

const execAsync = promisify(exec);

const abortController = new AbortController();

process.on("SIGINT", () => {
  abortController.abort();
  console.log(chalk.bold.cyan("\n👋 Goodbye!"));
  process.exit(0);
});

process.on("SIGTERM", () => {
  abortController.abort();
  console.log(chalk.bold.cyan("\n👋 Goodbye!"));
  process.exit(0);
});

prompts.override({
  onCancel: () => {
    abortController.abort();
    console.log(chalk.bold.cyan("\n👋 Goodbye!"));
    process.exit(0);
  },
});

const program = new Command();

program
  .name("zai-cli")
  .description("Interactive command-line interface for AI agents")
  .version("1.0.0");

// Add the micro agent option
program
  .option(
    "-m, --message <text>",
    "Pre-defined message to send without prompting"
  )
  .option(
    "-a, --ask-mode",
    "Ask mode - single question without conversation history"
  )
  .addHelpText(
    "after",
    `
Commands during chat:
  exit     - Exit the cli
  switch   - Change agents or modes
  /save    - Save chat history to timestamped log file
  /reset   - Clear chat history and cli screen

Examples:
  $ bun dev:cli                          # Default behavior
  $ bun dev:cli -a                       # Ask mode (single question)
  $ bun dev:cli -m "Hello, how are you?" # Start with predefined message
  `
  );

function createReadlineInterface() {
  return readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    history: [],
  });
}

async function inputWithHistory(
  prompt: string,
  history: string[]
): Promise<string> {
  return new Promise((resolve) => {
    const rl = createReadlineInterface();

    (rl as any).history = [...history].reverse();

    rl.question(prompt, (answer) => {
      rl.close();
      resolve(answer);
    });
  });
}

async function getUserName(): Promise<string> {
  try {
    const { stdout } = await execAsync("whoami");
    const userName = stdout.trim();
    return userName || "You";
  } catch (error) {
    return "You";
  }
}

export interface ChoiceInterrupt {
  question: string;
  choices: string[];
}

export class InterruptHandler {
  private pendingInterrupt: {
    interrupt: ChoiceInterrupt;
    resolve: (value: string) => void;
  } | null = null;

  async handleChoiceInterrupt(interrupt: ChoiceInterrupt): Promise<string> {
    return new Promise((resolve) => {
      this.pendingInterrupt = { interrupt, resolve };
    });
  }

  getPendingInterrupt(): ChoiceInterrupt | null {
    return this.pendingInterrupt?.interrupt || null;
  }

  async resolvePendingInterrupt(): Promise<string | null> {
    if (!this.pendingInterrupt) return null;

    const { interrupt, resolve } = this.pendingInterrupt;
    const result = await this.handleChoiceSelection(interrupt);

    resolve(result);
    this.pendingInterrupt = null;

    return result;
  }

  private async handleChoiceSelection(
    interrupt: ChoiceInterrupt
  ): Promise<string> {
    console.log(chalk.bold.yellow(`\n${interrupt.question}\n`));

    const response = await prompts({
      type: "select",
      name: "choice",
      message: `Please select your choice: (1-${interrupt.choices.length})`,
      choices: interrupt.choices.map((choice, index) => ({
        title: `${index}. ${choice}`,
        value: index.toString(),
        description: choice,
      })),
      initial: 0,
    });

    if (response.choice === undefined) {
      console.log(chalk.bold.cyan("\n👋 Goodbye!"));
      process.exit(0);
    }

    const selectedIndex = Number.parseInt(response.choice, 10);
    const selectedChoice = interrupt.choices[selectedIndex];

    console.log(chalk.bold.green(`✅ Selected: ${selectedChoice}\n`));

    return response.choice;
  }
}

async function startChatSession(isAskMode: boolean, initialMessage?: string) {
  const thread_id = isAskMode ? null : crypto.randomUUID();
  if (thread_id) console.log(chalk.bold.red(`\n🧵 Thread ID: ${thread_id}`));
  clearChatSession();
  startupMessage();

  let history = loadHistory();

  const userName = await getUserName();

  const interruptHandler = new InterruptHandler();

  let isFirstIteration = true;

  while (!abortController.signal.aborted) {
    const promptPrefix = chalk.bold.magenta(`${userName}: `);

    let prompt: string;
    const pendingInterrupt = interruptHandler.getPendingInterrupt();

    if (pendingInterrupt) {
      const choiceResponse = await interruptHandler.resolvePendingInterrupt();
      prompt = choiceResponse || "";
    } else if (isFirstIteration && initialMessage) {
      // Use the initial message on first iteration if provided
      prompt = initialMessage;
      console.log(promptPrefix + chalk.whiteBright(initialMessage));
      isFirstIteration = false;
    } else {
      prompt = await inputWithHistory(promptPrefix, history);
      isFirstIteration = false;
    }

    if (prompt.trim() === "") {
      console.log(chalk.yellowBright("Please enter a prompt."));
      continue;
    }

    const commandResult = await handleChatCommand(prompt);

    if (commandResult.shouldExit) {
      break;
    }

    if (commandResult.shouldContinue) {
      continue;
    }

    history = saveToHistory(prompt, history);

    try {
      await streamAIResponse({
        prompt,
        userName,
        thread_id,
        interruptHandler,
        signal: abortController.signal,
      });
    } catch (error) {
      console.error(chalk.redBright("\nAn error occurred:"), error);
    }
  }
}

program.action(async (options) => {
  const isAskMode = options.askMode;

  clearTerminal();

  await startChatSession(isAskMode, options.message);
});

program.parse();
