#!/usr/bin/env bash
# Build do site e deploy do Worker "zapfig" (site + API). Uso: CLOUDFLARE_API_TOKEN=... scripts/deploy.sh
set -euo pipefail
cd "$(dirname "$0")/.."
(cd web && npm run build)
(cd worker && npx wrangler d1 migrations apply zapfig --remote && npx wrangler deploy)
