# syntax=docker/dockerfile:1
FROM node:22-slim AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable && corepack prepare pnpm@8.15.5 --activate
WORKDIR /app

FROM base AS builder
# Instalar dependencias para compilar módulos nativos (better-sqlite3)
RUN apt-get update && apt-get install -y python3 make g++ && rm -rf /var/lib/apt/lists/*
COPY package.json pnpm-lock.yaml ./
# Usamos node-linker=hoisted para poder copiar la carpeta node_modules sin symlinks
# IMPORTANTE: No usar --ignore-scripts para que better-sqlite3 pueda compilar sus binarios
RUN pnpm install --prod --frozen-lockfile=false --config.node-linker=hoisted --config.ignore-scripts=false

FROM base AS runner
ENV NODE_ENV=production
COPY --from=builder /app/node_modules ./node_modules
COPY . .
EXPOSE 1234
RUN mkdir -p /app/data && chown -R node:node /app/data
VOLUME ["/app/data"]
# Ejecutar como usuario sin privilegios por seguridad (Estado del arte)
USER node
CMD ["node", "server.js"]
