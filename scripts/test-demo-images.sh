#!/bin/bash
set -euo pipefail
[[ $# == 2 ]]
api_image=$1
web_image=$2
prefix="traffic-check-$$"
task_dir=$(mktemp -d)
cleanup() {
  docker rm -f "$prefix-api" "$prefix-web" "$prefix-db" >/dev/null 2>&1 || true
  docker network rm "$prefix" >/dev/null 2>&1 || true
  rm -rf "$task_dir"
}
trap cleanup EXIT
docker network create "$prefix" >/dev/null
docker run -d --name "$prefix-db" --network "$prefix" -e POSTGRES_USER=ptm -e POSTGRES_PASSWORD=test-only -e POSTGRES_DB=ptm postgres:16-alpine@sha256:0cefaabd882e42bcb2a2f3dc56d3ce4770560ba62fd7f197f1a2e008fd5731ab >/dev/null
for _ in $(seq 1 30); do
  if docker exec "$prefix-db" pg_isready -U ptm -d ptm >/dev/null 2>&1; then break; fi
  sleep 1
done
docker run -d --name "$prefix-api" --network "$prefix" -p 127.0.0.1::4000 --read-only --cap-drop ALL --security-opt no-new-privileges --tmpfs /tmp:uid=1001,gid=1001 \
  -e "PTM_DATABASE_URL=postgres://ptm:test-only@$prefix-db:5432/ptm" -e PTM_DEMO_ENABLED=true \
  -e PTM_API_CORS_ORIGIN=https://demo.test -e PTM_AUTH_COOKIE_SECURE=true "$api_image" >/dev/null
docker run -d --name "$prefix-web" --network "$prefix" -p 127.0.0.1::8080 --read-only --cap-drop ALL --security-opt no-new-privileges \
  --tmpfs /tmp:uid=1000,gid=1000 "$web_image" >/dev/null
for component in api web; do
  for _ in $(seq 1 60); do
    state=$(docker inspect --format '{{.State.Health.Status}}' "$prefix-$component")
    [[ $state == healthy ]] && break
    [[ $state != unhealthy ]] || { docker logs "$prefix-$component"; exit 1; }
    sleep 1
  done
  [[ $state == healthy ]]
done
api="http://$(docker port "$prefix-api" 4000)"
web="http://$(docker port "$prefix-web" 8080)"
curl -fsS "$web" | grep -q '<div id="root">'
[[ $(curl -s -o /dev/null -w '%{http_code}' "$api/api/boards/forbidden") == 401 ]]
[[ $(curl -s -o /dev/null -w '%{http_code}' -X POST -H 'Origin: https://evil.test' "$api/api/demo/session") == 403 ]]
curl -fsS -D "$task_dir/headers" -X POST -H 'Origin: https://demo.test' "$api/api/demo/session" > "$task_dir/session"
python3 - "$task_dir" <<'PY'
import json, sys
from pathlib import Path
root = Path(sys.argv[1])
data = json.loads((root / 'session').read_text())
assert data['boardId'] and data['aiRemaining'] == 3 and data['aiAvailable'] is False
headers = (root / 'headers').read_text().lower()
assert 'httponly' in headers and 'secure' in headers and 'samesite=strict' in headers
PY
printf '%s\n' 'Container health, guest creation, origin protection and anonymous denial passed.'
