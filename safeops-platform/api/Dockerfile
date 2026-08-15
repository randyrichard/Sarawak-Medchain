# SafeOps API.
#
# Multi-stage so the shipped image carries the compiled output and production dependencies
# only — no TypeScript, no test runner, no Prisma CLI beyond what migration needs.
#
# Build from the repository root:
#   docker build -f api/Dockerfile -t safeops-api .

FROM node:24-alpine AS deps
WORKDIR /app
# Copied on their own so a dependency layer is only rebuilt when the manifests change.
COPY api/package*.json ./
RUN npm ci

FROM node:24-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY api/ ./
# The client is generated from the schema, so it must exist before tsc runs.
RUN npx prisma generate && npm run build

FROM node:24-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production

# Postgres client tools, so `pg_dump` is available inside the container for backups. The
# in-app snapshot is a restore point, not disaster recovery; this is what DR uses.
RUN apk add --no-cache postgresql16-client

COPY api/package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --from=build /app/dist ./dist
# Prisma needs the schema and the migration history at runtime for `migrate deploy`, and
# the generated client that the build produced.
COPY --from=build /app/prisma ./prisma
COPY --from=build /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=build /app/node_modules/@prisma ./node_modules/@prisma

# Copied with the executable bit set explicitly: the repository is developed on Windows,
# where the mode bit does not survive, and a non-executable entrypoint fails the container
# at start with "permission denied" and nothing else.
COPY --chmod=0755 api/docker-entrypoint.sh /usr/local/bin/safeops-entrypoint

# Evidence lives here. Mount a volume over it: without one, every uploaded photograph is
# discarded when the container is replaced.
ENV UPLOAD_DIR=/data/uploads
RUN mkdir -p /data/uploads && chown -R node:node /data

# Unprivileged from here on. `node` is provided by the base image.
USER node

EXPOSE 4000

# Liveness is the process; readiness checks the database. The orchestrator should use
# /health/ready before sending traffic, and /health to decide whether to restart.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:4000/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

# Migrations run before the server accepts traffic, so a deploy can never serve against a
# schema it does not expect. The entrypoint ends in `exec node`, which makes node PID 1 so
# that `docker stop` reaches the drain logic in server.ts — see the script for why that
# matters. Do not change this back to `npm run start:deploy`.
CMD ["/usr/local/bin/safeops-entrypoint"]
