#!/usr/bin/env bash
# Run under the SAME account/PM2 daemon as the existing web application (root
# in the current workflow). The independent video-proxy is never restarted.
set -Eeuo pipefail
archive=${1:?Informe o pacote de deploy}
release_id=${2:?Informe o identificador da versão}
app_root=${3:-/home/ubuntu/play-infinity}
[[ $release_id =~ ^[a-zA-Z0-9_-]+$ ]] || { echo 'Versão inválida' >&2; exit 1; }
mkdir -p "$app_root/releases" "$app_root/shared-assets" "$app_root/deploy-tools"
app_root=$(cd "$app_root" && pwd -P)
release="$app_root/releases/$release_id"
exec 9>"$app_root/.deploy.lock"
flock -x 9
[[ ! -e $release ]] || { echo 'Versão já existe; use um identificador novo.' >&2; exit 1; }
mkdir "$release"
probe_pid=''
switched=0
previous_release=''
if [[ -e $app_root/current || -L $app_root/current ]]; then previous_release=$(readlink -f "$app_root/current"); fi
legacy_migration=0
check_existing_cluster() {
  local processes check_status
  local migration_args=()
  if [[ ${PLAY_INFINITY_MIGRATE_LEGACY_FORK:-0} == 1 ]]; then migration_args+=(--allow-legacy-fork); fi
  processes=$(pm2 jlist)
  legacy_migration=0
  if printf '%s' "$processes" | node "$release/scripts/check-app-processes.cjs" '' --allow-absent "${migration_args[@]}"; then
    return 0
  else
    check_status=$?
    if [[ $check_status == 3 ]]; then return 0; fi
    if [[ $check_status == 4 && ${PLAY_INFINITY_MIGRATE_LEGACY_FORK:-0} == 1 ]]; then legacy_migration=1; return 0; fi
    return 1
  fi
}
cleanup() {
  result=$?
  if [[ -n $probe_pid ]]; then
    kill -TERM "$probe_pid" 2>/dev/null || true
    wait "$probe_pid" 2>/dev/null || true
  fi
  if (( result != 0 )); then
    if (( switched == 0 )); then
      echo 'Deploy abortado antes da troca; a aplicação ativa foi preservada.' >&2
    else
      # A reload may already have started draining old workers. Never kill all
      # processes or pretend that restoring only the symlink rolls them back.
      echo "Falha após a troca. Inspecione PM2; versão anterior preservada: $previous_release" >&2
    fi
  fi
  exit "$result"
}
trap cleanup EXIT
tar -xzf "$archive" -C "$release"
test -s "$release/dist/server.cjs"
test -s "$release/dist/index.html"
test -s "$release/ecosystem.config.cjs"

# Validate the existing topology before the slow dependency install. This does
# not depend on the candidate and must not waste minutes before reporting a
# pre-existing fork/degraded cluster. Never restart or delete processes here.
check_existing_cluster

# Every release owns its dependencies; never mutate modules used by old workers.
cd "$release"
npm ci --omit=dev --no-audit --no-fund

# Persistent runtime files are shared. Keep all existing VPS data and secrets;
# seed missing data only on initial migration, never overwrite live catalogues.
mkdir -p "$app_root/data" "$app_root/uploads" "$app_root/secrets"
cp -an "$release/data/." "$app_root/data/"
rm -rf "$release/data"
for name in data uploads secrets; do
  ln -s "$app_root/$name" "$release/$name"
done
for name in .env .env.local oracle-vps.key firebase-service-account.json; do
  if [[ -f $app_root/$name ]]; then ln -s "$app_root/$name" "$release/$name"; fi
done

# Publish each hashed asset atomically and retain previous hashes indefinitely.
# Also seed assets used by viewers of the pre-release layout on first migration.
for assets in "$app_root/dist/assets" "$release/dist/assets"; do
  if [[ -d $assets ]]; then
    while IFS= read -r -d '' asset; do
      relative=${asset#"$assets/"}
      target="$app_root/shared-assets/$relative"
      mkdir -p "$(dirname "$target")"
      cp "$asset" "$target.$release_id.tmp"
      mv -f "$target.$release_id.tmp" "$target"
    done < <(find "$assets" -type f -print0)
  fi
done

# Validate the actual production bundle on a separate loopback port before any
# symlink/PM2 change. Do not start catalogue notification jobs for the probe.
probe_port=${PLAY_INFINITY_PROBE_PORT:-3100}
pm2 jlist | APP_PROBE=1 APP_BIND_HOST=127.0.0.1 NODE_ENV=production PORT="$probe_port" APP_RELEASE_ID="$release_id" \
  APP_ASSET_DIR="$app_root/shared-assets" node scripts/probe-release.cjs > "$release/probe.log" 2>&1 &
probe_pid=$!
healthy=0
for (( attempt=0; attempt<30; attempt++ )); do
  kill -0 "$probe_pid" 2>/dev/null || break
  if node scripts/verify-release.cjs "http://127.0.0.1:$probe_port/api/health" "$release_id" 2>/dev/null; then
    healthy=1
    break
  fi
  sleep 1
done
(( healthy == 1 )) || { echo "Healthcheck falhou; consulte $release/probe.log" >&2; exit 1; }
kill -TERM "$probe_pid"
wait "$probe_pid"
probe_pid=''

# Reject an incompatible/degraded existing PM2 cluster before switching current.
check_existing_cluster

for tool in reload-app.sh check-app-processes.cjs verify-release.cjs; do
  cp "scripts/$tool" "$app_root/deploy-tools/$tool.tmp"
  mv -f "$app_root/deploy-tools/$tool.tmp" "$app_root/deploy-tools/$tool"
done
if (( legacy_migration == 1 )) && [[ -f $app_root/ecosystem.config.cjs ]]; then
  cp -p "$app_root/ecosystem.config.cjs" "$release/previous-ecosystem.config.cjs"
fi
cp ecosystem.config.cjs "$app_root/ecosystem.config.cjs.tmp"
mv -f "$app_root/ecosystem.config.cjs.tmp" "$app_root/ecosystem.config.cjs"
ln -s "$release" "$app_root/.current-$release_id"
mv -Tf "$app_root/.current-$release_id" "$app_root/current"
switched=1
if (( legacy_migration == 1 )); then
  node scripts/migrate-legacy-app.cjs "$app_root" "$previous_release"
else
  PLAY_INFINITY_LOCK_HELD=1 bash "$app_root/deploy-tools/reload-app.sh" "$app_root"
fi
echo "Deploy verificado: $release_id. Versões anteriores e conexões em drenagem preservadas."
