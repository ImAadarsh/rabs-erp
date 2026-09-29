#!/usr/bin/env bash
# Deploy rabs-api (Express) to the Hostinger VPS.
#
# API:  https://api.rabsinteriors.app   (Traefik route staged until DNS is pointed)
# Edge: Traefik (:80/:443) → PM2 Node on 127.0.0.1:4015
# DB:   VPS MySQL 127.0.0.1:32768 / rabs_interiors
# Auth: ~/.ssh/id_ed25519_hostinger
#
# Local build + rsync + PM2. Server .env, uploads/ and exports/ are preserved.
# Usage (from rabs-api/): ./deploy_api.sh
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

ssh_user="${SSH_USER:-root}"
ssh_host="${SSH_HOST:-<VPS_HOST>}"
ssh_key="${SSH_KEY:-$HOME/.ssh/id_ed25519_hostinger}"
app_dir="${APP_DIR:-/var/www/rabs-api}"
process_name="${PROCESS_NAME:-rabs-api}"
api_port="${PORT:-4015}"
domain="${API_DOMAIN:-api.rabsinteriors.app}"

ssh_target="${ssh_user}@${ssh_host}"
ssh_base_opts=(-o StrictHostKeyChecking=accept-new -o ConnectTimeout=20 -i "$ssh_key" -o IdentitiesOnly=yes -o BatchMode=yes)

log() { printf '==> %s\n' "$*"; }
die() { printf 'ERROR: %s\n' "$*" >&2; exit 1; }

[[ -f "$ssh_key" ]] || die "SSH key not found: ${ssh_key}"

remote() {
  ssh "${ssh_base_opts[@]}" "$ssh_target" "$@"
}

log "Building locally…"
npm run build

log "Ensuring ${app_dir} on server…"
remote "mkdir -p '${app_dir}/uploads' '${app_dir}/exports'"

log "Rsyncing code (preserving server .env, uploads, exports, node_modules)…"
rsync -az --delete \
  --exclude node_modules \
  --exclude .git \
  --exclude .env \
  --exclude uploads \
  --exclude exports \
  --exclude '*.pem' \
  --exclude '.DS_Store' \
  -e "ssh ${ssh_base_opts[*]}" \
  "$SCRIPT_DIR/" "${ssh_target}:${app_dir}/"

log "Installing deps and restarting PM2…"
remote "set -euo pipefail
cd '${app_dir}'
if [[ ! -f .env ]]; then
  echo 'ERROR: ${app_dir}/.env missing — create it before deploy' >&2
  exit 1
fi
npm ci --omit=dev --no-audit --no-fund
grep -q '^PORT=' .env && sed -i 's/^PORT=.*/PORT=${api_port}/' .env || echo 'PORT=${api_port}' >> .env
if pm2 describe '${process_name}' >/dev/null 2>&1; then
  pm2 restart '${process_name}' --update-env
else
  pm2 start dist/server.js --name '${process_name}' --cwd '${app_dir}' --time
fi
pm2 save
"

log "Health checks…"
remote "for i in \$(seq 1 30); do
  code=\$(curl -sS -o /dev/null -w '%{http_code}' http://127.0.0.1:${api_port}/health || echo 000)
  [ \"\$code\" = 200 ] && { echo \"local_health:\$code\"; exit 0; }
  sleep 1
done
echo 'Local health failed' >&2
pm2 logs '${process_name}' --lines 40 --nostream || true
exit 1"

if [[ -n "$(dig +short "$domain" @1.1.1.1 2>/dev/null)" ]]; then
  curl -sS -o /dev/null -w "public_health:%{http_code}\n" "https://${domain}/health" || true
else
  log "DNS for ${domain} not pointed yet — skipping public check."
fi

log "Done. API → 127.0.0.1:${api_port} (PM2 ${process_name}); public https://${domain} once DNS + Traefik are active."
