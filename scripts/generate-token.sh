#!/usr/bin/env sh
set -eu

ROOT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
cd "$ROOT_DIR"

if [ ! -f dist/generate-token.js ]; then
  pnpm run build
fi

exec node dist/generate-token.js "$@"
