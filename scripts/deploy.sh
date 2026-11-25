#!/usr/bin/env bash
# Publica web/dist no Worker "zapfig" (Cloudflare). Uso: ZAPFIG_KEY=... scripts/deploy.sh
set -euo pipefail
cd "$(dirname "$0")/../web"
npm run build >/dev/null
HOST="https://zapfig.hrycsngb42.workers.dev"
V=$(date -u +%Y%m%d%H%M%S)
type_of() {
  case "$1" in
    *.html) echo "text/html; charset=utf-8";; *.js|*.mjs) echo "text/javascript; charset=utf-8";;
    *.css) echo "text/css; charset=utf-8";; *.wasm) echo "application/wasm";; *.webp) echo "image/webp";;
    *.png) echo "image/png";; *.ico) echo "image/x-icon";; *.ogg) echo "audio/ogg";; *.svg) echo "image/svg+xml";;
    *.webmanifest) echo "application/manifest+json";; *.json) echo "application/json";; *) echo "application/octet-stream";;
  esac
}
cd dist
find . -type f | sed 's|^\.||' | while read -r f; do
  for i in 1 2 3; do
    if curl -sS -f -X POST "$HOST/__upload?key=$ZAPFIG_KEY&v=$V&path=$f" -H "content-type: $(type_of "$f")" --data-binary "@.$f" -o /dev/null; then break; fi
    sleep 2
  done
  echo "ok $f"
done
curl -sS -f -X POST "$HOST/__publish?key=$ZAPFIG_KEY&v=$V"; echo
