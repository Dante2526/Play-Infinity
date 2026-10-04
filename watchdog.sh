#!/bin/bash
# Watchdog for video-proxy
# Trava de execucao (flock) e log
exec 1>>/home/ubuntu/watchdog.log 2>&1
exec 200>/tmp/video_proxy_watchdog.lock
flock -n 200 || exit 1

# Garante PATH minimo
export PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin:/snap/bin:$HOME/.nvm/versions/node/v20.12.2/bin:$HOME/.npm-global/bin
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"

# So roda como ubuntu
if [ "$(whoami)" != "ubuntu" ]; then
    echo "$(date): Erro - O script deve ser rodado com o usuario ubuntu"
    exit 1
fi

# Verifica a saude real pelo endpoint (mínimo 5 segundos de timeout)
if curl -fsS -m 5 http://127.0.0.1:8080/api/health > /dev/null 2>&1; then
    # Tudo online
    exit 0
fi

echo "$(date): Health check falhou (ou porta offline). Tentando recuperar..."

# Verifica se o pm2 conhece o video-proxy
if pm2 jlist | grep -q '"name":"video-proxy"'; then
    echo "$(date): O video-proxy existe no PM2 do ubuntu, reiniciando..."
    # Se ja existe no pm2, so tenta reiniciar. Se estiver travado, o pm2 mata e sobe.
    pm2 restart video-proxy
else
    echo "$(date): O video-proxy nao esta na lista do PM2. Iniciando do zero..."
    # Mata porta 8080 caso esteja zumbi (somente se formos ligar do zero)
    fuser -k 8080/tcp
    sleep 2
    # Inicia o proxy
    pm2 start /home/ubuntu/proxy.mjs --name video-proxy
fi

# Aguarda subir e checa novamente
sleep 5
if curl -fsS -m 5 http://127.0.0.1:8080/api/health > /dev/null 2>&1; then
    echo "$(date): Recuperado com sucesso!"
else
    echo "$(date): Falha persistente apos tentativa de recuperacao."
fi
