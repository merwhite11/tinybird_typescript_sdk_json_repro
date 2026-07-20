#!/usr/bin/env bash
# Run the end-to-end repro against the current Tinybird branch.
# Extracts the branch token from `tinybird info` so nothing is hard-coded,
# then runs src/e2e.ts against it. The token is never printed.
set -euo pipefail
cd "$(dirname "$0")/.."

INFO="$(pnpm exec tinybird info 2>/dev/null)"

# The branch token is the "Token:" line inside the "» Branch:" section.
BRANCH_TOKEN="$(awk '/» Branch:/{b=1} b&&/Token:/{print $2; exit}' <<<"$INFO")"
API_URL="$(awk '/» Workspace:/{w=1} w&&/API:/{print $2; exit}' <<<"$INFO")"

if [[ -z "${BRANCH_TOKEN:-}" ]]; then
  echo "Could not find a branch token. Are you on a feature branch with a built Tinybird branch?" >&2
  echo "Try: git checkout -b my_branch && pnpm exec tinybird build" >&2
  exit 1
fi

echo "Using branch token (hidden) against ${API_URL}"
TINYBIRD_TOKEN="$BRANCH_TOKEN" TINYBIRD_URL="$API_URL" pnpm exec tsx src/e2e.ts
