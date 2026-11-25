# figMaker — Análise (25/11/2026)

## 1. O vídeo do Instagram
O reel `DgJOnqEvMcp` **não pôde ser aberto**: instagram.com é bloqueado pela rede desta sessão e o reel não aparece em buscas.
Pela busca de "figurinhas com áudio" + GitHub, os candidatos mais prováveis de serem o repositório do vídeo (projetos BR publicados nos últimos dias) são:

| Repositório | O que faz | Plataformas | Como envia pro WhatsApp | Licença / ⭐ |
|---|---|---|---|---|
| [touchzada/soundsticker](https://github.com/touchzada/soundsticker) | App local (UI no navegador) que transforma vídeo/imagem + áudio em figurinha com som | Windows, **macOS**, Linux (Node 20 + FFmpeg) | Cliente não oficial (`plogme`, fork do Baileys) via QR/código de pareamento | MIT / 1 |
| [catevildev/MeowSticker](https://github.com/catevildev/MeowSticker) | Estúdio web (sticker.catevil.com): estática, animada e com som + galeria da comunidade + link por figurinha | Web | Pareamento do número (cliente não oficial) | AGPL-3.0 / 1 (código fechado) |
| [pandaNinja9714/Figaudio](https://github.com/pandaNinja9714/Figaudio) | CLI: recorta vídeo, sincroniza áudio, envia pro próprio chat | Windows | QR (lib tipo Baileys) | Apache-2.0 / 6 |
| [SilverFeit/StikSound](https://github.com/SilverFeit/StikSound) | Imagem/GIF + som até 5–10 s, puxa som do MyInstants | Windows, **macOS** (Tauri), extensão Chrome, PWA | **Nenhum** — exporta MP4/WebM; o próprio README diz que "é vídeo, não sticker" | MIT/Apache / 144 |
| [Shirtep/WA-audio-stickers](https://github.com/Shirtep/WA-audio-stickers) | Extensão Chrome que cria e envia pelo WhatsApp Web | Chrome/Edge/Brave (qualquer SO) | WhatsApp Web (não oficial) | — |
| rafaelsupport/whatsapp-audio-sticker, coelhobugado/whatsapp-figurinhas-com-som | Bots Baileys + FFmpeg | Node | Baileys | — |

**Tem para macOS?** Sim: soundsticker roda no macOS (Node + FFmpeg) e StikSound tem app desktop macOS — mas o StikSound não gera figurinha de verdade. Nenhum tem app macOS nativo/polido e nenhum é site de galeria + maker completo. **O espaço está aberto.** Para confirmar qual é o do vídeo: cole aqui a legenda ou o @ do perfil.

## 2. Como a figurinha com áudio funciona (técnico)
- WhatsApp liberou figurinha com som nativa em nov/2026, gradualmente (Figurinhas → Criar figurinha → foto/vídeo → ícone de áudio).
- Formato (doc do soundsticker): **WebP 512×512** (animada ≤ 500 KB, estática ≤ 100 KB, ≤ 10 s) + **OGG Opus mono 48 kHz ≤ 10 s**, embutido em `stickerMessage.audioMessage` (não é nota de voz).
- **Ponto crítico:** não foi encontrada nenhuma via **oficial** para importar figurinha com áudio a partir de site/arquivo. Todos os projetos que geram figurinha com som real usam cliente não oficial (Baileys) → **risco de banimento do número**. A importação oficial de pacotes (Android intent / iOS) cobre só WebP estática/animada.

**Consequência para o produto** — 3 modos de entrega:
1. **Pacotes normais/animados** → importação oficial "Adicionar ao WhatsApp" (Android/iOS), sem risco.
2. **Com áudio, modo seguro** → baixar WebP + áudio já no formato e tutorial curto para montar no "Criar figurinha" nativo; ou baixar e enviar como figurinha pelo WhatsApp Web/desktop quando suportado (verificar).
3. **Com áudio, "Enviar pro meu WhatsApp"** → pareamento (Baileys) opcional, com aviso claro de risco e recomendação de número secundário. Ficar atento: se a Meta liberar API/import oficial com áudio, trocar imediatamente.

Também exportar para Telegram (pacotes via bot oficial, WebM/TGS) — mais um público, sem risco.

## 3. Propostas de funcionalidade

### Galeria
- Busca por texto, tag, categoria, "tem áudio", tipo (estática/animada/som), tendências do dia/semana.
- Preview com som ao passar o mouse/tocar; player com waveform.
- Pacotes (coleções) curados e da comunidade; seguir criadores; curtir/salvar/favoritos.
- Download individual ou pacote (ZIP), botão "Adicionar ao WhatsApp", "Adicionar ao Telegram", link compartilhável com página de preview (OG image/vídeo para viralizar no Zap/Insta).
- Ranking, figurinha do dia, coleções sazonais (Copa, BBB, Carnaval, Natal).
- Denúncia, moderação (NSFW automático + manual), remoção por direitos autorais.

### Maker (editor no navegador, celular e PC)
- **Normal:** upload de imagem, remoção de fundo automática (no navegador), recorte, contorno branco, texto estilo meme, emojis, filtros, rotação/escala.
- **Animada:** vídeo/GIF → corte de trecho (≤ 10 s), crop quadrado, FPS/qualidade com compressão automática até caber nos limites.
- **Com áudio:** gravar voz, subir MP3/M4A, extrair áudio do vídeo, cortar trecho na waveform, volume/normalizar, **biblioteca de sons/memes sonoros**, TTS (texto → voz).
- **Com IA:** gerar figurinha por prompt (estilos: cartoon, 3D, anime, pixel art, "figurinha clássica com borda"), transformar foto em figurinha estilizada, gerar variações, legenda automática engraçada.
- **Busca de memes reais:** pesquisar templates (Imgflip), GIFs (GIPHY / KLIPY / Tenor — checar status da API), sons (biblioteca própria; MyInstants não tem API oficial), escolher e editar direto no maker.
- Converter vídeo do TikTok/Reels/YouTube por link → **evitar** (termos/direitos); aceitar só upload do próprio usuário.
- Validação em tempo real dos limites do WhatsApp (tamanho, duração, dimensões) com barra "✔ pronto pro Zap".
- Salvar rascunhos, montar pacote (3–30 figurinhas + ícone de bandeja), publicar na galeria ou manter privado.

### Conta e crescimento
- Login Google/Apple/e-mail mágico; usar sem login para criar/baixar (login só para publicar/salvar).
- Perfil de criador público, contagem de downloads.
- PWA instalável (celular e desktop, inclusive macOS via Safari/Chrome "Adicionar ao Dock").
- Grátis com limite diário de geração por IA; plano Pro (IA ilimitada, sem marca d'água, pacotes privados maiores).
- SEO: página por figurinha/pacote/tag ("figurinha com áudio do [meme]") — é como vira referência no Google.
- Extensão de navegador / app macOS (Tauri) numa fase 2 para "arrastar figurinha pro WhatsApp Desktop".

## 4. Nome / marca (domínios NÃO verificados — checar no registro.br e .com)
- **FigSom** — curto, diz exatamente "figurinha com som".
- **Figurinhou** — verbo, memorável, brasileiro.
- **Zapfig**
- **Figuroom**
- **figMaker** (nome atual do repo) — genérico, mais difícil de virar marca.

Recomendação: **FigSom** (ou Figurinhou) + registrar `.com.br`, `.com`, @ no Instagram/TikTok/X antes de lançar.

## 5. Stack sugerida
- Next.js (App Router) + TypeScript + Tailwind, PWA, deploy na Vercel.
- Supabase: Auth, Postgres (figurinhas, pacotes, tags, curtidas, denúncias), RLS.
- Armazenamento: Cloudflare R2 (sem custo de saída) ou Supabase Storage.
- Processamento no navegador: ffmpeg.wasm (WebP animado, Opus), `@imgly/background-removal`, Web Audio API para waveform/corte.
- IA de imagem: Cloudflare Workers AI (flux-1-schnell / flux-2-klein-4b / flux-2-klein-9b) via rota de servidor (token nunca no cliente).
- Moderação: classificador NSFW + fila manual.

## Fontes
- https://github.com/touchzada/soundsticker
- https://github.com/catevildev/MeowSticker
- https://github.com/pandaNinja9714/Figaudio
- https://github.com/SilverFeit/StikSound
- https://github.com/Shirtep/WA-audio-stickers
- https://github.com/topics/audio-sticker
- https://www.otempo.com.br/tecnologia-e-games/2026/11/25/figurinhas-com-audio-no-whatsapp-veja-o-passo-a-passo-para-criar
- https://www.minhaoperadora.com.br/2026/11/como-fazer-figurinha-com-som-no-whatsapp-veja-o-passo-a-passo.html
