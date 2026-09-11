#!/bin/bash
set -euo pipefail

pnpm install --frozen-lockfile
pnpm --filter @workspace/db exec tsc --build --force
pnpm --filter @workspace/api-zod exec tsc --build --force

sync_log="$(mktemp)"
trap 'rm -f "$sync_log"' EXIT
pnpm --filter db push-force | tee "$sync_log"

if grep -q "created or renamed from another column" "$sync_log"; then
  echo "Drizzle needs an explicit column-rename migration; database changes were not applied." >&2
  exit 1
fi
