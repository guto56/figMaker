# Zapfig

Figurinhas para WhatsApp com som, feitas no navegador: maker, galeria da comunidade e pacotes. Sem login.

No ar: https://zapfig.hrycsngb42.workers.dev

- `web/`: site (Vite + React + TypeScript + Tailwind). `npm run dev` dentro de `web/`.
- `worker/`: Worker do Cloudflare (wrangler) que serve o site e a API:
  - `/api/media/memes` (Imgflip), `/api/media/klipy` (GIFs, figurinhas, clips), `/api/sounds/myinstants`, `/api/sounds/freesound`, `/api/proxy`
  - `/api/stickers`, `/api/packs`, `/api/f/*`: galeria pública (D1 `zapfig` + KV `zapfig-files`)
  - Secrets: `KLIPY_KEY`, `FREESOUND_KEY`
- `scripts/deploy.sh`: build + migrações D1 + deploy (`CLOUDFLARE_API_TOKEN=... scripts/deploy.sh`).
- `scripts/gen.sh` + `scripts/cutout.py`: geração das imagens (Workers AI) e recorte das figurinhas.
- `docs/`: análise e prompt.
