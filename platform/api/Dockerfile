# ── Build stage ──────────────────────────────────────────────────────────────
FROM node:20-alpine AS build
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci --no-audit --no-fund
COPY prisma ./prisma
RUN npx prisma generate
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# ── Runtime stage ────────────────────────────────────────────────────────────
FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production
RUN addgroup -S emc && adduser -S emc -G emc
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev --no-audit --no-fund
COPY prisma ./prisma
RUN npx prisma generate
COPY --from=build /app/dist ./dist
USER emc
EXPOSE 3005
HEALTHCHECK --interval=30s --timeout=3s CMD wget -qO- http://localhost:3005/healthz || exit 1
CMD ["node", "dist/server.js"]
