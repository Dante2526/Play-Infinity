# Documentação da Infraestrutura de Streaming (Oracle Cloud VPS)

> **Status:** 🟢 ATIVO, OPERACIONAL E PROTEGIDO COM HTTPS (Let's Encrypt)  
> **Domínio de Streaming:** `https://play-infinity-app.duckdns.org`  
> **Objetivo:** Desafogar o limite de 100 GB/mês do Render e suportar alto tráfego simultâneo de TV ao vivo com a franquia de até 10 TB da Oracle Cloud Always Free.

---

## 1. Dados do Servidor VPS (Oracle Cloud)

- **Provedor:** Oracle Cloud Infrastructure (OCI)
- **Região:** São Paulo, Brasil (AS31898)
- **IP Público:** `147.15.57.146`
- **Portas Abertas:** `80` (HTTP com redirecionamento) e `443` (HTTPS)
- **Domínio SSL/HTTPS:** `https://play-infinity-app.duckdns.org`
- **Servidor Web Reverso:** Nginx com certificado automático Let's Encrypt (Certbot)
- **Chave SSH:** `./oracle-vps.key`
- **Código do Proxy na VPS:** `/home/ubuntu/proxy.mjs` (gerenciado via PM2 como `video-proxy` na porta interna 8080)
- **Health Check:** `https://play-infinity-app.duckdns.org/api/health` (Retorna `{"status":"ok",...}`)
- **Stream Proxy Endpoint:** `https://play-infinity-app.duckdns.org/api/live-stream-proxy?url=...`
- **Download Proxy Endpoint:** `https://play-infinity-app.duckdns.org/api/download?url=...&filename=...`

---

## 2. Como Funciona o Proxy Remoto (`proxy.mjs` + Nginx)

1. **Reescrita de Manifestos HLS (`.m3u8`):**
   - O proxy intercepta as URLs de canais de TV ao vivo.
   - Reescreve todas as tags `EXT-X-KEY` (chaves de criptografia AES) e os chunks de vídeo (`.ts`, `.aac`, `.m4s`) para apontarem de volta para o domínio HTTPS (`https://play-infinity-app.duckdns.org/api/live-stream-proxy?...`).
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
  const proxyBase = import.meta.env.VITE_PROXY_URL || 'https://play-infinity-app.duckdns.org';
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
    server_name play-infinity-app.duckdns.org;

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

