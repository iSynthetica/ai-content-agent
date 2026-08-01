# Deployment on a single VPS (Hetzner Cloud)

Runbook for deploying the whole stack to one server. The architecture fits a single VPS almost
one-to-one, because the long-running BullMQ worker rules out serverless platforms like Vercel.

Public surface is **web only**. Postgres, Redis, api and worker live inside the Docker network and
are never exposed. TLS is terminated by Caddy using a Cloudflare Origin Certificate.

```
Internet -> Cloudflare (proxy, HTTPS) -> Caddy :443 -> web:3000
                                                          -> api:4000 (internal)
                                                              -> postgres, redis (internal)
                                          worker -> postgres, redis, OpenAI, Tavily
```

---

## 0. Create the server

Hetzner Cloud console -> Add Server:

- Type: **CAX21** (ARM, 4 vCPU, 8 GB, ~EUR 8/mo). 8 GB is needed because `next build` runs on the
  server; 4 GB can OOM. x86 alternative: **CPX31**.
- Image: **Ubuntu 24.04**.
- SSH key: add yours (not a password).
- Create a **Hetzner Cloud Firewall** and attach it: allow inbound **22, 80, 443** only.

## 1. DNS on Cloudflare

- Add an **A record**: `@` (or a subdomain) -> server IP, proxy **on** (orange cloud).
- SSL/TLS mode: **Full (strict)**.
- SSL/TLS -> Origin Server -> **Create Certificate**. Save the two blocks as
  `deploy/certs/origin.pem` (certificate) and `deploy/certs/origin.key` (private key).

## 2. Prepare the server

```bash
ssh root@SERVER_IP

# Docker + compose plugin
apt-get update && apt-get install -y docker.io docker-compose-v2 git
systemctl enable --now docker

git clone https://github.com/iSynthetica/ai-content-agent.git
cd ai-content-agent
```

## 3. Secrets and certificate

```bash
cp deploy/.env.prod.example deploy/.env.prod
# fill DOMAIN, generate the rest:
#   openssl rand -base64 32   (AUTH_SECRET and each DB / Redis password)
# add OPENAI_API_KEY (and TAVILY_API_KEY for web search)
nano deploy/.env.prod

mkdir -p deploy/certs
nano deploy/certs/origin.pem    # paste the Cloudflare origin certificate
nano deploy/certs/origin.key    # paste the private key
chmod 600 deploy/certs/origin.key
```

## 4. Build and start

```bash
docker compose --env-file deploy/.env.prod -f deploy/compose.prod.yml up -d --build
```

api and worker will restart-loop until the database is migrated and role passwords are rotated
(next step) - that is expected.

## 5. Initialise the database

All admin tasks run in a throwaway `api` container, because only it carries the owner connection
string and it contains every package (including the worker scripts).

```bash
C="docker compose --env-file deploy/.env.prod -f deploy/compose.prod.yml"

# 5a. schema
$C run --rm api pnpm db:migrate

# 5b. rotate the app/sweeper role passwords to the .env.prod values
#     (the migration creates them with the fixed passwords 'app' / 'sweeper')
source deploy/.env.prod
$C exec postgres psql -U forteq_owner -d forteq -c \
  "ALTER ROLE forteq_app PASSWORD '${POSTGRES_APP_PASSWORD}';
   ALTER ROLE forteq_sweeper PASSWORD '${POSTGRES_SWEEPER_PASSWORD}';"

# 5c. demo account + checkpointer tables
$C run --rm api pnpm --filter @forteq/api seed
$C run --rm api pnpm --filter @forteq/worker setup:checkpointer

# 5d. restart the apps so they pick up the rotated passwords
$C restart api worker
```

## 6. Verify

```bash
docker compose --env-file deploy/.env.prod -f deploy/compose.prod.yml ps
curl -s -o /dev/null -w '%{http_code}\n' https://YOUR_DOMAIN     # 307 (redirect to login) = ok
```

Open `https://YOUR_DOMAIN`, sign in with `demo@forteq.dev` / `demo1234`, run a generation.

---

## Operations

```bash
C="docker compose --env-file deploy/.env.prod -f deploy/compose.prod.yml"

$C logs -f worker          # watch runs
$C ps                      # status
$C pull && $C up -d --build   # after git pull: rebuild and redeploy
$C down                    # stop (volumes kept)
```

**Backups.** The data lives in the `pgdata` volume. A minimal backup:

```bash
$C exec postgres pg_dump -U forteq_owner forteq | gzip > backup-$(date +%F).sql.gz
```

## Notes and honest limitations

- **Building on the server** keeps things simple (no registry) but ties deploys to server RAM. For
  a heavier setup, build in CI and push images to a registry, then pull on a smaller box.
- **Secrets** are network-isolated, not secret-manager-grade. Postgres/Redis are unreachable from
  the internet (no published ports + firewall), which is the real protection here.
- **No zero-downtime deploy.** `up -d --build` briefly restarts services. Fine for a course project
  and a demo; a real product would use a rolling strategy or a managed platform.
- **Single host, no HA.** One VPS is a single point of failure. Adequate for this scope.
