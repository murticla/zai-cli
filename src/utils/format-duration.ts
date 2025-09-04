import {
  formatDuration as formatDateFnsDuration,
  intervalToDuration,
} from "date-fns";
export function formatDuration(durationMs: number): string {
  if (durationMs < 1000) return `${durationMs}ms`;
  const seconds = durationMs / 1000;
  if (seconds < 60) return `${seconds.toFixed(4).replace(/\.?0+$/, "")}s`;
  const duration = intervalToDuration({ start: 0, end: durationMs });
  if (duration.minutes)
    return formatDateFnsDuration(duration, { format: ["minutes", "seconds"] });
  return formatDateFnsDuration(duration, { format: ["seconds"] });
}
