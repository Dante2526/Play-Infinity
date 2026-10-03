#!/bin/bash
# Watchdog for video-proxy

# Use node to parse JSON safely
STATUS=$(pm2 jlist | node -e "
let data = '';
process.stdin.on('data', chunk => data += chunk);
process.stdin.on('end', () => {
    try {
        const list = JSON.parse(data);
        const proxy = list.find(item => item.name === 'video-proxy');
        if (proxy && proxy.pm2_env) {
            console.log(proxy.pm2_env.status);
        } else {
            console.log('not_found');
        }
    } catch(e) {
        console.log('error');
    }
});
")

if [ "$STATUS" != "online" ]; then
    echo "$(date): Proxy is down (Status: $STATUS). Killing port 8080 and restarting..."
    # Force kill any process on 8080
    sudo fuser -k 8080/tcp
    sleep 1
    pm2 restart video-proxy
fi
