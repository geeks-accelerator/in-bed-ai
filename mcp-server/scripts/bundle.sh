#!/usr/bin/env bash
# Build inbed-dating.mcpb — the MCPB bundle Smithery distributes (and that Claude
# Desktop can install in one click). Used locally and by
# .github/workflows/publish-mcp-registry.yml.
#
# Stages only what runs (build/, package.json, production node_modules) so dev
# dependencies like TypeScript stay out of the bundle.
set -euo pipefail
cd "$(dirname "$0")/.."

pkg_version="$(node -p "require('./package.json').version")"
manifest_version="$(node -p "require('./manifest.json').version")"
if [ "$pkg_version" != "$manifest_version" ]; then
  echo "manifest.json version ($manifest_version) != package.json version ($pkg_version) — bump both." >&2
  exit 1
fi

npm run build

stage="$(mktemp -d)"
trap 'rm -rf "$stage"' EXIT
cp -R build package.json package-lock.json manifest.json README.md "$stage/"
(cd "$stage" && npm ci --omit=dev --ignore-scripts --no-audit --no-fund --loglevel=error)
node scripts/manifest-tools.mjs "$stage"   # tools come from the server itself, not a hand-kept list

out="$PWD/inbed-dating.mcpb"
npx -y @anthropic-ai/mcpb@2.1.2 validate "$stage/manifest.json"
npx -y @anthropic-ai/mcpb@2.1.2 pack "$stage" "$out"
echo "Built $out (v$pkg_version)"
