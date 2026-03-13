#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKUP_PATH="${1:-${ROOT_DIR}/.tmp-restore-drill-backup.json}"

required_env=(
  KEYLORE_DATABASE_URL
  KEYLORE_BOOTSTRAP_ADMIN_CLIENT_SECRET
  KEYLORE_BOOTSTRAP_CONSUMER_CLIENT_SECRET
)

for name in "${required_env[@]}"; do
  if [[ -z "${!name:-}" ]]; then
    echo "missing required env: ${name}" >&2
    exit 1
  fi
done

cleanup() {
  rm -f "${BACKUP_PATH}"
}

trap cleanup EXIT

cd "${ROOT_DIR}"

echo "creating logical backup at ${BACKUP_PATH}"
node dist/cli.js system backup create --file "${BACKUP_PATH}"

echo "inspecting logical backup"
node dist/cli.js system backup inspect --file "${BACKUP_PATH}"

echo "restoring logical backup"
node dist/cli.js system backup restore --file "${BACKUP_PATH}" --yes

echo "restore drill completed"
