FROM node:22-slim AS builder

RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY tsconfig.json vite.config.ts vite-env.d.ts index.html index.css main.tsx App.tsx ./
COPY components ./components
COPY context ./context
COPY services ./services
COPY types ./types
COPY public ./public

RUN npm run build && npm prune --omit=dev

FROM node:22-slim AS runner

ARG APP_VERSION=1.0.0
ENV NODE_ENV=production
ENV PORT=3001
ENV APP_VERSION=${APP_VERSION}

WORKDIR /app

COPY package.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY server ./server
COPY public ./public
COPY --from=builder /app/dist ./dist

RUN mkdir -p /app/data /app/uploads && chown -R node:node /app

USER node

EXPOSE 3001

HEALTHCHECK --interval=15s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:' + (process.env.PORT || 3001) + '/health').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

CMD ["node", "server/server.js"]
