import pino from "pino";
import { env } from "./env.ts";

// Pretty-print outside production so local dev gets readable lines instead
// of one-line JSON. `pino-pretty` is loaded as a transport rather than a
// dep — pino resolves it lazily, so production runs without paying for it.
const isProd = process.env.NODE_ENV === "production";

export const log = pino({
  level: env.LOG_LEVEL,
  // null (not undefined) actually strips pid+hostname — undefined falls
  // through to pino's default bindings.
  base: null,
  ...(isProd
    ? {}
    : {
        transport: {
          target: "pino-pretty",
          options: {
            colorize: true,
            translateTime: "HH:MM:ss.l",
            ignore: "pid,hostname",
          },
        },
      }),
});
