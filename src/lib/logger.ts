import pino from "pino";

/**
 * Structured application logger (pino).
 *
 * No paid vendor required — logs go to stdout, which Vercel captures.
 * In non-production we route through a `pino-pretty` transport for readable
 * dev output; in production we emit plain JSON straight to stdout.
 *
 * Level is taken from `LOG_LEVEL` (default `info`).
 *
 * The instance is cached on `globalThis` so Next.js hot reloads (and any other
 * module re-evaluation) reuse the same logger instead of spawning a fresh
 * pino-pretty worker thread each time — mirroring the db/index.ts pattern.
 */

declare global {
  // eslint-disable-next-line no-var
  var __logger__: pino.Logger | undefined;
}

function createRootLogger(): pino.Logger {
  const level = process.env.LOG_LEVEL || "info";

  if (process.env.NODE_ENV !== "production") {
    return pino({
      level,
      transport: {
        target: "pino-pretty",
        options: {
          colorize: true,
          translateTime: "SYS:standard",
          ignore: "pid,hostname",
        },
      },
    });
  }

  return pino({ level });
}

export const logger: pino.Logger = (globalThis.__logger__ ??= createRootLogger());

/** Create a child logger with the given bindings (e.g. `{ scope: "cron" }`). */
export function createLogger(bindings: Record<string, unknown>): pino.Logger {
  return logger.child(bindings);
}
