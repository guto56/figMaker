#!/usr/bin/env bash
# Apaga TODAS as máquinas (instâncias) e redes (VCNs) da conta Oracle, em todos os compartimentos.
# Mostra a lista e só apaga depois de você digitar APAGAR.
# Uso no Cloud Shell:
#   curl -fsSL https://raw.githubusercontent.com/guto56/figMaker/claude/keen-cray-naswc6/bot/oracle-limpar.sh | bash
set -uo pipefail

T="${OCI_TENANCY:-}"
if [ -z "$T" ]; then
  for f in "${OCI_CONFIG_FILE:-}" /etc/oci/config ~/.oci/config; do
    [ -n "$f" ] && [ -f "$f" ] && T=$(grep -m1 '^tenancy' "$f" | cut -d= -f2 | tr -d ' ') && [ -n "$T" ] && break
  done
fi
[ -n "$T" ] || { echo "Não achei a tenancy. Rode no Cloud Shell da Oracle."; exit 1; }

ids() { oci "$@" --all --query 'data[].id' --raw-output 2>/dev/null | tr -d '[]", ' | grep -v '^$' || true; }
names() { oci "$@" --all --query 'data[]."display-name"' --raw-output 2>/dev/null | tr -d '[]"' | sed 's/^ *//;s/,$//' | grep -v '^$' || true; }

COMPS="$T $(ids iam compartment list -c "$T" --compartment-id-in-subtree true --lifecycle-state ACTIVE)"

echo "== O que existe na conta"
total=0
for c in $COMPS; do
  for st in RUNNING STOPPED STARTING STOPPING PROVISIONING; do
    for n in $(oci compute instance list -c "$c" --all --lifecycle-state $st --query 'data[]."display-name"' --raw-output 2>/dev/null | tr -d '[]",' ); do echo "  máquina: $n ($st)"; total=$((total+1)); done
  done
  while IFS= read -r n; do [ -n "$n" ] && { echo "  rede (VCN): $n"; total=$((total+1)); }; done < <(names network vcn list -c "$c")
done
[ "$total" = 0 ] && { echo "Nada para apagar."; exit 0; }

echo
echo "Isso apaga as máquinas acima (com os discos) e as redes. Não dá para desfazer."
printf 'Digite APAGAR para continuar: '
read -r ok < /dev/tty
[ "$ok" = "APAGAR" ] || { echo "Cancelado. Nada foi apagado."; exit 0; }

for c in $COMPS; do
  echo "== Máquinas"
  for st in RUNNING STOPPED STARTING STOPPING PROVISIONING; do
    for i in $(ids compute instance list -c "$c" --lifecycle-state $st); do
      echo "  encerrando $i"
      oci compute instance terminate --instance-id "$i" --preserve-boot-volume false --force --wait-for-state TERMINATED --max-wait-seconds 900 >/dev/null 2>&1 || echo "  (falhou: $i)"
    done
  done

  for v in $(ids network vcn list -c "$c"); do
    echo "== Rede $v"
    # rotas apontam para gateways: limpa antes
    for rt in $(ids network route-table list -c "$c" --vcn-id "$v"); do
      oci network route-table update --rt-id "$rt" --route-rules '[]' --force >/dev/null 2>&1
    done
    for s in $(ids network subnet list -c "$c" --vcn-id "$v"); do
      echo "  sub-rede $s"; oci network subnet delete --subnet-id "$s" --force --wait-for-state TERMINATED >/dev/null 2>&1 || echo "  (falhou: $s)"
    done
    for g in $(ids network internet-gateway list -c "$c" --vcn-id "$v"); do oci network internet-gateway delete --ig-id "$g" --force --wait-for-state TERMINATED >/dev/null 2>&1; done
    for g in $(ids network nat-gateway list -c "$c" --vcn-id "$v"); do oci network nat-gateway delete --nat-gateway-id "$g" --force --wait-for-state TERMINATED >/dev/null 2>&1; done
    for g in $(ids network service-gateway list -c "$c" --vcn-id "$v"); do oci network service-gateway delete --service-gateway-id "$g" --force --wait-for-state TERMINATED >/dev/null 2>&1; done
    for g in $(ids network local-peering-gateway list -c "$c" --vcn-id "$v"); do oci network local-peering-gateway delete --local-peering-gateway-id "$g" --force --wait-for-state TERMINATED >/dev/null 2>&1; done
    for a in $(ids network drg-attachment list -c "$c" --vcn-id "$v"); do oci network drg-attachment delete --drg-attachment-id "$a" --force --wait-for-state DETACHED >/dev/null 2>&1; done
    DEF_RT=$(oci network vcn get --vcn-id "$v" --query 'data."default-route-table-id"' --raw-output 2>/dev/null)
    DEF_SL=$(oci network vcn get --vcn-id "$v" --query 'data."default-security-list-id"' --raw-output 2>/dev/null)
    DEF_DH=$(oci network vcn get --vcn-id "$v" --query 'data."default-dhcp-options-id"' --raw-output 2>/dev/null)
    for rt in $(ids network route-table list -c "$c" --vcn-id "$v"); do [ "$rt" != "$DEF_RT" ] && oci network route-table delete --rt-id "$rt" --force --wait-for-state TERMINATED >/dev/null 2>&1; done
    for sl in $(ids network security-list list -c "$c" --vcn-id "$v"); do [ "$sl" != "$DEF_SL" ] && oci network security-list delete --security-list-id "$sl" --force --wait-for-state TERMINATED >/dev/null 2>&1; done
    for dh in $(ids network dhcp-options list -c "$c" --vcn-id "$v"); do [ "$dh" != "$DEF_DH" ] && oci network dhcp-options delete --dhcp-id "$dh" --force --wait-for-state TERMINATED >/dev/null 2>&1; done
    for ng in $(ids network nsg list -c "$c" --vcn-id "$v"); do oci network nsg delete --nsg-id "$ng" --force --wait-for-state TERMINATED >/dev/null 2>&1; done
    if oci network vcn delete --vcn-id "$v" --force --wait-for-state TERMINATED >/dev/null 2>&1; then echo "  rede apagada"; else echo "  NÃO consegui apagar esta rede (algum recurso ainda usa ela; me mande um print)"; fi
  done
done

echo
echo "Limpeza feita. Agora rode o instalador do robô de novo."
