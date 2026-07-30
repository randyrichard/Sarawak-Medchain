# Docker verification — BLOCKED, commands to run elsewhere

Phase 1 could not be executed on this machine. **Nothing below has been run.** It is
written so that it can be, on a host that has Docker.

## What is missing, exactly

Checked 31 July 2026:

```
docker            absent from PATH
docker.exe        absent from PATH
docker-compose    absent from PATH
podman            absent from PATH
nerdctl           absent from PATH
buildah           absent from PATH
colima            absent from PATH

C:\Program Files\Docker            does not exist
C:\ProgramData\DockerDesktop       does not exist
%LOCALAPPDATA%\Docker              does not exist

wsl.exe --status  →  "The Windows Subsystem for Linux is not installed."
Hyper-V state     →  cannot query: "The requested operation requires elevation"
running as admin  →  False
```

All three blockers are present at once:

1. **Docker Desktop is not installed** — no binary, no installation directory.
2. **WSL2 is not installed** — Docker Desktop on Windows requires it, or Hyper-V.
3. **No administrator rights** — installing either needs elevation and a reboot.

None of these can be resolved from inside this session.

## Prerequisites on the target host

**Windows** — needs administrator rights and a reboot:

```
wsl --install
```

```
winget install Docker.DockerDesktop
```

**Linux** — simpler, and what production will run anyway:

```
curl -fsSL https://get.docker.com | sh
```

```
sudo usermod -aG docker "$USER"
```

## Run this

`safeops-platform/scripts/verify-docker.sh` performs every check below and stops at the
first failure:

```bash
cd safeops-platform && bash scripts/verify-docker.sh
```

It needs `.env.prod` — see [DEPLOYMENT.md](DEPLOYMENT.md).

## What it checks, and what to expect

### 1. Build each image on its own

```bash
docker build -f api/Dockerfile -t safeops-api:verify .
```

```bash
docker build -f web/Dockerfile --build-arg VITE_API_BASE_URL=http://localhost:4000 -t safeops-web:verify .
```

The web build **must fail** when the build arg is omitted — the Dockerfile asserts it.
Confirm that, because a build that succeeds here produces a bundle that cannot reach any
backend:

```bash
docker build -f web/Dockerfile -t safeops-web:should-fail . ; echo "exit=$?"
```

Expect non-zero and `VITE_API_BASE_URL build arg is required`.

### 2. Compose build and up

```bash
docker compose -f docker-compose.prod.yml --env-file .env.prod build
```

```bash
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d
```

```bash
docker compose -f docker-compose.prod.yml --env-file .env.prod ps
```

Expect three services — `db`, `api`, `web` — with `db` healthy.

### 3. Container networking

The API must reach Postgres by service name, and Postgres must **not** be reachable from
the host.

```bash
docker compose -f docker-compose.prod.yml exec api getent hosts db
```

```bash
docker compose -f docker-compose.prod.yml port db 5432 ; echo "exit=$? — non-zero is correct, db must not be published"
```

### 4. Health endpoints

```bash
curl -fsS http://localhost:4000/health
```

```bash
curl -fsS http://localhost:4000/health/ready
```

```bash
docker inspect --format '{{.State.Health.Status}}' $(docker compose -f docker-compose.prod.yml ps -q api)
```

Expect `{"status":"ok",…}`, `{"status":"ready"}` and `healthy`.

### 5. Persistent volumes

```bash
docker volume ls | grep safeops
```

Expect `safeops_pgdata`, `safeops_uploads`, `safeops_backups`.

```bash
docker inspect --format '{{range .Mounts}}{{.Destination}} <- {{.Name}}{{"\n"}}{{end}}' $(docker compose -f docker-compose.prod.yml ps -q api)
```

`/data/uploads` must map to the named volume, not the container filesystem.

### 6. Database persistence across a full teardown

**The check that matters.** `down` without `-v` must keep the data.

```bash
docker compose -f docker-compose.prod.yml exec -T db psql -U safeops -d safeops -c 'SELECT count(*) FROM "Company";'
```

```bash
docker compose -f docker-compose.prod.yml --env-file .env.prod down
```

```bash
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d
```

```bash
docker compose -f docker-compose.prod.yml exec -T db psql -U safeops -d safeops -c 'SELECT count(*) FROM "Company";'
```

The two counts must match. A zero means the volume is not persisting and **no customer
data is safe** — stop everything and fix that first.

```bash
docker compose -f docker-compose.prod.yml exec api ls /data/uploads
```

### 7. Restart behaviour

```bash
docker compose -f docker-compose.prod.yml restart api
```

```bash
docker compose -f docker-compose.prod.yml exec api sh -c 'kill 1'
```

```bash
sleep 15 && docker compose -f docker-compose.prod.yml ps api
```

Expect it back up — `restart: unless-stopped` is set on every service.

```bash
docker compose -f docker-compose.prod.yml stop api && docker compose -f docker-compose.prod.yml logs --tail=5 api
```

Expect `[safeops-api] SIGTERM received, draining…`.

### 8. Image size

```bash
docker images safeops-api:verify safeops-web:verify --format '{{.Repository}}:{{.Tag}}  {{.Size}}'
```

| Image | Expected | If much larger |
|---|---|---|
| `safeops-api` | 300–450 MB | Dev dependencies leaked into the runtime stage, or the build context was not ignored |
| `safeops-web` | 50–80 MB | The nginx stage is copying more than `dist` |

```bash
docker history safeops-api:verify --format '{{.Size}}\t{{.CreatedBy}}' | head -15
```

### 9. Production startup

```bash
docker compose -f docker-compose.prod.yml logs api | head -20
```

Expect, in order:

```
Applying migration …                                   (first start only)
[safeops-api] scheduler running every 15 min
[safeops-api] listening on :4000 (production)
```

Then verify the deployed instance behaves:

```bash
cd api && npx tsx scripts/security-probe.ts http://localhost:4000
```

```bash
cd api && npx tsx scripts/headers-probe.ts http://localhost:4000 http://localhost:8080
```

Expect `26/26 checks passed` and a refresh cookie with `HttpOnly`, `Secure`,
`SameSite=Strict`.

## Cleaning up

```bash
docker compose -f docker-compose.prod.yml --env-file .env.prod down
```

```bash
docker compose -f docker-compose.prod.yml --env-file .env.prod down -v
```

The second removes the volumes and all data. Throwaway hosts only.

## What has been verified natively, without Docker

So the untested surface is explicit rather than assumed:

| Step the image performs | Verified |
|---|---|
| `npm ci --omit=dev` | Yes — and the `prisma` CLI survives it, because `@prisma/client` depends on it, so `migrate deploy` will run |
| `npx prisma generate` | Yes |
| `npm run build` | Yes — emits `dist/server.js` |
| `node dist/server.js` | Yes — boots and serves in production mode; both health endpoints respond |
| `prisma migrate deploy` | Yes — 15 migrations applied to an empty database |
| Vite build with `VITE_API_BASE_URL` | Yes |
| **The Dockerfiles themselves** | **No** |
| **Compose networking** | **No** |
| **Volume persistence** | **No** |
| **Image size** | **No** |
