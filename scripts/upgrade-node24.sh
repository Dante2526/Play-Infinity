#!/usr/bin/env bash
# Explicit maintenance: replace only the root application daemon's runtime.
# Keep the system Node and the independent ubuntu/video-proxy daemon intact.
set -Eeuo pipefail
archive=${1:?Informe o arquivo oficial do Node}
checksum=${2:?Informe SHA-256}
version=${3:?Informe a versão fixada}
app_root=${4:-/home/ubuntu/play-infinity}
[[ $version =~ ^24\.[0-9]+\.[0-9]+$ && $checksum =~ ^[a-f0-9]{64}$ ]] || exit 1
[[ ${PLAY_INFINITY_UPGRADE_NODE24:-0} == 1 ]] || { echo 'Atualização requer opção explícita de manutenção.' >&2; exit 1; }
app_root=$(cd "$app_root" && pwd -P)
[[ ! -e $app_root/node-runtime || -L $app_root/node-runtime ]] || { echo 'node-runtime deve ser um symlink gerenciado.' >&2; exit 1; }
exec 9>"$app_root/.deploy.lock"
flock -x 9
release=$(readlink -f "$app_root/current")
test -f "$release/dist/server.cjs"
expected=$(basename "$release")
pm2_cli=$(readlink -f "$(command -v pm2)")
pm2_home=${PM2_HOME:-/root/.pm2}
daemon_pid=$(cat "$pm2_home/pm2.pid")
old_node=$(readlink -f "/proc/$daemon_pid/exe")
test -x "$old_node"
systemctl is-active --quiet pm2-root.service
[[ $(systemctl show pm2-root.service -p MainPID --value) == "$daemon_pid" ]] || { echo 'O serviço root não corresponde ao daemon da aplicação.' >&2; exit 1; }
service_user=$(systemctl show pm2-root.service -p User --value)
[[ -z $service_user || $service_user == root ]] || exit 1
pm2 jlist | "$old_node" -e '
  let s=""; process.stdin.on("data",d=>s+=d); process.stdin.on("end",()=>{
    try { const a=JSON.parse(s); if(a.length!==2 || a.some(p=>p.name!=="play-infinity-app" || p.pm2_env.exec_mode!=="cluster_mode" || p.pm2_env.status!=="online")) throw 0; }
    catch { console.error("Manutenção recusada: o daemon root deve conter somente as duas instâncias saudáveis da aplicação."); process.exit(1); }
  });'
pm2 jlist | "$old_node" "$release/scripts/check-app-processes.cjs" "$expected"

runtime_root=${PLAY_INFINITY_NODE_ROOT:-/opt/play-infinity/node}
dropin_root=${PLAY_INFINITY_SYSTEMD_DIR:-/etc/systemd/system/pm2-root.service.d}
mkdir -p "$runtime_root" "$dropin_root"
work=$(mktemp -d "$runtime_root/.upgrade-XXXXXXXX")
chmod 700 "$work"
candidate="$runtime_root/v$version"
dropin="$dropin_root/90-play-infinity-node.conf"
had_dropin=0
if [[ -f $dropin ]]; then cp -p "$dropin" "$work/old-dropin"; had_dropin=1; fi
previous_runtime=''
if [[ -L $app_root/node-runtime ]]; then previous_runtime=$(readlink "$app_root/node-runtime"); fi
probe_pid=''
changed=0
completed=0
check_runtime() {
  local node_path=$1
  local actual_pid
  actual_pid=$(cat "$pm2_home/pm2.pid")
  [[ $(readlink -f "/proc/$actual_pid/exe") == "$(readlink -f "$node_path")" ]] || return 1
  "$node_path" "$pm2_cli" jlist | "$node_path" "$release/scripts/check-app-processes.cjs" "$expected" || return 1
  "$node_path" "$pm2_cli" jlist | "$node_path" -e '
    let s=""; process.stdin.on("data",d=>s+=d); process.stdin.on("end",()=>{
      try { const major=process.versions.node.split(".")[0]; if(JSON.parse(s).some(p=>String(p.pm2_env.node_version).split(".")[0]!==major)) throw 0; }
      catch { console.error("Workers não confirmaram a versão de Node do daemon."); process.exit(1); }
    });' || return 1
  "$node_path" "$release/scripts/verify-release.cjs" "http://127.0.0.1:${PLAY_INFINITY_PORT:-3000}/api/health" "$expected"
}
wait_runtime() {
  for (( check=0; check<40; check++ )); do
    if check_runtime "$1" > "$work/check.log" 2>&1; then return 0; fi
    sleep 0.25
  done
  echo 'Daemon, workers ou healthcheck não confirmaram o runtime esperado.' >&2
  return 1
}
cleanup() {
  result=$?
  if [[ -n $probe_pid ]]; then kill -TERM "$probe_pid" 2>/dev/null || true; wait "$probe_pid" 2>/dev/null || true; fi
  if (( changed == 1 && completed == 0 )); then
    echo 'Atualização falhou; restaurando o runtime e o serviço anteriores.' >&2
    if (( had_dropin == 1 )); then cp -p "$work/old-dropin" "$dropin"; else rm -f "$dropin"; fi
    if [[ -n $previous_runtime ]]; then
      ln -s "$previous_runtime" "$app_root/.node-runtime-restore"
      mv -Tf "$app_root/.node-runtime-restore" "$app_root/node-runtime"
    else rm -f "$app_root/node-runtime"; fi
    systemctl daemon-reload || true
    # Stop first: ExecStop/pm2 kill may replace dump.pm2. Restore afterwards.
    systemctl stop pm2-root.service || true
    cp -p "$work/dump.pm2" "$pm2_home/dump.pm2"
    if systemctl start pm2-root.service && wait_runtime "$old_node"; then
      echo 'Node anterior e aplicação recuperados e verificados.' >&2
    else
      echo 'Recuperação automática não confirmada; intervenção na VPS necessária.' >&2
    fi
  fi
  rm -rf "$work"
  exit "$result"
}
trap cleanup EXIT

printf '%s  %s\n' "$checksum" "$archive" | sha256sum -c -
if [[ ! -d $candidate ]]; then
  mkdir "$work/runtime"
  tar -xJf "$archive" --strip-components=1 -C "$work/runtime"
  [[ $("$work/runtime/bin/node" -p 'process.versions.node') == "$version" ]]
  mv "$work/runtime" "$candidate"
fi
new_node="$candidate/bin/node"
[[ $("$new_node" -p 'process.versions.node') == "$version" ]]
"$new_node" "$candidate/lib/node_modules/npm/bin/npm-cli.js" --version
if [[ -L $app_root/node-runtime && $(readlink -f "$app_root/node-runtime") == "$candidate" && -f $dropin ]] && check_runtime "$new_node"; then
  echo "Node $version já ativo e verificado; nenhum reinício necessário."
  exit 0
fi

# Probe the actual installed release/dependencies under Node 24 before any stop.
cd "$release"
probe_port=${PLAY_INFINITY_PROBE_PORT:-3100}
pm2 jlist | APP_PROBE=1 APP_BIND_HOST=127.0.0.1 NODE_ENV=production PORT="$probe_port" \
  APP_RELEASE_ID="$expected" APP_ASSET_DIR="$app_root/shared-assets" \
  "$new_node" scripts/probe-release.cjs > "$work/probe.log" 2>&1 &
probe_pid=$!
healthy=0
for (( attempt=0; attempt<30; attempt++ )); do
  kill -0 "$probe_pid" 2>/dev/null || break
  if "$new_node" scripts/verify-release.cjs "http://127.0.0.1:$probe_port/api/health" "$expected" 2>/dev/null; then healthy=1; break; fi
  sleep 1
done
(( healthy == 1 )) || { echo 'Bundle atual não passou na prova com Node 24; daemon ativo preservado.' >&2; exit 1; }
kill -TERM "$probe_pid"
wait "$probe_pid"
probe_pid=''

pm2 save
cp -p "$pm2_home/dump.pm2" "$work/dump.pm2"
# Private directories prevent accidental access to the normal PM2 credentials.
chmod 600 "$work/dump.pm2"
cat > "$work/new-dropin" <<EOF
[Service]
Environment="PATH=$candidate/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"
Environment="PM2_HOME=$pm2_home"
ExecStart=
ExecStart=$new_node $pm2_cli resurrect
EOF
changed=1
install -m 644 "$work/new-dropin" "$dropin"
systemctl daemon-reload
echo 'Manutenção: reiniciando somente pm2-root.service com Node 24.'
systemctl restart pm2-root.service
wait_runtime "$new_node"
ln -s "$candidate" "$app_root/.node-runtime-new"
mv -Tf "$app_root/.node-runtime-new" "$app_root/node-runtime"
completed=1
echo "Node $version confirmado no daemon e nas duas instâncias; healthcheck da versão $expected aprovado."
