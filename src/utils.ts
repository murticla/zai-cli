import chalk from "chalk";

export function startupMessage() {
  console.log(chalk.bold.cyan("🤖 AI Chat CLI"));
  console.log(chalk.whiteBright("Use ↑/↓ arrow keys to navigate history."));
  console.log(chalk.whiteBright("Type /'exit' or press Ctrl+C to quit."));
  console.log(
    chalk.whiteBright("Type '/save' to save chat history to log file.")
  );
  console.log(
    chalk.whiteBright("Type '/reset' to clear chat history and cli.")
  );
}
