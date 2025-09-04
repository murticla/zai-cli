import type { ChalkInstance } from "chalk";
import chalk from "chalk";

/**
 * Color utilities for stream output
 */
function randomColor(agentName: string): ChalkInstance {
  const hash = agentName.split("").reduce((acc, char) => {
    return acc + char.charCodeAt(0);
  }, 0);

  const colors = [
    chalk.cyanBright,
    chalk.yellowBright,
    chalk.redBright,
    chalk.rgb(255, 165, 0),
    chalk.greenBright,
    chalk.magentaBright,
    chalk.rgb(0, 255, 255),
    chalk.rgb(255, 105, 180),
    chalk.rgb(0, 255, 128),
    chalk.rgb(255, 215, 0),
  ];

  const colorIndex = Math.abs(hash) % colors.length;
  return colors[colorIndex];
}

function randomBgColor(agentName: string): ChalkInstance {
  const hash = agentName.split("").reduce((acc, char) => {
    return acc + char.charCodeAt(0);
  }, 0);

  const bgColors = [
    chalk.bgCyanBright,
    chalk.bgYellowBright,
    chalk.bgRedBright,
    chalk.bgRgb(255, 165, 0),
    chalk.bgGreenBright,
    chalk.bgMagentaBright,
    chalk.bgRgb(0, 255, 255),
    chalk.bgRgb(255, 105, 180),
    chalk.bgRgb(0, 255, 128),
    chalk.bgRgb(255, 215, 0),
  ];

  const colorIndex = Math.abs(hash) % bgColors.length;
  return bgColors[colorIndex];
}

export function getAgentColor(agentName: string): ChalkInstance {
  if (agentName.includes("planner")) {
    return chalk.magentaBright;
  }
  if (agentName.includes("summarizer")) {
    return chalk.greenBright;
  }
  if (agentName.includes("tool_call")) {
    return chalk.blueBright;
  }
  if (agentName.includes("tool_end")) {
    return chalk.yellowBright;
  }
  return randomColor(agentName);
}

export function getAgentBgColor(agentName: string): ChalkInstance {
  if (agentName.includes("planner")) {
    return chalk.bgMagentaBright;
  }
  if (agentName.includes("summarizer")) {
    return chalk.bgGreenBright;
  }
  if (agentName.includes("tool_call")) {
    return chalk.bgBlueBright;
  }
  if (agentName.includes("tool_end")) {
    return chalk.bgYellowBright;
  }
  return randomBgColor(agentName);
}


/**
 * Message formatting utilities
 */
/**
 * Attempts to format a message as JSON if possible, otherwise returns the original message
 */
export function formatMessage(message: string): string {
  const safeMessage = message?.trim() || "No message provided";

  try {
    const parsed = JSON.parse(safeMessage);
    if (typeof parsed === "string") {
      try {
        const doubleParsed = JSON.parse(parsed);
        return JSON.stringify(doubleParsed, null, 2);
      } catch {
        return JSON.stringify(parsed, null, 2);
      }
    } else {
      return JSON.stringify(parsed, null, 2);
    }
  } catch {
    // Not JSON, keep as is
    return safeMessage;
  }
}
