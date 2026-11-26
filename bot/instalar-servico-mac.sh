#!/usr/bin/env bash
# Deixa o robô ligando sozinho no Mac (ao entrar na conta e se cair). Rode uma vez, depois de conectar com "npm start".
set -euo pipefail
DIR="$(cd "$(dirname "$0")" && pwd)"
NODE="$(command -v node)"
PLIST="$HOME/Library/LaunchAgents/app.zapfig.bot.plist"
mkdir -p "$HOME/Library/LaunchAgents"
cat > "$PLIST" <<PL
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>app.zapfig.bot</string>
  <key>ProgramArguments</key><array><string>$NODE</string><string>$DIR/index.mjs</string></array>
  <key>WorkingDirectory</key><string>$DIR</string>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>StandardOutPath</key><string>$DIR/bot.log</string>
  <key>StandardErrorPath</key><string>$DIR/bot.log</string>
</dict></plist>
PL
launchctl unload "$PLIST" 2>/dev/null || true
launchctl load "$PLIST"
echo "Robô instalado como serviço. Log: $DIR/bot.log"
echo "Para parar: launchctl unload $PLIST"
