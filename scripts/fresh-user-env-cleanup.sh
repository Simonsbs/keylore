#!/usr/bin/env bash
set -euo pipefail

fresh_user="${KEYLORE_FRESH_USER:-keylore-fresh}"
fresh_home="/home/${fresh_user}"

if [[ "${EUID}" -ne 0 ]]; then
  echo "Run this script as root so it can remove the disposable test user." >&2
  exit 1
fi

if id -u "${fresh_user}" >/dev/null 2>&1; then
  pkill -u "${fresh_user}" || true
fi

if id -u "${fresh_user}" >/dev/null 2>&1; then
  userdel -r "${fresh_user}" >/dev/null 2>&1 || true
fi

rm -rf "${fresh_home}" >/dev/null 2>&1 || true

echo "Fresh-user KeyLore environment removed."
