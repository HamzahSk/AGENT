FROM oven/bun:1.4.4 AS bun
FROM node:24-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production MALLOC_ARENA_MAX=2
RUN apt-get update -y && apt-get install -y --no-install-recommends ffmpeg build-essential && rm -rf /var/lib/apt/lists/*
COPY --from=bun /usr/local/bin/bun /usr/local/bin/bun
COPY package.json bun.lock ./
RUN bun install --production --frozen-lockfile
COPY . .
# Supply config.js and persistent state via mounts; they are excluded from images.
CMD ["node", "--max-old-space-size=300", "--expose-gc", "index.js"]
