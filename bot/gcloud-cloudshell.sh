#!/usr/bin/env bash
# Cria a máquina grátis (e2-micro, Always Free) no Google Cloud pelo Cloud Shell e instala o robô do Zapfig.
# Uso no Cloud Shell do Google (ícone >_ em console.cloud.google.com):
#   curl -fsSL https://raw.githubusercontent.com/guto56/figMaker/claude/keen-cray-naswc6/bot/gcloud-cloudshell.sh | BOT_TOKEN=... PAIR_NUMBER=5565992463819 bash
set -euo pipefail

: "${BOT_TOKEN:?defina BOT_TOKEN}"
PAIR_NUMBER="${PAIR_NUMBER:-}"
BRANCH="${BRANCH:-claude/keen-cray-naswc6}"
NAME="zapfig-bot"
# só estas regiões têm e2-micro grátis; us-east1 é a mais perto do Brasil
ZONE="${ZONE:-us-east1-b}"

say() { printf '\n== %s\n' "$*"; }

say "1/7 Projeto"
PROJECT="$(gcloud config get-value project 2>/dev/null || true)"
if [ -z "$PROJECT" ] || [ "$PROJECT" = "(unset)" ]; then
  PROJECT="zapfig-bot-$(tr -dc 'a-z0-9' </dev/urandom | head -c 6)"
  gcloud projects create "$PROJECT" --name="Zapfig" --quiet
  gcloud config set project "$PROJECT" --quiet
fi
echo "projeto: $PROJECT"

say "2/7 Faturamento (o Google exige um cartão ligado, mesmo no grátis)"
ENABLED="$(gcloud billing projects describe "$PROJECT" --format='value(billingEnabled)' 2>/dev/null || true)"
if [ "$ENABLED" != "True" ]; then
  ACCOUNTS="$(gcloud billing accounts list --filter=open=true --format='value(name)' 2>/dev/null || true)"
  N="$(printf '%s\n' "$ACCOUNTS" | grep -c . || true)"
  if [ "$N" = "0" ]; then
    echo "Sua conta Google Cloud ainda não tem forma de pagamento."
    echo "Abra https://console.cloud.google.com/billing , clique em 'Criar conta de faturamento', coloque o cartão e rode este comando de novo."
    exit 1
  fi
  ACC="$(printf '%s\n' "$ACCOUNTS" | head -1)"
  gcloud billing projects link "$PROJECT" --billing-account="$ACC" --quiet
fi
echo "faturamento ok"

say "3/7 Ligando o Compute Engine (pode levar 1-2 minutos na primeira vez)"
gcloud services enable compute.googleapis.com --quiet
echo "ok"

say "4/7 Instalação automática na primeira inicialização"
SS="$(mktemp)"
cat > "$SS" <<EOF
#!/bin/bash
[ -f /opt/zapfig-installed ] && exit 0
id zapfig >/dev/null 2>&1 || { useradd -m -s /bin/bash zapfig; echo 'zapfig ALL=(ALL) NOPASSWD:ALL' > /etc/sudoers.d/zapfig; chmod 440 /etc/sudoers.d/zapfig; }
sudo -u zapfig -H bash -c 'curl -fsSL https://raw.githubusercontent.com/guto56/figMaker/$BRANCH/bot/instalar-servidor-linux.sh | BOT_TOKEN=$BOT_TOKEN PAIR_NUMBER=$PAIR_NUMBER BRANCH=$BRANCH bash' > /var/log/zapfig-install.log 2>&1 && touch /opt/zapfig-installed
EOF

say "5/7 Máquina grátis (e2-micro em $ZONE)"
if gcloud compute instances describe "$NAME" --zone "$ZONE" --format='value(status)' >/dev/null 2>&1; then
  echo "já existe; vou usar ela"
  gcloud compute instances start "$NAME" --zone "$ZONE" --quiet >/dev/null 2>&1 || true
else
  gcloud compute instances create "$NAME" --zone "$ZONE" \
    --machine-type e2-micro \
    --image-family ubuntu-2404-lts-amd64 --image-project ubuntu-os-cloud \
    --boot-disk-size 30GB --boot-disk-type pd-standard \
    --metadata-from-file startup-script="$SS" \
    --quiet
fi

say "6/7 Esperando o robô instalar (3 a 8 minutos)"
SSH=(gcloud compute ssh "$NAME" --zone "$ZONE" --quiet --ssh-flag=-oConnectTimeout=10 --command)
for i in $(seq 1 60); do
  if "${SSH[@]}" 'systemctl is-active --quiet zapfig-bot' >/dev/null 2>&1; then echo "robô instalado"; break; fi
  printf '.'; sleep 10
  [ "$i" = 60 ] && { echo; echo "Demorou demais. Veja o log: gcloud compute ssh $NAME --zone $ZONE --command 'sudo tail -50 /var/log/zapfig-install.log'"; exit 1; }
done

say "7/7 Código para conectar o WhatsApp"
"${SSH[@]}" 'sudo systemctl restart zapfig-bot; sleep 20; sudo journalctl -u zapfig-bot -n 30 --no-pager | grep -E "digite|Robô conectado|Escaneie" | tail -1' || true
cat <<EOF

No celular do número do robô: WhatsApp > Aparelhos conectados > Conectar um aparelho
> Conectar com número de telefone > digite o código acima (vale ~1 minuto).

Comandos úteis (aqui no Cloud Shell):
  novo código:   gcloud compute ssh $NAME --zone $ZONE --command 'sudo systemctl restart zapfig-bot; sleep 20; sudo journalctl -u zapfig-bot -n 30 --no-pager | grep digite | tail -1'
  ver se ligou:  gcloud compute ssh $NAME --zone $ZONE --command 'sudo journalctl -u zapfig-bot -n 30 --no-pager | grep "Robô conectado"'
  log ao vivo:   gcloud compute ssh $NAME --zone $ZONE --command 'sudo journalctl -u zapfig-bot -f'
EOF
