# SafeOps API.
#
# Base image is pinned by digest, not by tag.
#
# `node:24-alpine` is a moving target: it followed Alpine 3.21 when this was written and
# resolves to 3.24.1 today. That drift is not cosmetic - the Alpine version determines the
# openssl major, which determines which Prisma query engine is correct, and a mismatch
# there fails at run time in a container that built perfectly.
#
# The trade-off is deliberate: pinned images do not pick up base-image security patches on
# their own. Re-pin on a schedule with:
#   docker pull node:24-alpine && docker image inspect node:24-alpine --format '{{index .RepoDigests 0}}'
# then rebuild and run the suite.
#
#
# Multi-stage so the shipped image carries the compiled output and production dependencies
# only — no TypeScript, no test runner, no Prisma CLI beyond what migration needs.
#
# Build from the repository root:
#   docker build -f api/Dockerfile -t safeops-api .

FROM node:24-alpine@sha256:d32cdf619f63fe0471182d08996dd516c6275bb5fd31ae06e55a570bd9e1ad43 AS deps
WORKDIR /app
# Copied on their own so a dependency layer is only rebuilt when the manifests change.
COPY api/package*.json ./
RUN npm ci

FROM node:24-alpine@sha256:d32cdf619f63fe0471182d08996dd516c6275bb5fd31ae06e55a570bd9e1ad43 AS build
WORKDIR /app
# Must match the runtime stage. `prisma generate` picks which query engine to fetch by
# probing the libssl version it can see: without openssl here it produces the plain
# linux-musl engine, the runtime (which has openssl 3) then looks for
# linux-musl-openssl-3.0.x, finds nothing, and every database call fails at run time while
# the build and the image both look perfectly fine.
RUN apk add --no-cache openssl
COPY --from=deps /app/node_modules ./node_modules
COPY api/ ./
# The client is generated from the schema, so it must exist before tsc runs.
RUN npx prisma generate && npm run build

FROM node:24-alpine@sha256:d32cdf619f63fe0471182d08996dd516c6275bb5fd31ae06e55a570bd9e1ad43 AS runtime
WORKDIR /app
ENV NODE_ENV=production

# Postgres client tools, so `pg_dump` is available inside the container for backups. The
# in-app snapshot is a restore point, not disaster recovery; this is what DR uses.
#
# openssl is not optional. Prisma picks its query engine by probing the libssl version, and
# on a bare Alpine image that probe fails: it warns "failed to detect the libssl/openssl
# version", falls back to an openssl-1.1.x engine that does not match, and the first
# database call fails. Installed rather than worked around, because the engine choice has
# to be right for `migrate deploy` at startup.
RUN apk add --no-cache postgresql16-client openssl

# Copied with the executable bit set explicitly: the repository is developed on Windows,
# where the mode bit does not survive, and a non-executable entrypoint fails the container
# at start with "permission denied" and nothing else. Done while still root, because it
# lands outside /app.
COPY --chmod=0755 api/docker-entrypoint.sh /usr/local/bin/safeops-entrypoint
# Line endings are stripped for the same reason. Git on Windows checks shell scripts out
# with CRLF unless told otherwise, the shebang becomes "/bin/sh\r", and the container
# restarts forever with exit code 127 ("not found") and no other message.
# .gitattributes pins *.sh to LF; this keeps an image built from a checkout made before
# that rule, or with it overridden, from failing the same way.
RUN sed -i 's/\r$//' /usr/local/bin/safeops-entrypoint

# Evidence lives here. Mount a volume over it: without one, every uploaded photograph is
# discarded when the container is replaced.
ENV UPLOAD_DIR=/data/uploads
RUN mkdir -p /data/uploads /app && chown -R node:node /data /app

# Unprivileged from here on, and deliberately *before* the dependency install. `node` is
# provided by the base image.
#
# The process runs as `node` and `prisma migrate deploy` writes into
# node_modules/@prisma/engines at startup, so that tree has to be node-owned or the
# container dies on its first command. Ownership is established by installing and copying
# as the right user rather than by a `chown -R /app` afterwards: chown rewrites every file
# it touches, and as a separate layer that duplicated the whole of node_modules — 267 MB of
# image for a metadata change.
USER node

COPY --chown=node:node api/package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --from=build --chown=node:node /app/dist ./dist
# Prisma needs the schema and the migration history at runtime for `migrate deploy`, and
# the generated client that the build produced.
COPY --from=build --chown=node:node /app/prisma ./prisma
COPY --from=build --chown=node:node /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=build --chown=node:node /app/node_modules/@prisma ./node_modules/@prisma

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
