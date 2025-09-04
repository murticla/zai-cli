import chalk from "chalk";
import fs from "node:fs";

// History management
const HISTORY_FILE = ".terminal_history";
const MAX_HISTORY_SIZE = 30;

export function loadHistory(): string[] {
  try {
    if (fs.existsSync(HISTORY_FILE)) {
      const content = fs.readFileSync(HISTORY_FILE, "utf-8");
      return content.split("\n").filter((line) => line.trim() !== "");
    }
  } catch (error) {
    console.log(chalk.yellowBright("Warning: Could not load history file"));
  }
  return [];
}

export function saveToHistory(command: string, history: string[]): string[] {
  if (command.trim() === "") return history;

  // Dedupe
  const filteredHistory = history.filter((item) => item !== command);

  filteredHistory.push(command);

  // Keep only last MAX_HISTORY_SIZE items
  const trimmedHistory = filteredHistory.slice(-MAX_HISTORY_SIZE);

  try {
    fs.writeFileSync(HISTORY_FILE, `${trimmedHistory.join("\n")}\n`);
  } catch (error) {
    console.log(chalk.yellowBright("Warning: Could not save to history file"));
  }

  return trimmedHistory;
}
