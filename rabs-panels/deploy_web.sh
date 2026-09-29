#!/usr/bin/env bash
# Deploy ABS Interiors panels (Next.js ERP UI) to the Hostinger VPS.
#
# Portal: https://rabsinteriors.app       (Traefik route staged until DNS is pointed)
# API:    https://api.rabsinteriors.app   (PM2 rabs-api :4015)
#
# Edge: Traefik (:80/:443) → PM2 Next.js on 127.0.0.1:4016
# Auth: ~/.ssh/id_ed25519_hostinger (no password)
#
# Rsyncs the local tree, writes the server env, builds on the server so
# NEXT_PUBLIC_API_BASE is baked into the bundle, then restarts PM2.
#
# Usage (from rabs-panels/):
#   ./deploy_web.sh
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

ssh_user="${SSH_USER:-root}"
ssh_host="${SSH_HOST:-<VPS_HOST>}"
ssh_key="${SSH_KEY:-$HOME/.ssh/id_ed25519_hostinger}"
app_dir="${APP_DIR:-/var/www/rabs-panels}"
process_name="${PROCESS_NAME:-rabs-panels}"
web_port="${PORT:-4016}"
bind_host="${BIND_HOST:-127.0.0.1}"
domain="${WEB_DOMAIN:-rabsinteriors.app}"
# Browser-facing API origin (client paths add /api/...)
next_public_api_base="${NEXT_PUBLIC_API_BASE:-https://api.rabsinteriors.app}"

ssh_target="${ssh_user}@${ssh_host}"
ssh_base_opts=(-o StrictHostKeyChecking=accept-new -o ConnectTimeout=20 -i "$ssh_key" -o IdentitiesOnly=yes -o BatchMode=yes)

log() { printf '==> %s\n' "$*"; }
die() { printf 'ERROR: %s\n' "$*" >&2; exit 1; }

[[ -f "$ssh_key" ]] || die "SSH key not found: ${ssh_key}"

remote() {
  ssh "${ssh_base_opts[@]}" "$ssh_target" "$@"
}

[[ "${1:-}" == "--help" ]] && { sed -n '2,15p' "$0"; exit 0; }

log "Rsyncing source to ${app_dir}…"
remote "mkdir -p '${app_dir}'"
rsync -az --delete \
  --exclude node_modules \
  --exclude .next \
  --exclude .git \
  --exclude '.env*' \
  --exclude logs \
  --exclude tsconfig.tsbuildinfo \
  --exclude '.DS_Store' \
  -e "ssh ${ssh_base_opts[*]}" \
  "$SCRIPT_DIR/" "${ssh_target}:${app_dir}/"

log "Writing production env on server (PORT + NEXT_PUBLIC_API_BASE)…"
remote "set -euo pipefail
cat > '${app_dir}/.env' <<EOF
NODE_ENV=production
PORT=${web_port}
NEXT_PUBLIC_API_BASE=${next_public_api_base}
EOF
cp -a '${app_dir}/.env' '${app_dir}/.env.production'
chmod 600 '${app_dir}/.env' '${app_dir}/.env.production'
grep -E '^(NODE_ENV|PORT|NEXT_PUBLIC_API_BASE)=' '${app_dir}/.env'
"

log "Building Next.js and restarting PM2 (${process_name})…"
remote "set -euo pipefail
cd '${app_dir}'
npm ci --no-audit --no-fund
npm run build
if pm2 describe '${process_name}' >/dev/null 2>&1; then
  pm2 delete '${process_name}' >/dev/null || true
fi
PORT='${web_port}' pm2 start npm --name '${process_name}' --cwd '${app_dir}' --time -- start -- -H '${bind_host}' -p '${web_port}'
pm2 save
"

log "Waiting for local health on :${web_port}…"
remote "set -e
for i in \$(seq 1 60); do
  code=\$(curl -sS -o /dev/null -w '%{http_code}' --connect-timeout 2 'http://127.0.0.1:${web_port}/' || echo 000)
  case \"\$code\" in
    200|301|302|307|308) echo \"Local OK (HTTP \$code)\"; exit 0 ;;
  esac
  sleep 1
done
echo 'Local web failed to become ready' >&2
pm2 logs '${process_name}' --lines 40 --nostream || true
exit 1
"

if [[ -n "$(dig +short "$domain" @1.1.1.1 2>/dev/null)" ]]; then
  code="$(curl -sS -o /dev/null -w '%{http_code}' --connect-timeout 25 "https://${domain}/" || echo 000)"
  log "Public https://${domain}/ → HTTP ${code}"
else
  log "DNS for ${domain} not pointed yet — skipping public check."
fi

log "Web deploy complete. Portal: https://${domain}  API: ${next_public_api_base}"
