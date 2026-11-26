# Pendências

Atualizado em 26/11/2026.

## Feito recentemente
- **Robô no WhatsApp** (+55 65 99246-3819), rodando na Oracle Cloud (máquina Always Free):
  - entrega figurinhas do site pelo código `ZAPFIG <código>`, com som, animada ou normal, sem limite;
  - cria figurinha pela conversa: foto, vídeo ou GIF → texto (em cima ou embaixo) → som (áudio da pessoa ou som de meme, com prévia) → figurinha. As escolhas são feitas em enquetes. Limite de 3 por pessoa por dia;
  - ignora figurinhas recebidas; manda a mensagem de boas-vindas no máximo a cada 5 minutos por pessoa.
- **Figurinha com som no formato nativo do WhatsApp** (envelope `audioStickerMessage`, campo 134), conferido com uma figurinha criada no próprio app.
- **Site:**
  - página "Robô no WhatsApp" (`/robo`) com conversa animada, número oficial e botão para salvar o contato;
  - botão "Receber no meu WhatsApp" como caminho principal;
  - download direto sem .zip;
  - "Como usar" reescrito, animações nos elementos principais.
- **Galeria:** 30 memes reais (Imgflip, KLIPY e sons do MyInstants) e 2 pacotes.
- **Segurança:** auditoria completa, ver `SECURITY_REPORT.md`.

## Para fazer manualmente (dono)
- **Rotacionar as credenciais** que foram coladas no chat: token do Cloudflare, chave do KLIPY e chave do Freesound (ver `SECURITY_REPORT.md`, seção 6).
- **Perfil do robô no WhatsApp:** foto com o logo do Zapfig, nome "Zapfig" e recado "Robô de figurinhas, mande uma foto".
- **Domínio próprio** (ex.: zapfig.com.br): passa mais confiança, principalmente para quem vai mandar mensagem para o robô.

## Próximas funcionalidades (ordem sugerida)
1. **Tirar o fundo da foto no robô.** Pesado para a máquina Micro (1 GB); avaliar quando houver vaga na máquina ARM ou fazer como opcional.
2. **Alerta se o robô cair:** aviso no WhatsApp ou e-mail do dono se a sessão desconectar ou a máquina parar.
3. **Painel simples de uso:** figurinhas enviadas por dia (site e robô), pessoas atendidas, limites atingidos.
4. **Pacote inteiro pelo WhatsApp:** botão "Receber no WhatsApp" na página do pacote (o robô manda as figurinhas uma a uma).
5. **Figurinha por IA:** descrever e o Zapfig desenha (Workers AI via binding `AI`, sem chave). Também foto → desenho/3D. Dá para oferecer no robô ("mande um texto e eu desenho").
6. **Voz por texto:** digitar a frase e gerar o áudio da figurinha (TTS).
7. **Legenda falada automática:** transcrever o áudio e virar o texto da figurinha (Whisper no Workers AI).
8. **Readicionar "Partir de uma figurinha da galeria"** no editor (etapa Escolher). O carregamento por `?de=<id>` continua funcionando.
9. **Editor:**
   - imagem por cima de vídeo/GIF;
   - texto livre (posição, cor, fonte), emojis e adesivos;
   - efeitos animados a partir de foto (tremer, girar, pulsar, zoom);
   - modelos prontos ("antes e depois", "reação").
10. **Galeria:**
    - botão "Fazer a minha versão";
    - ranking semanal, figurinha do dia, coleções por tema;
    - perfil do criador sem login.

## Adiado
- App Android com "Adicionar ao WhatsApp" em um toque (por enquanto só site e robô).
- R2 para os arquivos da galeria (hoje no KV `zapfig-files`); precisa ativar o R2 no painel do Cloudflare.
- Máquina ARM da Oracle (mais forte): o script `bot/oracle-cloudshell.sh` tenta criar quando houver vaga em São Paulo.
