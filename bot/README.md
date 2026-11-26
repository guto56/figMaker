# Robô do Zapfig (receber figurinha pelo WhatsApp)

Quando alguém toca em **Receber no WhatsApp** no site, o WhatsApp abre com a mensagem `ZAPFIG ABC123` para o número do robô. A pessoa envia, e o robô responde com a figurinha: normal, animada ou **com som**.

- O robô só responde. Nunca manda mensagem para quem não falou com ele primeiro.
- Cada código vale 30 minutos e serve uma vez.
- Limite de 15 figurinhas por hora para cada pessoa.

> Atenção: o robô usa uma conexão não oficial (Baileys), porque a API oficial do WhatsApp é paga e não envia figurinha com som. Isso vai contra os termos do WhatsApp e o número pode ser banido. Use só o número secundário.

## Instalar no Mac (uma vez)

1. Instale o Node.js 20 ou mais novo: https://nodejs.org (botão "LTS") ou `brew install node`.
2. No Terminal, dentro desta pasta (`bot/`):
   ```bash
   npm install
   cp .env.example .env
   ```
3. Abra o `.env` e cole a senha do robô em `BOT_TOKEN=` (a mesma salva no Cloudflare).
4. Conecte o número secundário:
   ```bash
   npm start
   ```
   Aparece um QR code no Terminal. No celular do número secundário, vá em **WhatsApp > Aparelhos conectados > Conectar um aparelho** e escaneie.
   Se preferir código em vez de QR, preencha `PAIR_NUMBER=55DDDNUMERO` no `.env` antes de rodar.
5. Quando aparecer `Robô conectado`, teste: no site, toque em **Receber no WhatsApp** e envie a mensagem.

## Deixar ligado sozinho

Depois de conectar uma vez, pare o robô com `Ctrl+C` e rode:

```bash
./instalar-servico-mac.sh
```

O robô passa a ligar sozinho quando você entra no Mac e reinicia se cair. O log fica em `bot.log`.

Para o robô funcionar, o Mac precisa estar ligado e sem dormir. Em **Ajustes do Sistema > Bateria (ou Energia)**, impeça o repouso automático com a tela desligada.

- Para parar: `launchctl unload ~/Library/LaunchAgents/app.zapfig.bot.plist`
- Para desconectar o número: apague a pasta `auth/` e, no celular, remova o aparelho "Zapfig" em Aparelhos conectados.

## Arquivos

- `index.mjs`: conexão, leitura do código e envio.
- `sound-sticker.mjs`: coloca o som dentro da figurinha (campo 26 da StickerMessage, que o Baileys ainda não conhece).
- `auth/`: a sessão do WhatsApp. **Não compartilhe e não envie ao GitHub** (já está no `.gitignore`).

## Instalar num servidor Linux (Oracle Cloud)

Numa máquina Ubuntu ou Oracle Linux, rode um comando só (troque a senha):

```bash
curl -fsSL https://raw.githubusercontent.com/guto56/figMaker/claude/keen-cray-naswc6/bot/instalar-servidor-linux.sh | BOT_TOKEN=SENHA_DO_ROBO PAIR_NUMBER=5565992463819 bash
```

O script instala o Node, baixa o robô e o deixa como serviço. No fim, mostra um código de 8 letras: no celular do número do robô, vá em **Aparelhos conectados > Conectar um aparelho > Conectar com número de telefone** e digite esse código.

Se o código não funcionar, troque `PAIR_NUMBER` pelo número sem o 9 depois do DDD (`556592463819`), porque alguns números antigos ficam registrados assim no WhatsApp.
