#!/usr/bin/env sh
set -eu

ROOT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
cd "$ROOT_DIR"

if [ ! -f dist/tailscale-start.js ]; then
  pnpm run build
fi

exec node dist/tailscale-start.js "$@"
