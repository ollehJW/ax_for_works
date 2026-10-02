#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
portal_root="$PWD"
portal_tls_dir="${AX_TLS_DIR:-/home/wia/.local/share/wianews/tls}"
test -r "$portal_tls_dir/fullchain.pem"
test -r "$portal_tls_dir/privkey.pem"
docker image inspect ax-for-works:local >/dev/null
test -r "$portal_root/.env"
# Host-side tools use AX_DB_HOST; container-only overrides support a local DB bridge.
portal_db_options=()
portal_container_host="$(sed -n 's/^AX_CONTAINER_DB_HOST=//p' "$portal_root/.env")"
portal_container_port="$(sed -n 's/^AX_CONTAINER_DB_PORT=//p' "$portal_root/.env")"
if [ -n "$portal_container_host" ]; then portal_db_options+=(--env "AX_DB_HOST=$portal_container_host"); fi
if [ -n "$portal_container_port" ]; then portal_db_options+=(--env "AX_DB_PORT=$portal_container_port"); fi
# Validate the mounted gateway settings and database before touching the running portal.
docker run --rm --read-only --cap-drop ALL --security-opt no-new-privileges:true \
  --mount "type=bind,src=$portal_root/config,dst=/app/config,readonly" \
  --env-file "$portal_root/.env" "${portal_db_options[@]}" ax-for-works:local \
  python -c "from pathlib import Path; from backend.gateway_config import load_gateway_config; from backend.check_database import check_database; load_gateway_config(Path('/app/config/config.yaml')); check_database()"
if docker container inspect ax-for-works >/dev/null 2>&1; then
  portal_label="$(docker inspect --format '{{index .Config.Labels "app"}}' ax-for-works)"
  if [ "$portal_label" != "ax-for-works" ]; then
    echo 'Container name ax-for-works is already used by another application.' >&2
    exit 1
  fi
  docker stop ax-for-works >/dev/null
  docker rm ax-for-works >/dev/null
fi
docker run -d --name ax-for-works --label app=ax-for-works \
  --restart unless-stopped --publish 443:8443 \
  --env-file "$portal_root/.env" "${portal_db_options[@]}" \
  --mount "type=bind,src=$portal_tls_dir,dst=/tls,readonly" \
  --mount "type=bind,src=$portal_root/config,dst=/app/config,readonly" \
  --read-only --tmpfs /tmp:rw,noexec,nosuid,size=16m \
  --cap-drop ALL --security-opt no-new-privileges:true \
  --pids-limit 128 --memory 256m \
  --log-opt max-size=10m --log-opt max-file=3 \
  --health-cmd 'python -c "import urllib.request,ssl; urllib.request.urlopen(\"https://127.0.0.1:8443/api/ready\",context=ssl._create_unverified_context(),timeout=3)"' \
  --health-interval 30s --health-timeout 5s --health-start-period 10s --health-retries 3 \
  ax-for-works:local
