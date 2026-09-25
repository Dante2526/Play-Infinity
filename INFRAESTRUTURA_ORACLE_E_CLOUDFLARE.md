# 🚀 Infraestrutura Play Infinity: Migração para Oracle VPS & Configuração de DNS na Cloudflare

Este documento consolida toda a arquitetura atual do **Play Infinity**, detalhando a transição da infraestrutura para a **VPS Dedicada da Oracle Cloud (Always Free)**, todas as otimizações implementadas e o **guia passo a passo para configuração de DNS na Cloudflare**.

---

## 📌 1. Por que migramos para a VPS da Oracle Cloud?

1. **Fim dos limites de banda:** O Render possui franquia restrita de 100 GB/mês, que se esgotava rapidamente com transmissões de TV ao vivo em alta definição. A Oracle Cloud fornece até **10 TB/mês de transferência de saída gratuita**.
2. **Desempenho e baixa latência:** Servidor alocado na região de **São Paulo (Brasil)**, garantindo latência ultra-baixa para o público brasileiro.
3. **Controle total do Servidor:** Acesso root via SSH com proxy reverso Nginx tunado para streaming contínuo sem buffer e gerenciamento de processos via PM2.

---

## 🖥️ 2. Dados do Servidor VPS (Oracle Cloud Infrastructure)

| Parâmetro | Valor / Configuração |
| :--- | :--- |
| **Provedor** | Oracle Cloud Infrastructure (OCI) |
| **Região** | São Paulo, Brasil (`sa-saopaulo-1` / AS31898) |
| **IP Público IPv4** | `147.15.57.146` |
| **Portas Abertas** | `80` (HTTP), `443` (HTTPS) |
| **Chave de Acesso SSH** | `oracle-vps.key` |
| **Processo PM2** | `video-proxy` rodando em `127.0.0.1:8080` |
| **Arquivo do Proxy na VPS** | `/home/ubuntu/proxy.mjs` |
| **Endpoints Ativos** | • Health Check: `/api/health`<br>• Stream HLS: `/api/live-stream-proxy?url=...`<br>• Download: `/api/download?url=...` |

---

## ⚙️ 3. Tudo o que foi Feito e Otimizado no Sistema

### A. Proxy de Streaming HLS em Tempo Real (`proxy.mjs`)
- **Reescrita Dinâmica de `.m3u8`:** Converte automaticamente URLs internas, chaves de criptografia (`EXT-X-KEY`) e fragmentos de vídeo (`.ts`, `.aac`, `.m4s`) para trafegarem de forma segura via HTTPS.
- **Bypass de CORS e Spoofing de Headers:** Injeta cabeçalhos `Access-Control-Allow-Origin: *`, `Referer` e `User-Agent` compatíveis com os provedores originais de transmissão para evitar bloqueios das operadoras/CDNs.
- **Cache LRU de Chunks em RAM:** Segmentos de vídeo assistidos simultaneamente por múltiplos usuários são cacheados na memória da VPS, evitando requisições duplicadas à fonte e acelerando o carregamento.

### B. Otimização Avançada do Nginx (`/etc/nginx/sites-available/play-infinity`)
- **Desativação de Buffering Intermediário:**
  ```nginx
  proxy_buffering off;
  proxy_request_buffering off;
  chunked_transfer_encoding on;
  ```
  *(Elimina pausas e micro-travamentos na reprodução de transmissões ao vivo).*
- **Timeouts estendidos (300s):** Previne desconexões prematuras durante trocas de canais ou instabilidades de rede do usuário.

### C. Limpeza e Isolamento de Ambiente de Produção
- Remoção de elementos visuais de depuração/teste da interface pública.
- Blindagem da detecção de ambiente em `src/utils/envUtils.ts` para que domínios oficiais (ex: `play-infinity.stream`) operem sempre no modo 100% de produção.

---

## 🌐 4. Como Configurar o DNS na Cloudflare (Passo a Passo)

Para apontar seu domínio próprio (ex: `play-infinity.stream` ou um subdomínio específico para streaming como `stream.play-infinity.stream`) para a VPS da Oracle através da Cloudflare:

### Passo 1: Acesse a sua conta na Cloudflare
1. Entre em [dash.cloudflare.com](https://dash.cloudflare.com).
2. Selecione o seu domínio (ex: `play-infinity.stream`).
3. No menu lateral esquerdo, clique em **DNS** > **Records** (Registros).

---

### Passo 2: Criar/Editar os Registros DNS (Tipo A)

#### Opção A: Apontar o subdomínio exclusivo de streaming (Recomendado)
* **Type (Tipo):** `A`
* **Name (Nome):** `stream` *(ou `proxy`)*
* **IPv4 address:** `147.15.57.146`
* **Proxy status:** 
  * 🟠 **Proxied (Nuvem Laranja):** Oferece proteção DDoS e SSL automático da Cloudflare.
  * ⚠️ *Nota sobre Streaming:* Se for usar a nuvem laranja da Cloudflare para chunks de vídeo, certifique-se de desabilitar o cache de HTML para a rota `/api/live-stream-proxy*` em **Rules/Cache Rules**.
* **TTL:** `Auto`

#### Opção B: Apontar o domínio principal / raiz
* **Type (Tipo):** `A`
* **Name (Nome):** `@` *(ou `play-infinity.stream`)*
* **IPv4 address:** `147.15.57.146`
* **Proxy status:** 🟠 **Proxied** (ou ⚪ **DNS Only**, se o Nginx da VPS estiver cuidando diretamente do certificado SSL).

---

### Passo 3: Configuração de SSL/TLS na Cloudflare
1. No menu lateral, acerte em **SSL/TLS** > **Overview**.
2. Selecione o modo de criptografia:
   * **Full (Strict)** ou **Full**: Recomendado, pois a VPS já possui certificado SSL ativo (Let's Encrypt / Certbot).
3. Em **SSL/TLS** > **Edge Certificates**:
   * Ative **Always Use HTTPS** (Sempre usar HTTPS).
   * Ative **Automatic HTTPS Rewrites**.

---

### Passo 4: Ajuste de Cache para Transmissões ao Vivo (Cache Rules)
Transmissões ao vivo HLS geram novos manifestos `.m3u8` a cada 2 segundos. Para evitar que a Cloudflare guarde cache antigo do vídeo:
1. Vá em **Caching** > **Cache Rules** > **Create Rule**.
2. **Rule name:** `Bypass Cache Streaming Ao Vivo`
3. **When incoming requests match:**
   * Field: `URI Path`
   * Operator: `starts with`
   * Value: `/api/live-stream-proxy`
4. **Then (Cache eligibility):**
   * Selecione: **Bypass cache** (Não fazer cache).
5. Clique em **Deploy**.

---

## 🔍 5. Como Testar e Validar a Conexão

Após salvar as configurações no DNS da Cloudflare:

1. **Teste de Health via Terminal:**
   ```bash
   curl -I https://seu-dominio.com/api/health
   # Deve retornar HTTP 200 OK
   ```
2. **Verificar Status dos Processos na VPS:**
   ```bash
   ssh -i oracle-vps.key ubuntu@147.15.57.146
   pm2 status
   pm2 logs video-proxy --lines 50
   ```
3. **Verificar Logs do Nginx:**
   ```bash
   sudo tail -f /var/log/nginx/access.log
   ```

---

*Documento gerado e atualizado para a versão de produção do Play Infinity.*
