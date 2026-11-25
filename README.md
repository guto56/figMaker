# Zapfig

Figurinhas para WhatsApp com som, feitas no navegador. Versão 1: maker (imagem, vídeo/GIF, áudio, memes do Imgflip) e galeria, sem login.

No ar: https://zapfig.hrycsngb42.workers.dev

- `web/`: site (Vite + React + TypeScript + Tailwind). `npm run dev` dentro de `web/`.
- `worker/site.js`: Worker do Cloudflare que serve o site a partir do KV `zapfig-site` e as rotas `/api/memes` e `/api/img`.
- `scripts/deploy.sh`: build e publicação (`ZAPFIG_KEY=... scripts/deploy.sh`).
- `scripts/gen.sh` + `scripts/cutout.py`: geração das imagens (Cloudflare Workers AI) e recorte das figurinhas.
- `docs/`: análise e prompt.
