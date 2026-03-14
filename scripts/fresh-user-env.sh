#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
repo_url="${KEYLORE_FRESH_REPO_URL:-${repo_root}}"
fresh_user="${KEYLORE_FRESH_USER:-keylore-fresh}"
fresh_home="/home/${fresh_user}"
repo_dir="${fresh_home}/keylore"
http_port="${KEYLORE_FRESH_HTTP_PORT:-8879}"
postgres_port="${KEYLORE_FRESH_POSTGRES_PORT:-55432}"
postgres_container="${KEYLORE_FRESH_POSTGRES_CONTAINER:-keylore-fresh-postgres}"
log_file="${fresh_home}/keylore-http.log"
pid_file="${fresh_home}/keylore-http.pid"

if [[ "${EUID}" -ne 0 ]]; then
  echo "Run this script as root so it can create the disposable test user." >&2
  exit 1
fi

if ! command -v docker >/dev/null 2>&1; then
  echo "docker is required." >&2
  exit 1
fi

if ! command -v git >/dev/null 2>&1; then
  echo "git is required." >&2
  exit 1
fi

if ! command -v node >/dev/null 2>&1; then
  echo "node is required." >&2
  exit 1
fi

if id -u "${fresh_user}" >/dev/null 2>&1; then
  usermod -aG docker "${fresh_user}"
else
  useradd --create-home --shell /bin/bash --groups docker "${fresh_user}"
fi

mkdir -p "${fresh_home}/snap/node"
chown -R "${fresh_user}:${fresh_user}" "${fresh_home}"

pkill -u "${fresh_user}" || true

if [[ -d "${repo_dir}" ]]; then
  rm -rf "${repo_dir}"
fi
mkdir -p "${repo_dir}"
chown "${fresh_user}:${fresh_user}" "${repo_dir}"

if docker ps -a --format '{{.Names}}' | grep -qx "${postgres_container}"; then
  docker rm -f "${postgres_container}" >/dev/null
fi

docker run -d \
  --name "${postgres_container}" \
  -e POSTGRES_DB=keylore \
  -e POSTGRES_USER=keylore \
  -e POSTGRES_PASSWORD=keylore \
  -p "127.0.0.1:${postgres_port}:5432" \
  postgres:17-alpine >/dev/null

for _ in $(seq 1 30); do
  if docker exec "${postgres_container}" pg_isready -U keylore -d keylore >/dev/null 2>&1; then
    break
  fi
  sleep 1
done

if ! docker exec "${postgres_container}" pg_isready -U keylore -d keylore >/dev/null 2>&1; then
  echo "Disposable PostgreSQL did not become ready in time." >&2
  exit 1
fi

source_description="${repo_url}"
if [[ -d "${repo_url}" ]]; then
  source_description="local snapshot from ${repo_url}"
  tar \
    --exclude='./node_modules' \
    --exclude='./dist' \
    --exclude='./.git' \
    -C "${repo_url}" \
    -cf - . | runuser -u "${fresh_user}" -- tar -xf - -C "${repo_dir}"
else
  runuser -u "${fresh_user}" -- env -i \
    HOME="${fresh_home}" \
    USER="${fresh_user}" \
    LOGNAME="${fresh_user}" \
    PATH="/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin" \
    git clone --depth 1 "${repo_url}" "${repo_dir}" >/dev/null
fi

runuser -u "${fresh_user}" -- env -i \
  HOME="${fresh_home}" \
  USER="${fresh_user}" \
  LOGNAME="${fresh_user}" \
  PATH="/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin" \
  bash -lc "cd '${repo_dir}' && npm install" >/dev/null

runuser -u "${fresh_user}" -- env -i \
  HOME="${fresh_home}" \
  USER="${fresh_user}" \
  LOGNAME="${fresh_user}" \
  PATH="/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin" \
  bash -lc "cd '${repo_dir}' && npm run build" >/dev/null

cat > "${repo_dir}/.env" <<EOF
KEYLORE_DATABASE_URL=postgresql://keylore:keylore@127.0.0.1:${postgres_port}/keylore
KEYLORE_HTTP_PORT=${http_port}
KEYLORE_PUBLIC_BASE_URL=http://127.0.0.1:${http_port}
KEYLORE_OAUTH_ISSUER_URL=http://127.0.0.1:${http_port}/oauth
KEYLORE_LOG_LEVEL=silent
EOF

if [[ -f "${pid_file}" ]]; then
  stale_pid="$(cat "${pid_file}" 2>/dev/null || true)"
  if [[ -n "${stale_pid}" ]] && kill -0 "${stale_pid}" >/dev/null 2>&1; then
    kill "${stale_pid}" >/dev/null 2>&1 || true
  fi
  rm -f "${pid_file}"
fi

runuser -u "${fresh_user}" -- env -i \
  HOME="${fresh_home}" \
  USER="${fresh_user}" \
  LOGNAME="${fresh_user}" \
  PATH="/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin" \
  bash -lc "cd '${repo_dir}' && node dist/index.js --transport http </dev/null >'${log_file}' 2>&1 & echo \$! >'${pid_file}'"

for _ in $(seq 1 30); do
  if curl -fsS "http://127.0.0.1:${http_port}/healthz" >/dev/null 2>&1; then
    break
  fi
  sleep 1
done

if ! curl -fsS "http://127.0.0.1:${http_port}/healthz" >/dev/null 2>&1; then
  echo "KeyLore fresh-user environment did not become ready in time." >&2
  echo "Log output:" >&2
  sed -n '1,160p' "${log_file}" >&2 || true
  exit 1
fi

cat <<EOF
Fresh-user KeyLore environment is ready.

User: ${fresh_user}
Repo: ${repo_dir}
Source clone: ${source_description}
HTTP UI: http://127.0.0.1:${http_port}/
MCP HTTP: http://127.0.0.1:${http_port}/mcp
Postgres container: ${postgres_container}
App log: ${log_file}

This environment does not reuse your /home/simon checkout at runtime or your shell environment.
Open the UI URL above and go through the onboarding flow there.
EOF
