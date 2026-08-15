# SafeOps web app.
#
# Vite inlines VITE_* variables at build time, so the API URL is a build argument rather
# than a runtime environment variable. Changing which API a deployed bundle talks to means
# rebuilding it — which is why the compose file passes it in explicitly.
#
# Build from the repository root:
#   docker build -f web/Dockerfile --build-arg VITE_API_BASE_URL=https://api.example.com -t safeops-web .

FROM node:24-alpine@sha256:d32cdf619f63fe0471182d08996dd516c6275bb5fd31ae06e55a570bd9e1ad43 AS deps
WORKDIR /app
COPY web/package*.json ./
RUN npm ci

FROM node:24-alpine@sha256:d32cdf619f63fe0471182d08996dd516c6275bb5fd31ae06e55a570bd9e1ad43 AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY web/ ./

# No default. A bundle built without this falls back to in-browser mock authentication,
# which the app now refuses at sign-in — but failing the build is better than shipping an
# artefact that can only report its own misconfiguration.
ARG VITE_API_BASE_URL
RUN test -n "$VITE_API_BASE_URL" || (echo "VITE_API_BASE_URL build arg is required" && exit 1)
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL
RUN npm run build

FROM nginx:1.27-alpine@sha256:65645c7bb6a0661892a8b03b89d0743208a18dd2f3f17a54ef4b76fb8e2f2a10 AS runtime
COPY --from=build /app/dist /usr/share/nginx/html
COPY web/nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://127.0.0.1:8080/ >/dev/null || exit 1
