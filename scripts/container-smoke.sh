#!/bin/sh
set -eu

suffix="$(date +%s)-$$"
image_tag="${KEYLORE_SMOKE_IMAGE_TAG:-keylore-smoke:local}"
network_name="${KEYLORE_SMOKE_NETWORK:-keylore-smoke-${suffix}}"
postgres_container="${KEYLORE_SMOKE_POSTGRES_CONTAINER:-keylore-smoke-postgres-${suffix}}"
app_container="${KEYLORE_SMOKE_APP_CONTAINER:-keylore-smoke-app-${suffix}}"
host_port="${KEYLORE_SMOKE_PORT:-18787}"
public_base_url="${KEYLORE_SMOKE_PUBLIC_BASE_URL:-http://127.0.0.1:${host_port}}"
issuer_url="${KEYLORE_SMOKE_ISSUER_URL:-${public_base_url}/oauth}"
admin_secret="${KEYLORE_SMOKE_ADMIN_SECRET:-smoke-admin-secret-1234}"
consumer_secret="${KEYLORE_SMOKE_CONSUMER_SECRET:-smoke-consumer-secret-1234}"

cleanup() {
  docker rm -f "$app_container" >/dev/null 2>&1 || true
  docker rm -f "$postgres_container" >/dev/null 2>&1 || true
  docker network rm "$network_name" >/dev/null 2>&1 || true
}

trap cleanup EXIT INT TERM

docker build -t "$image_tag" .
docker network create "$network_name" >/dev/null

docker run -d \
  --name "$postgres_container" \
  --network "$network_name" \
  -e POSTGRES_DB=keylore \
  -e POSTGRES_USER=keylore \
  -e POSTGRES_PASSWORD=keylore \
  postgres:17-alpine >/dev/null

postgres_ready=0
for _ in $(seq 1 30); do
  if docker exec "$postgres_container" pg_isready -U keylore -d keylore >/dev/null 2>&1; then
    postgres_ready=1
    break
  fi
  sleep 1
done

if [ "$postgres_ready" -ne 1 ]; then
  echo "PostgreSQL did not become ready." >&2
  exit 1
fi

docker run -d \
  --name "$app_container" \
  --network "$network_name" \
  -p "${host_port}:8787" \
  -e KEYLORE_DATABASE_URL="postgresql://keylore:keylore@${postgres_container}:5432/keylore" \
  -e KEYLORE_HTTP_HOST="0.0.0.0" \
  -e KEYLORE_HTTP_PORT="8787" \
  -e KEYLORE_PUBLIC_BASE_URL="$public_base_url" \
  -e KEYLORE_OAUTH_ISSUER_URL="$issuer_url" \
  -e KEYLORE_BOOTSTRAP_ADMIN_CLIENT_SECRET="$admin_secret" \
  -e KEYLORE_BOOTSTRAP_CONSUMER_CLIENT_SECRET="$consumer_secret" \
  -e KEYLORE_LOG_LEVEL="warn" \
  "$image_tag" >/dev/null

app_ready=0
for _ in $(seq 1 45); do
  if curl --silent --fail "${public_base_url}/healthz" >/dev/null 2>&1; then
    app_ready=1
    break
  fi
  sleep 1
done

if [ "$app_ready" -ne 1 ]; then
  echo "KeyLore container did not become ready." >&2
  docker logs "$app_container" >&2 || true
  exit 1
fi

admin_html="$(curl --silent --fail "${public_base_url}/admin")"
printf '%s' "$admin_html" | grep -q "KeyLore Admin"

token_response="$(curl --silent --fail -X POST "${public_base_url}/oauth/token" \
  -H 'content-type: application/x-www-form-urlencoded' \
  --data-urlencode 'grant_type=client_credentials' \
  --data-urlencode 'client_id=keylore-admin-local' \
  --data-urlencode "client_secret=${admin_secret}" \
  --data-urlencode 'scope=admin:read admin:write auth:read auth:write audit:read approval:read approval:review system:read system:write backup:read backup:write breakglass:read breakglass:review breakglass:request catalog:read catalog:write broker:use mcp:use' \
  --data-urlencode "resource=${public_base_url}/v1")"

access_token="$(printf '%s' "$token_response" | node -e "let data=''; process.stdin.on('data', c => data += c); process.stdin.on('end', () => { const parsed = JSON.parse(data); if (!parsed.access_token) process.exit(1); process.stdout.write(parsed.access_token); });")"

curl --silent --fail "${public_base_url}/readyz" >/dev/null
curl --silent --fail -H "authorization: Bearer ${access_token}" "${public_base_url}/v1/tenants" >/dev/null

echo "Container smoke passed for ${public_base_url}."
