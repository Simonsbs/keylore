#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repo_root"

if ! command -v docker >/dev/null 2>&1; then
  echo "docker is required for local quickstart." >&2
  exit 1
fi

echo "Starting local PostgreSQL..."
docker compose up -d postgres >/dev/null

container_id=""
for _ in $(seq 1 30); do
  container_id="$(docker compose ps -q postgres)"
  if [[ -n "$container_id" ]] && docker exec "$container_id" pg_isready -U keylore -d keylore >/dev/null 2>&1; then
    break
  fi
  sleep 1
done

if [[ -z "$container_id" ]] || ! docker exec "$container_id" pg_isready -U keylore -d keylore >/dev/null 2>&1; then
  echo "local PostgreSQL did not become ready in time." >&2
  exit 1
fi

echo "KeyLore local quickstart is ready."
echo "Open http://127.0.0.1:8787/."
echo "KeyLore will redirect to /admin and try to open a local session automatically."

exec npm run dev:http
