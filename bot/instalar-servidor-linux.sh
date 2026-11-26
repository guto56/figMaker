#!/usr/bin/env bash
# Instala o robô do Zapfig numa máquina Linux (Oracle Cloud, Ubuntu 22.04/24.04 ou Oracle Linux).
# Uso (como o usuário padrão da máquina, com sudo):
#   curl -fsSL https://raw.githubusercontent.com/guto56/figMaker/claude/keen-cray-naswc6/bot/instalar-servidor-linux.sh | BOT_TOKEN=... PAIR_NUMBER=5565992463819 bash
set -euo pipefail

: "${BOT_TOKEN:?defina BOT_TOKEN}"
PAIR_NUMBER="${PAIR_NUMBER:-}"
BRANCH="${BRANCH:-claude/keen-cray-naswc6}"
DIR="$HOME/zapfig"

echo "== 1/5 Pacotes do sistema"
if command -v apt-get >/dev/null; then
  sudo apt-get update -y
  sudo apt-get install -y git curl ca-certificates ffmpeg
  if ! command -v node >/dev/null || [ "$(node -p 'process.versions.node.split(".")[0]')" -lt 20 ]; then
    curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
    sudo apt-get install -y nodejs
  fi
else
  sudo dnf install -y git curl ffmpeg || sudo dnf install -y git curl
  if ! command -v node >/dev/null || [ "$(node -p 'process.versions.node.split(".")[0]')" -lt 20 ]; then
    curl -fsSL https://rpm.nodesource.com/setup_22.x | sudo bash -
    sudo dnf install -y nodejs
  fi
fi
node -v

echo "== 2/5 Memória extra (swap de 1 GB, útil na máquina Micro)"
if ! swapon --show | grep -q swapfile; then
  sudo fallocate -l 1G /swapfile && sudo chmod 600 /swapfile && sudo mkswap /swapfile && sudo swapon /swapfile
  grep -q '/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab >/dev/null
fi

echo "== 3/5 Código do robô"
if [ -d "$DIR/.git" ]; then
  git -C "$DIR" fetch --depth 1 origin "$BRANCH" && git -C "$DIR" checkout -q FETCH_HEAD
else
  git clone --depth 1 --branch "$BRANCH" https://github.com/guto56/figMaker.git "$DIR"
fi
cd "$DIR/bot"
npm ci --omit=dev
# modelos para tirar o fundo da foto (rembg): silueta (melhor) e u2netp (reserva, mais leve)
mkdir -p models
[ -s models/silueta.onnx ] || curl -fsSL -o models/silueta.onnx https://github.com/danielgatis/rembg/releases/download/v0.0.0/silueta.onnx || true
[ -s models/u2netp.onnx ] || curl -fsSL -o models/u2netp.onnx https://github.com/danielgatis/rembg/releases/download/v0.0.0/u2netp.onnx || true
umask 077
cat > .env <<EOF
ZAPFIG_API=https://zapfig.hrycsngb42.workers.dev
BOT_TOKEN=$BOT_TOKEN
PAIR_NUMBER=$PAIR_NUMBER
EOF

echo "== 4/5 Serviço (liga sozinho e reinicia se cair)"
sudo tee /etc/systemd/system/zapfig-bot.service >/dev/null <<EOF
[Unit]
Description=Robo do Zapfig (WhatsApp)
After=network-online.target
Wants=network-online.target

[Service]
User=$USER
WorkingDirectory=$DIR/bot
ExecStart=$(command -v node) index.mjs
Restart=always
RestartSec=5
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
EOF
sudo systemctl daemon-reload
sudo systemctl enable --now zapfig-bot

echo "== 5/5 Conectando ao WhatsApp"
echo "Aguarde o código de pareamento (até 30 s)..."
sleep 15
sudo journalctl -u zapfig-bot -n 40 --no-pager | grep -E "Conectar com número|digite|Robô conectado|Escaneie" || true
echo
echo "No celular do número do robô: WhatsApp > Aparelhos conectados > Conectar um aparelho > Conectar com número de telefone > digite o código acima."
echo "Para ver o log a qualquer momento: sudo journalctl -u zapfig-bot -f"
