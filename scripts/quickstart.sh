#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repo_root"
if [[ ! -f "./dist/http-service.js" || ! -f "./dist/index.js" ]]; then
  npm run build >/dev/null
fi
exec node ./bin/keylore-http.js start
