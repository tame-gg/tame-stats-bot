FROM oven/bun:1-alpine

# Tells log.ts to skip the pino-pretty transport — that package is a
# devDependency and isn't installed when bun install is run with --production.
ENV NODE_ENV=production

WORKDIR /app
COPY . .
RUN if [ -f bun.lock ] || [ -f bun.lockb ]; then bun install --frozen-lockfile --production; else bun install --production; fi

# Health check port (override with HEALTH_PORT env var; set to 0 to disable).
EXPOSE 3000

CMD ["bun", "run", "src/index.ts"]
