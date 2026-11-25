#!/usr/bin/env bash
# uso: scripts/gen.sh <saida.png> <modelo> "<prompt>" [w] [h]
set -e
KEY=$(cat /tmp/claude-0/-home-user-figMaker/e2c827fd-1778-51e2-8851-b7e7fc5861bc/scratchpad/genkey)
jq -n --arg p "$3" --arg m "@cf/black-forest-labs/$2" --argjson w "${4:-1024}" --argjson h "${5:-1024}" '{prompt:$p,model:$m,width:$w,height:$h}' |
curl -sS -f -X POST "https://zapfig-img.hrycsngb42.workers.dev/?key=$KEY" -H 'content-type: application/json' --data-binary @- -o "$1"
file "$1"
