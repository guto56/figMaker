# Prompt para o Claude Code

Cole o bloco abaixo numa sessão do Claude Code neste repositório. Troque `[NOME]` pelo nome escolhido.

---

Construa o **[NOME]**, um site responsivo (celular e desktop, instalável como PWA) que é ao mesmo tempo **galeria** e **maker** de figurinhas para WhatsApp (e Telegram): estáticas, animadas e **com áudio**. Idioma: português do Brasil.

## Stack
- Next.js (App Router) + TypeScript + Tailwind CSS + shadcn/ui. PWA (manifest + service worker).
- Supabase: Auth (Google, Apple, link mágico), Postgres com RLS, Storage (ou Cloudflare R2 se configurado).
- Processamento de mídia **no navegador**: ffmpeg.wasm, `@imgly/background-removal`, Web Audio API.
- IA de imagem: Cloudflare Workers AI via rota de servidor (`/api/ai/generate`), token em variável de ambiente `CF_API_TOKEN` e `CF_ACCOUNT_ID`, nunca exposto no cliente. Modelos: `@cf/black-forest-labs/flux-1-schnell` (rascunho), `@cf/black-forest-labs/flux-2-klein-4b` (padrão), `@cf/black-forest-labs/flux-2-klein-9b` (qualidade). Resposta em `result.image` (base64).
- Deploy na Vercel.

## Formato de saída (validar sempre, com indicador "pronto pro Zap")
- WebP 512×512, fundo transparente; estática ≤ 100 KB; animada ≤ 500 KB e ≤ 10 s.
- Áudio: OGG Opus, mono, 48 kHz, ≤ 10 s.
- Ícone de bandeja do pacote: PNG 96×96 ≤ 50 KB. Pacote: 3 a 30 figurinhas.
- Compressão automática (qualidade/FPS/resolução) em loop até caber nos limites.

## Páginas
1. **Home/Galeria**: busca (texto, tags), filtros (estática / animada / com som / IA), em alta hoje/semana, novos, pacotes em destaque. Grid com preview animado e som ao tocar/hover (mudo por padrão, ícone de alto-falante).
2. **Figurinha `/f/[slug]`**: preview grande, player com waveform, baixar (WebP / WebP+OGG / ZIP), adicionar a pacote, compartilhar (link com OG image/vídeo), curtir, denunciar, criador, relacionadas. SEO completo.
3. **Pacote `/p/[slug]`**: lista, baixar ZIP, botão "Adicionar ao WhatsApp" (formato oficial de pacote), "Adicionar ao Telegram".
4. **Maker `/criar`** com abas:
   - **Imagem**: upload/câmera, remover fundo, recortar, contorno branco, texto estilo meme (Impact com borda e fontes extras), emojis/adesivos, filtros, camadas, desfazer/refazer.
   - **Animada**: vídeo/GIF, escolher trecho em timeline (≤ 10 s), crop quadrado, FPS, velocidade.
   - **Áudio**: gravar microfone, upload (MP3/M4A/WAV/OGG), extrair do vídeo, cortar na waveform, volume/normalizar, fade, biblioteca de sons, texto-para-fala.
   - **IA**: prompt + estilo (cartoon, 3D, anime, pixel art, figurinha clássica com borda), seletor de qualidade (rascunho/normal/máxima), gerar 4 variações, foto → figurinha estilizada. Fundo removido automaticamente. Limite diário por usuário (grátis) com contador.
   - **Memes**: busca de templates (Imgflip API), GIFs (GIPHY ou KLIPY API, chaves em env), resultado abre direto no editor.
   - Salvar rascunho, adicionar a pacote, publicar (público/privado/não listado), baixar.
5. **Perfil `/u/[user]`**: figurinhas, pacotes, downloads totais.
6. **Minhas coisas**: rascunhos, favoritos, pacotes.
7. **Admin/moderação**: fila de denúncias, ocultar/remover, banir, curadoria de destaques.
8. **Como usar figurinha com som**: tutorial passo a passo (Android, iPhone, WhatsApp Web/Desktop, macOS).

## Entrega para WhatsApp
- Normal/animada: download + "Adicionar ao WhatsApp" pelo formato oficial de pacote.
- Com áudio: download do WebP + OGG prontos e tutorial para o "Criar figurinha" nativo com áudio.
- Recurso **experimental, desligado por padrão** (feature flag `ENABLE_WA_PAIRING`): "Enviar pro meu WhatsApp" via pareamento (Baileys) em serviço Node separado, com aviso explícito de risco de banimento e recomendação de número secundário. Não armazenar sessão além do necessário.

## Banco (Supabase)
Tabelas: `profiles`, `stickers` (tipo, tem_audio, arquivos, dimensões, duração, tamanho, prompt_ia, status, visibilidade, slug), `packs`, `pack_stickers`, `tags`, `sticker_tags`, `likes`, `favorites`, `downloads`, `reports`, `ai_usage` (contagem diária). RLS em tudo. Busca full-text em português + trigram.

## Requisitos não funcionais
- Mobile-first, funcionar bem em Safari iOS e Chrome Android; Lighthouse ≥ 90.
- Uso sem login para criar e baixar; login só para publicar, salvar e IA acima de 3 gerações/dia.
- Moderação automática NSFW no upload e na geração por IA; termos de uso e canal de remoção por direitos autorais.
- Não baixar mídia de links do TikTok/Instagram/YouTube; só upload do próprio usuário.
- i18n preparado (pt-BR agora, en/es depois).
- Testes: Vitest para pipeline de conversão (limites), Playwright para criar → baixar.

## Ordem de execução
1. Setup do projeto, design system, layout, PWA.
2. Maker imagem → WebP estática com validação.
3. Animada + áudio (ffmpeg.wasm).
4. Supabase: auth, publicar, galeria, página da figurinha, SEO.
5. Pacotes + "Adicionar ao WhatsApp"/Telegram.
6. IA (Workers AI) + busca de memes.
7. Moderação, admin, perfil.
8. Pareamento experimental (atrás de flag).

Faça commits pequenos por etapa e rode os testes ao fim de cada uma.
