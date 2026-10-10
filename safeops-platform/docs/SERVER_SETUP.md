# Server setup

Preparing a host to run SafeChain for one customer. Ubuntu 22.04 or 24.04 LTS; adapt as
needed. Roughly 45 minutes.

**None of this has been executed** — there is no server to execute it on from here. It is
written from the requirements the application actually has, which are verified.

## Sizing

| | Pilot (20–40 users) | Why |
|---|---|---|
| vCPU | 2 | Measured: 100 concurrent users give p95 563 ms. A pilot is nowhere near that |
| RAM | 4 GB | API 196 MB steady, 465 MB peak under 1000 concurrent; PostgreSQL 256 MB shared buffers |
| Disk | 50 GB | Database, uploads, and 30 days of backups with room to be surprised |
| Bandwidth | Any | The bundle is 156 kB gzipped; API responses are small JSON |

Uploads are the only component that grows without bound — that is the customer's evidence
and it is never deleted. Watch it monthly rather than sizing for it now.

## 1. Base

```bash
sudo apt update && sudo apt upgrade -y
```

```bash
sudo timedatectl set-timezone Asia/Kuching
```

Timezone matters more than it looks: SafeChain stores date-only values at UTC midnight, and
a host in the wrong zone makes "due today" mean the wrong day to the people using it.

```bash
sudo apt install -y curl git ufw fail2ban unattended-upgrades
```

## 2. A non-root user

```bash
sudo adduser --disabled-password --gecos "" safeops
```

```bash
sudo usermod -aG sudo safeops
```

```bash
sudo rsync --archive --chown=safeops:safeops ~/.ssh /home/safeops
```

Then disable password and root SSH login:

```bash
sudo sed -i 's/^#\?PermitRootLogin.*/PermitRootLogin no/; s/^#\?PasswordAuthentication.*/PasswordAuthentication no/' /etc/ssh/sshd_config
```

```bash
sudo systemctl restart ssh
```

**Open a second SSH session and confirm you can still get in before closing the first.**
Locking yourself out of a customer's server on setup day is a memorable way to start.

## 3. Firewall

Only three ports. The API and web containers are reached through the reverse proxy, and
PostgreSQL is never published at all.

```bash
sudo ufw default deny incoming && sudo ufw default allow outgoing
```

```bash
sudo ufw allow OpenSSH && sudo ufw allow 80/tcp && sudo ufw allow 443/tcp
```

```bash
sudo ufw --force enable && sudo ufw status verbose
```

## 4. Docker

```bash
curl -fsSL https://get.docker.com | sudo sh
```

```bash
sudo usermod -aG docker safeops
```

Log out and back in, then confirm it works without sudo:

```bash
docker run --rm hello-world
```

```bash
docker compose version
```

## 5. Directories

```bash
sudo mkdir -p /srv/safeops /backups
```

```bash
sudo chown -R safeops:safeops /srv/safeops /backups
```

`/backups` on a separate volume if you have one. A backup on the same disk as the data
survives a database corruption but not a disk failure — and it is a disk failure you are
insuring against.

## 6. The application

```bash
cd /srv && git clone <repository-url> safeops && cd safeops/safeops-platform
```

```bash
cp .env.prod.example .env.prod && chmod 600 .env.prod
```

```bash
npm run keygen
```

Paste both key values into `.env.prod`, then fill in the database password
(`openssl rand -base64 24`) and the two hostnames.

```bash
node scripts/validate-compose.mjs
```

```bash
bash scripts/verify-docker.sh
```

`verify-docker.sh` is the gate. It builds both images, brings the stack up, and — the check
that matters — tears it fully down and back up to prove the volumes persist.

## 7. TLS

Caddy is simpler and obtains certificates itself:

```bash
sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https
```

```bash
curl -1sLf https://dl.cloudsmith.io/public/caddy/stable/gpg.key | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
```

```bash
curl -1sLf https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt | sudo tee /etc/apt/sources.list.d/caddy-stable.list
```

```bash
sudo apt update && sudo apt install -y caddy
```

```bash
sudo cp deploy/Caddyfile /etc/caddy/Caddyfile
```

Edit the two hostnames and the email, then:

```bash
sudo caddy validate --config /etc/caddy/Caddyfile && sudo systemctl reload caddy
```

DNS must already point at this host or the certificate request will fail.

For nginx instead, use `deploy/nginx-safeops.conf` with certbot — see the header of that
file.

## 8. Start on boot

```bash
sudo tee /etc/systemd/system/safeops.service >/dev/null <<'EOF'
[Unit]
Description=SafeChain
Requires=docker.service
After=docker.service network-online.target

[Service]
Type=oneshot
RemainAfterExit=yes
User=safeops
WorkingDirectory=/srv/safeops/safeops-platform
ExecStart=/srv/safeops/safeops-platform/deploy/startup.sh
ExecStop=/usr/bin/docker compose -f docker-compose.prod.yml --env-file .env.prod stop
TimeoutStartSec=300

[Install]
WantedBy=multi-user.target
EOF
```

```bash
sudo systemctl daemon-reload && sudo systemctl enable --now safeops
```

`startup.sh` waits for readiness and fails loudly if migrations are still pending, so a
boot that half-works does not look like a boot that worked.

## 9. Backups on a schedule

```bash
crontab -e
```

```cron
0 2 * * * cd /srv/safeops/safeops-platform && deploy/backup.sh >> /var/log/safeops-backup.log 2>&1
0 3 * * * rclone copy /backups remote:safeops-backups --max-age 48h >> /var/log/safeops-offsite.log 2>&1
*/15 * * * * cd /srv/safeops/safeops-platform && deploy/healthcheck.sh --quiet || echo "SafeChain health check failed at $(date)" >> /var/log/safeops-health.log
```

## 10. Verify the host

```bash
sudo reboot
```

Then, once it is back:

```bash
cd /srv/safeops/safeops-platform && deploy/healthcheck.sh
```

It must pass **without anyone touching it**. If it does not, the systemd unit is wrong and
you have found out now rather than after the next power cut.

Finally, work through [CUSTOMER_ACCEPTANCE.md](CUSTOMER_ACCEPTANCE.md) with the customer.
