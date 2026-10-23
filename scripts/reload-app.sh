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
  pm2 reload "$app_root/ecosystem.config.cjs" --only play-infinity-app --update-env
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
expected_release=$(basename "$(readlink -f "$app_root/current")")
pm2 jlist | node "$tools_dir/check-app-processes.cjs" "$expected_release"
node "$tools_dir/verify-release.cjs" "http://127.0.0.1:${PLAY_INFINITY_PORT:-3000}/api/health" "$expected_release"
pm2 save
echo "Reload verificado: $expected_release"
