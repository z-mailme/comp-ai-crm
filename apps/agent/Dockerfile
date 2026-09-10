FROM oven/bun:1.3.12 AS bun

FROM node:24-bookworm-slim

WORKDIR /app

COPY --from=bun /usr/local/bin/bun /usr/local/bin/bun

COPY . .

RUN node --version
RUN bun --version

RUN bun install --frozen-lockfile

RUN bun run build --filter=agent

ENV NODE_ENV=production
ENV AGENT_PORT=2000

EXPOSE 2000

CMD ["bun", "run", "--filter=agent", "start"]
