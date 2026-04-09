FROM oven/bun:1.1.4-debian

WORKDIR /app

COPY package.json bun.lockb ./
RUN bun install --frozen-lockfile

COPY apps/server/src ./apps/server/src
COPY apps/web/src ./apps/web/src
COPY apps/web/index.html ./apps/web/
COPY apps/web/package.json ./apps/web/
COPY apps/web/vite.config.ts ./apps/web/
COPY apps/web/tsconfig.json ./apps/web/

RUN bun run --cwd apps/web build

RUN bun build apps/server/src/index.ts --outdir dist --target bun

EXPOSE 3000

CMD ["bun", "dist/index.js"]
