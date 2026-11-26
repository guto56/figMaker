#!/usr/bin/env bash
# Cria tudo na Oracle Cloud pelo Cloud Shell (ícone >_ do painel) e instala o robô do Zapfig.
# Uso:
#   curl -fsSL https://raw.githubusercontent.com/guto56/figMaker/claude/keen-cray-naswc6/bot/oracle-cloudshell.sh | BOT_TOKEN=... PAIR_NUMBER=5565992463819 bash
# Opcional: SHAPE=A1 para tentar a máquina ARM (mais forte, mas costuma estar sem vaga).
set -euo pipefail

: "${BOT_TOKEN:?defina BOT_TOKEN}"
PAIR_NUMBER="${PAIR_NUMBER:-}"
BRANCH="${BRANCH:-claude/keen-cray-naswc6}"
NAME="zapfig-bot"
C="${OCI_TENANCY:-${OCI_CS_TENANCY:-}}"
if [ -z "$C" ]; then
  for f in "${OCI_CONFIG_FILE:-}" /etc/oci/config ~/.oci/config; do
    [ -n "$f" ] && [ -f "$f" ] && C=$(grep -m1 '^tenancy' "$f" | cut -d= -f2 | tr -d ' ') && [ -n "$C" ] && break
  done
fi
[ -n "$C" ] || { echo "Não achei a tenancy. Rode este script dentro do Cloud Shell da Oracle."; exit 1; }

say() { printf '\n== %s\n' "$*"; }
q() { oci "$@" 2>/dev/null; }

say "1/7 Região e zona"
AD=$(oci iam availability-domain list -c "$C" --query 'data[0].name' --raw-output)
echo "zona: $AD"

say "2/7 Rede (reaproveita se já existir)"
VCN=$(q network vcn list -c "$C" --display-name zapfig-vcn --query 'data[0].id' --raw-output || true)
if [ -z "$VCN" ] || [ "$VCN" = "None" ]; then
  VCN=$(oci network vcn create -c "$C" --cidr-blocks '["10.0.0.0/16"]' --display-name zapfig-vcn --dns-label zapfig \
    --wait-for-state AVAILABLE --query data.id --raw-output)
fi
IGW=$(q network internet-gateway list -c "$C" --vcn-id "$VCN" --query 'data[0].id' --raw-output || true)
if [ -z "$IGW" ] || [ "$IGW" = "None" ]; then
  IGW=$(oci network internet-gateway create -c "$C" --vcn-id "$VCN" --is-enabled true --display-name zapfig-igw \
    --wait-for-state AVAILABLE --query data.id --raw-output)
fi
RT=$(oci network vcn get --vcn-id "$VCN" --query 'data."default-route-table-id"' --raw-output)
oci network route-table update --rt-id "$RT" --force \
  --route-rules "[{\"destination\":\"0.0.0.0/0\",\"destinationType\":\"CIDR_BLOCK\",\"networkEntityId\":\"$IGW\"}]" >/dev/null
SUBNET=$(q network subnet list -c "$C" --vcn-id "$VCN" --display-name zapfig-subnet --query 'data[0].id' --raw-output || true)
if [ -z "$SUBNET" ] || [ "$SUBNET" = "None" ]; then
  SUBNET=$(oci network subnet create -c "$C" --vcn-id "$VCN" --cidr-block 10.0.0.0/24 --display-name zapfig-subnet \
    --dns-label bot --wait-for-state AVAILABLE --query data.id --raw-output)
fi
echo "rede ok"

say "3/7 Chave SSH"
# o Cloud Shell roda em modo FIPS: só aceita chave RSA
KEY=~/.ssh/zapfig_rsa
[ -f "$KEY" ] || ssh-keygen -t rsa -b 4096 -N "" -f "$KEY" -q
echo "chave ok"

say "4/7 Instalação automática na primeira inicialização"
UD=$(mktemp)
cat > "$UD" <<EOF
#!/bin/bash
sudo -u ubuntu -H bash -c 'curl -fsSL https://raw.githubusercontent.com/guto56/figMaker/$BRANCH/bot/instalar-servidor-linux.sh | BOT_TOKEN=$BOT_TOKEN PAIR_NUMBER=$PAIR_NUMBER BRANCH=$BRANCH bash' > /var/log/zapfig-install.log 2>&1
EOF

say "5/7 Máquina grátis (Always Free)"
EXISTING=$(q compute instance list -c "$C" --display-name "$NAME" --lifecycle-state RUNNING --query 'data[0].id' --raw-output || true)
if [ -n "$EXISTING" ] && [ "$EXISTING" != "None" ]; then
  echo "já existe uma máquina $NAME ligada; vou usar ela"
  INST="$EXISTING"
else
  launch() {
    local shape="$1" extra="$2"
    local img
    img=$(oci compute image list -c "$C" --operating-system "Canonical Ubuntu" --operating-system-version "24.04" \
      --shape "$shape" --sort-by TIMECREATED --sort-order DESC --query 'data[0].id' --raw-output)
    echo "imagem Ubuntu 24.04 para $shape: ${img:0:40}…"
    # shellcheck disable=SC2086
    oci compute instance launch -c "$C" --availability-domain "$AD" --display-name "$NAME" \
      --shape "$shape" $extra --image-id "$img" --subnet-id "$SUBNET" --assign-public-ip true \
      --ssh-authorized-keys-file "$KEY.pub" --user-data-file "$UD" \
      --wait-for-state RUNNING --max-wait-seconds 900 --query data.id --raw-output
  }
  INST=""
  if [ "${SHAPE:-}" = "A1" ]; then
    INST=$(launch VM.Standard.A1.Flex '--shape-config {"ocpus":1,"memoryInGBs":6}' || true)
    [ -n "$INST" ] || echo "ARM sem vaga agora; vou de AMD Micro."
  fi
  if [ -z "$INST" ]; then
    INST=$(launch VM.Standard.E2.1.Micro "") || {
      echo "Não consegui criar a máquina. Se a mensagem acima fala em 'Out of capacity' ou 'LimitExceeded', me mande um print."
      exit 1
    }
  fi
fi
IP=$(oci compute instance list-vnics --instance-id "$INST" --query 'data[0]."public-ip"' --raw-output)
echo "máquina ligada. IP: $IP"

say "6/7 Esperando o robô instalar (3 a 8 minutos)"
SSH="ssh -i $KEY -o StrictHostKeyChecking=accept-new -o ConnectTimeout=10 -o BatchMode=yes ubuntu@$IP"
for i in $(seq 1 60); do
  if $SSH 'systemctl is-active --quiet zapfig-bot' 2>/dev/null; then echo "robô instalado"; break; fi
  printf '.'; sleep 10
  [ "$i" = 60 ] && { echo; echo "Demorou demais. Veja o log com: $SSH 'tail -50 /var/log/zapfig-install.log'"; exit 1; }
done

say "7/7 Código para conectar o WhatsApp"
$SSH 'sudo systemctl restart zapfig-bot; sleep 20; sudo journalctl -u zapfig-bot -n 30 --no-pager | grep -E "digite|Robô conectado|Escaneie" | tail -1' || true
cat <<EOF

No celular do número do robô: WhatsApp > Aparelhos conectados > Conectar um aparelho
> Conectar com número de telefone > digite o código acima (vale ~1 minuto).

Comandos úteis (aqui no Cloud Shell):
  novo código:   $SSH 'sudo systemctl restart zapfig-bot; sleep 20; sudo journalctl -u zapfig-bot -n 30 --no-pager | grep digite | tail -1'
  ver se ligou:  $SSH 'sudo journalctl -u zapfig-bot -n 30 --no-pager | grep "Robô conectado"'
  log ao vivo:   $SSH 'sudo journalctl -u zapfig-bot -f'
EOF
