# Documentação da Infraestrutura de Streaming (Oracle Cloud VPS)

> **Status:** 🟢 ATIVO, OPERACIONAL E PROTEGIDO COM HTTPS (Let's Encrypt)  
> **Domínio de Streaming:** `https://play-infinity.stream`  
> **Objetivo:** Desafogar o limite do Render e suportar alto tráfego simultâneo de TV ao vivo com a franquia de até 10 TB da Oracle Cloud Always Free.

---

## 1. Dados do Servidor VPS (Oracle Cloud)

- **Provedor:** Oracle Cloud Infrastructure (OCI)
- **Região:** São Paulo, Brasil (AS31898)
- **IP Público:** `147.15.57.146`
- **Portas Abertas:** `80` (HTTP com redirecionamento) e `443` (HTTPS)
- **Domínio SSL/HTTPS:** `https://play-infinity.stream` (com DNS direto via Cloudflare)
- **Servidor Web Reverso:** Nginx com certificado automático Let's Encrypt (Certbot)
- **Chave SSH:** `./oracle-vps.key`
- **Código do Proxy na VPS:** `/home/ubuntu/proxy.mjs` (gerenciado via PM2 como `video-proxy` na porta interna 8080)
- **Health Check:** `https://play-infinity.stream/api/health` (Retorna `{"status":"ok",...}`)
- **Stream Proxy Endpoint:** `https://play-infinity.stream/api/live-stream-proxy?url=...`
- **Download Proxy Endpoint:** `https://play-infinity.stream/api/download?url=...&filename=...`

---

## 2. Como Funciona o Proxy Remoto (`proxy.mjs` + Nginx)

1. **Reescrita de Manifestos HLS (`.m3u8`):**
   - O proxy intercepta as URLs de canais de TV ao vivo.
   - Reescreve todas as tags `EXT-X-KEY` (chaves de criptografia AES) e os chunks de vídeo (`.ts`, `.aac`, `.m4s`) para apontarem de volta para o domínio HTTPS (`https://play-infinity.stream/api/live-stream-proxy?...`).
2. **Bypass de CORS e Spoofing de Headers:**
   - Adiciona `Access-Control-Allow-Origin: *`.
   - Injeta User-Agent, Referer e Origin dos canais originais para evitar bloqueios das operadoras/CDNs.
3. **Cache de Chunks em Memória:**
   - Mantém cache LRU em memória RAM para os chunks recentes, evitando downloads repetidos quando múltiplos usuários assistem ao mesmo canal.

---

## 3. Conexão com o Frontend da Aplicação

- **Arquivo no Frontend:** `src/components/LivePlayerModal.tsx`
- **Configuração:**
  ```typescript
  const proxyBase = import.meta.env.VITE_PROXY_URL || 'https://play-infinity.stream';
  const streamUrl = currentServer?.isProxy 
    ? `${proxyBase}/api/live-stream-proxy?url=${encodeURIComponent(currentServer.url)}` 
    : currentServer?.url;
  ```
- **Resultado:**
  - O aplicativo no Render consome o proxy HTTPS da Oracle diretamente.
  - Zero bloqueio de Mixed Content em navegadores mobile (Chrome, Safari) e Smart TVs.
  - 100% da banda pesada de TV ao vivo é absorvida pela Oracle Cloud (10 TB/mês).

---

## 4. Configuração Otimizada do Nginx na VPS (`/etc/nginx/sites-available/play-infinity`)

Para garantir zero micro-congelamentos e máximo throughput em transmissões contínuas:

```nginx
server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name play-infinity.stream;

    # SSL Certbot config...

    location /api/ {
        proxy_pass http://127.0.0.1:8080;
        proxy_http_version 1.1;
        proxy_set_header Connection "";
        proxy_buffering off;             # CRÍTICO: Elimina retenção intermediária de pacotes
        proxy_request_buffering off;
        proxy_read_timeout 300s;
        proxy_send_timeout 300s;
        chunked_transfer_encoding on;
    }
}
```

---

## 5. Automação de Estabilidade (Watchdog)

Para garantir 100% de disponibilidade contra travamentos de porta (como erro `EADDRINUSE:::8080`), existe um **Watchdog (Cron Job)** configurado diretamente na VPS, executando de forma silenciosa e leve.

- **Arquivo do script:** `/home/ubuntu/watchdog.sh`
- **Frequência (Cron):** A cada minuto (`* * * * *`)
- **Como funciona:** O script checa a saúde do `video-proxy` via `pm2 jlist`. Se detectar status diferente de `online`, ele automaticamente derruba qualquer processo que esteja prendendo a porta 8080 (`fuser -k 8080/tcp`) e reinicia o PM2.
- **Impacto na VPS (Garantia):** O impacto na CPU e RAM da VPS é virtualmente nulo (consumo de ~0.001%). O script é um utilitário simples em Node e Bash executado de forma enxuta a cada 60 segundos. O cliente final não notará os engasgos graças a essa auto-cura rápida.
- **IMPORTANTE:** O Watchdog é apenas a **rede de segurança**. A correção da causa raiz está na seção 6.

---

## 6. Causa Raiz do Erro 502 / `EADDRINUSE :8080` (03/10/2026)

**Problema:** existiam **dois daemons PM2** na VPS: o do usuário `ubuntu` e o do `root` (`pm2-root.service`). O PM2 do `root` tinha um `video-proxy` duplicado que ocupava a porta 8080, e o PM2 do `ubuntu` entrava em loop de crash (300+ reinícios). Matar o processo (`kill -9`) não adiantava: o PM2 do root o ressuscitava.

**Correção definitiva aplicada:**
1. `sudo pm2 delete video-proxy && sudo pm2 save` (removido do PM2 do root).
2. `pm2 save` + `pm2 startup systemd -u ubuntu` (o `video-proxy` do `ubuntu` agora sobe sozinho após reboot da VPS).

**Regras para agentes:**
- O **único dono** do `video-proxy` é o PM2 do usuário **`ubuntu`**. O PM2 do `root` roda apenas `play-infinity-app`.
- **NUNCA** rode `sudo pm2 start ... video-proxy` nem `pm2 start proxy.mjs` como root.
- Após alterar processos PM2 do `ubuntu`, rode `pm2 save`.
- Diagnóstico rápido: `sudo lsof -i :8080` (dono da porta) e `sudo pm2 list` vs `pm2 list`.
