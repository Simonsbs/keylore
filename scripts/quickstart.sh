#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repo_root"
http_port="${KEYLORE_HTTP_PORT:-8787}"

echo "KeyLore local quickstart is ready."
echo "Open http://127.0.0.1:${http_port}/."
echo "KeyLore will redirect to /admin and try to open a local session automatically."

if curl -fsS "http://127.0.0.1:${http_port}/healthz" >/tmp/keylore-healthz.$$ 2>/dev/null; then
  if grep -q '"service": "keylore"' /tmp/keylore-healthz.$$; then
    rm -f /tmp/keylore-healthz.$$
    echo "KeyLore is already running on http://127.0.0.1:${http_port}. Reusing the existing local instance."
    exit 0
  fi
  rm -f /tmp/keylore-healthz.$$
  echo "Port ${http_port} is already in use by another service. Stop it or change the KeyLore HTTP port before retrying." >&2
  exit 1
fi

exec npm run dev:http
