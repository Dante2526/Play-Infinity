#!/usr/bin/env bash
set -Eeuo pipefail
app_root=${1:-/home/ubuntu/play-infinity}
tools_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
if [[ ${PLAY_INFINITY_LOCK_HELD:-0} != 1 ]]; then
  exec 9>"$app_root/.deploy.lock"
  flock -x 9
fi
if [[ -L $app_root/node-runtime ]]; then export PATH="$(readlink -f "$app_root/node-runtime")/bin:$PATH"; fi
cd "$app_root"
processes=$(pm2 jlist)
if printf '%s' "$processes" | node "$tools_dir/check-app-processes.cjs" '' --allow-absent; then
  # Refuse fork mode or a degraded cluster: PM2 would fall back to a restart.
  node "$tools_dir/reload-release.cjs" "$app_root"
else
  check_status=$?
  if [[ $check_status == 3 ]]; then
    # First installation has no existing viewers to drain.
    pm2 start "$app_root/ecosystem.config.cjs" --only play-infinity-app
  else
    echo 'Reload cancelado: corrija o cluster PM2 antes de continuar.' >&2
    exit 1
  fi
fi
expected_dir=$(readlink -f "$app_root/current")
expected_release=$(basename "$expected_dir")
pm2 jlist | node "$tools_dir/check-app-processes.cjs" "$expected_release" --release-dir "$expected_dir"
# Verificação da porta ao vivo com janela limitada de retentativas: logo após
# um rolling reload o primeiro /api/health pode exceder o timeout de 5s do
# fetch enquanto os workers aquecem (init SQLite/catálogo). Uma única
# tentativa marcava deploys saudáveis como falhos (2x em 2026-10-26), pois
# o trap de cleanup não reverte um reload já concluído. Workers antigos em
# drenagem respondem com release anterior e continuam falhando a checagem,
# então o retry também preserva a verificação de identidade da versão.
verify_attempts=${PLAY_INFINITY_VERIFY_ATTEMPTS:-30}
verified=0
for (( attempt=1; attempt<=verify_attempts; attempt++ )); do
  if node "$tools_dir/verify-release.cjs" "http://127.0.0.1:${PLAY_INFINITY_PORT:-3000}/api/health" "$expected_release"; then
    verified=1
    break
  fi
  sleep 1
done
if (( verified != 1 )); then
  echo "Healthcheck da porta ao vivo falhou após ${verify_attempts} tentativas; inspecione o PM2." >&2
  exit 1
fi
pm2 save
echo "Reload verificado: $expected_release"
