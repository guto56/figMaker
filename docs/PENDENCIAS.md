# Pendências

## Para readicionar
- **"Partir de uma figurinha da galeria"** no editor (etapa Origem). Tirado em 25/11/2026 a pedido. O carregamento por `?de=<id>` continua funcionando (botões "Editar uma cópia" e "Pôr som nela"); falta só o painel com as figurinhas para escolher.

## Próximas funcionalidades
- **Figurinha por IA:** descrever e o Zapfig desenha (Cloudflare Workers AI via binding `AI` no Worker, sem chave). Também foto → desenho/3D.
- **Voz por texto:** digitar a frase e gerar o áudio da figurinha (TTS).
- **Legenda falada automática:** transcrever o áudio e virar o texto da figurinha (Whisper no Workers AI).
- **Imagem por cima de vídeo/GIF:** ex. um rosto recortado em cima de um GIF.
- **Texto livre:** posição, cor e fonte livres; emojis e adesivos por cima.
- **Efeitos animados a partir de uma foto:** tremer, girar, pulsar, zoom dramático, piscar.
- **Modelos prontos:** "reação", "antes e depois", "comparação" com espaços para fotos.
- **Galeria:** ranking semanal, figurinha do dia, coleções por tema (futebol, BBB, bom dia, sextou).
- **Perfil do criador** sem login (link pessoal com o que publicou).
- **Botão "Fazer a minha versão"** em qualquer figurinha da comunidade.
- **Domínio próprio** (ex.: zapfig.com.br), via registro de domínios do Cloudflare.

## Adiado
- App Android com "Adicionar ao WhatsApp" em um toque: por enquanto só o site.
- R2 para os arquivos da galeria (hoje ficam no KV `zapfig-files`); precisa ativar o R2 no painel do Cloudflare.
