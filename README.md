# RABS ERP

ERP and one-click CRM workflow for **RABS Carpets & Furniture** (enquiry → measure → quote → job → deposit → materials → fitting → invoice → close), white-labelled from Zaam ERP.

| App | Stack | Live |
| --- | --- | --- |
| [`rabs-api/`](rabs-api) | Express + TypeORM (MySQL), TypeScript | https://api.rabsinteriors.app |
| [`rabs-panels/`](rabs-panels) | Next.js (App Router) + Tailwind | https://rabsinteriors.app |

## Local development

```bash
cd rabs-api && cp .env.example .env   # fill in values
npm install && npm run dev

cd rabs-panels
npm install && npm run dev            # NEXT_PUBLIC_API_BASE in .env.local
```

Secrets live only in untracked `.env` files (server: `/var/www/rabs-api/.env`). Seed scripts read passwords from env (`SEED_ADMIN_PASSWORD`, `SEED_STAFF_PASSWORD`); the API uses `DEFAULT_USER_PASSWORD` for users created without one.

## Deploy

Both apps deploy to a VPS over SSH with rsync + PM2 (behind Traefik):

```bash
./rabs-api/deploy_api.sh      # local build → rsync → npm ci → pm2 restart rabs-api
./rabs-panels/deploy_web.sh   # rsync → server-side next build → pm2 restart rabs-panels
```

The scripts need `SSH_HOST` (and optionally `SSH_USER`, `SSH_KEY`), either exported or in a gitignored `.deploy.env` at the repo root:

```bash
SSH_HOST=your.vps.host
```
