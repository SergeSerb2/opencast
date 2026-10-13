/**
 * Backend logger. stdout belongs to the native JSON-RPC channel, so every log
 * line goes to stderr (the native host redirects it to backend.log).
 */

type Level = "debug" | "info" | "warn" | "error";

const LEVELS: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 };
let threshold = LEVELS[((process.env.OPENCAST_LOG_LEVEL ?? process.env.SURGECAST_LOG_LEVEL) as Level) ?? "info"] ?? LEVELS.info;

export function setLogLevel(level: Level): void {
  threshold = LEVELS[level];
}

function write(level: Level, scope: string, message: string, extra?: unknown): void {
  if (LEVELS[level] < threshold) return;
  const time = new Date().toISOString();
  let line = `${time} ${level.toUpperCase().padEnd(5)} [${scope}] ${message}`;
  if (extra !== undefined) {
    if (extra instanceof Error) line += ` ${extra.stack ?? extra.message}`;
    else {
      try {
        line += ` ${JSON.stringify(extra)}`;
      } catch {
        line += ` ${String(extra)}`;
      }
    }
  }
  process.stderr.write(line + "\n");
}

export interface Logger {
  debug(message: string, extra?: unknown): void;
  info(message: string, extra?: unknown): void;
  warn(message: string, extra?: unknown): void;
  error(message: string, extra?: unknown): void;
  child(scope: string): Logger;
}

export function createLogger(scope: string): Logger {
  return {
    debug: (m, e) => write("debug", scope, m, e),
    info: (m, e) => write("info", scope, m, e),
    warn: (m, e) => write("warn", scope, m, e),
    error: (m, e) => write("error", scope, m, e),
    child: (sub) => createLogger(`${scope}:${sub}`),
  };
}
