import { Router } from "express";
import { isPrivateOrLocalHost } from "../utils/helpers";

const router = Router();

// Cache de tokens por 1 hora (tokens Xtream duram mais que isso, mas refresh preventivo)
let cachedToken: { url: string; expires: number } | null = null;

async function getFreshXtreamToken(): Promise<string> {
  if (cachedToken && cachedToken.expires > Date.now()) {
    return cachedToken.url;
  }
  const user = process.env.XTREAM_USER || "351921603109";
  const pass = process.env.XTREAM_PASS || "34939156";
  const host = process.env.XTREAM_HOST || "http://up.kiwi";

  if (!user || !pass || !host) {
    throw new Error("Credenciais Xtream não configuradas no .env e fallbacks falharam");
  }

  // Faz autenticacao Xtream Codes — recebe player_api
  const authUrl = `${host}/player_api.php?username=${user}&password=${pass}`;
  const res = await fetch(authUrl);
  const data = await res.json();

  if (!data?.user_info?.auth) {
    throw new Error("Credenciais Xtream invalidas");
  }

  // Constrói URL mestre com formato correto por provedor:
  // - up.kiwi usa formato não-padrão:  http://up.kiwi/USER/PASS/CANAL.m3u8
  // - provedores Xtream padrão usam:    http://host/live/USER/PASS/CANAL.m3u8
  // Testado empiricamente: o formato /live/ retorna Xtream 404 no up.kiwi.
  const isUpKiwi = host.includes("up.kiwi");
  const base = isUpKiwi
    ? `${host}/${user}/${pass}`
    : `${host}/live/${user}/${pass}`;

  cachedToken = {
    url: base,
    expires: Date.now() + 3600 * 1000 // refresh a cada 1h
  };
  return base;
}

// GET /api/iptv/:channelId -> devolve m3u8 com token fresco
router.get("/api/iptv/:channelId", async (req, res) => {
  try {
    const channelId = req.params.channelId;
    const base = await getFreshXtreamToken();

    // Constrói a URL fresca
    const streamUrl = `${base}/${channelId}.m3u8`;

    // Força o protocolo correto no redirect absoluto para evitar que o Express herde HTTPS via proxy local
    const protocol = process.env.NODE_ENV === "production" ? "https" : "http";
    const host = req.get("host") || "localhost:3000";
    res.redirect(`${protocol}://${host}/api/live-stream-proxy?url=${encodeURIComponent(streamUrl)}`);
  } catch (e: any) {
    res.status(500).send("Erro obtendo token Xtream: " + e.message);
  }
});

  router.post("/api/parse-m3u-playlist", async (req, res) => {
    try {
      let { url, content } = req.body || {};
      if (!url && !content) {
        return res.status(400).json({ success: false, error: "Informe a URL ou o texto da lista M3U." });
      }

      let m3uText = content || "";

      if (url) {
        let fetchUrl = String(url).trim();
        // Converte links do GitHub blob / raw automaticamente para o link direto raw.githubusercontent.com
        if (fetchUrl.includes("github.com")) {
          if (fetchUrl.includes("/blob/")) {
            fetchUrl = fetchUrl.replace("github.com", "raw.githubusercontent.com").replace("/blob/", "/");
          } else if (fetchUrl.includes("/raw/")) {
            fetchUrl = fetchUrl.replace("github.com", "raw.githubusercontent.com").replace("/raw/", "/");
          } else if (!fetchUrl.endsWith(".m3u") && !fetchUrl.endsWith(".m3u8") && !fetchUrl.endsWith(".txt")) {
            // Se for o link raiz de um repositório como github.com/owner/repo
            const repoMatch = fetchUrl.match(/github\.com\/([^\/]+)\/([^\/\?#]+)/);
            if (repoMatch) {
              const owner = repoMatch[1];
              const repo = repoMatch[2];
              // Tenta carregar o arquivo CanaisBR01.m3u8 ou index.m3u8
              fetchUrl = `https://raw.githubusercontent.com/${owner}/${repo}/master/CanaisBR01.m3u8`;
            }
          }
        }

        let parsedUrl;
        try {
          parsedUrl = new URL(fetchUrl);
        } catch {
          return res.status(400).json({ success: false, error: "Formato de URL inválido." });
        }

        if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
          return res.status(403).json({ success: false, error: "Protocolo não permitido." });
        }

        if (await isPrivateOrLocalHost(parsedUrl.hostname)) {
          return res.status(403).json({ success: false, error: "Acesso a endereços locais/privados bloqueado por segurança (Anti-SSRF)." });
        }

        // SSRF protection: allow M3U playlists, TXT files or trusted repositories
        const pathname = parsedUrl.pathname.toLowerCase();
        const isTrustedHost = parsedUrl.hostname.includes("githubusercontent.com") || 
                              parsedUrl.hostname.includes("github.com") || 
                              parsedUrl.hostname.includes("pastebin.com") ||
                              parsedUrl.hostname.includes("gitlab.com");
        if (!pathname.endsWith(".m3u") && !pathname.endsWith(".m3u8") && !pathname.endsWith(".txt") && !isTrustedHost) {
          return res.status(403).json({ success: false, error: "URL não aponta para um formato de lista suportado (.m3u, .m3u8, .txt) ou provedor compatível." });
        }

        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 10000);
        let resp = await fetch(fetchUrl, {
          signal: controller.signal,
          headers: {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
            "Accept": "*/*"
          }
        });
        clearTimeout(timeout);

        // Se falhou com 'master', tenta com 'main' se for GitHub
        if (!resp.ok && fetchUrl.includes("raw.githubusercontent.com") && fetchUrl.includes("/master/")) {
          const fallbackUrl = fetchUrl.replace("/master/", "/main/");
          try {
            const fbController = new AbortController();
            const fbTimeout = setTimeout(() => fbController.abort(), 8000);
            const fbResp = await fetch(fallbackUrl, {
              signal: fbController.signal,
              headers: { "User-Agent": "Mozilla/5.0", "Accept": "*/*" }
            });
            clearTimeout(fbTimeout);
            if (fbResp.ok) {
              resp = fbResp;
            }
          } catch {}
        }

        if (!resp.ok) {
          return res.status(400).json({ success: false, error: `Não foi possível carregar a lista (HTTP ${resp.status}). Verifique se o link está público ou use a opção 'Anexar Arquivo'.` });
        }
        
        // Limita tamanho da resposta para evitar DoS via M3U gigante (máximo 5MB)
        const contentLength = parseInt(resp.headers.get("content-length") || "0", 10);
        if (contentLength > 5 * 1024 * 1024) {
          return res.status(413).json({ success: false, error: "A lista M3U excede o tamanho máximo permitido de 5MB." });
        }

        m3uText = await resp.text();
      }

      if (!m3uText || typeof m3uText !== "string") {
        return res.status(400).json({ success: false, error: "Conteúdo da lista vazio ou inválido." });
      }

      const trimmedText = m3uText.trim();
      if (trimmedText.startsWith("<!DOCTYPE") || trimmedText.startsWith("<html") || trimmedText.startsWith("<!doctype")) {
        return res.status(400).json({ 
          success: false, 
          error: "O link informado retornou uma página web (HTML) e não o arquivo de texto M3U. No GitHub, clique no botão 'Raw' para obter o link direto, ou baixe o arquivo .m3u8 e use a opção 'Anexar Arquivo'." 
        });
      }

      // Parser robusto de M3U
      const lines = m3uText.split(/\r?\n/);
      const parsedChannels: any[] = [];
      let currentInfo: any = null;

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;

        if (line.startsWith("#EXTINF:")) {
          const nameMatch = line.match(/,(.+)$/);
          const name = nameMatch ? nameMatch[1].trim() : "Canal " + (parsedChannels.length + 1);
          const logoMatch = line.match(/tvg-logo="([^"]+)"/);
          const groupMatch = line.match(/group-title="([^"]+)"/);

          const group = (groupMatch ? groupMatch[1] : "").toLowerCase();
          const nameLower = name.toLowerCase();

          // Determina categoria inteligente
          let category = "Variedades";
          if (group.includes("sport") || group.includes("esporte") || nameLower.includes("premiere") || nameLower.includes("sport") || nameLower.includes("espn") || nameLower.includes("futebol") || nameLower.includes("combate") || nameLower.includes("dazn")) {
            category = "Esportes";
          } else if (group.includes("aberta") || group.includes("aberto") || nameLower.includes("globo") || nameLower.includes("sbt") || nameLower.includes("record") || nameLower.includes("band") || nameLower.includes("redetv") || nameLower.includes("cultura")) {
            category = "TV Aberta";
          } else if (group.includes("news") || group.includes("noticia") || nameLower.includes("jornal") || nameLower.includes("cnn") || nameLower.includes("globonews") || nameLower.includes("record news")) {
            category = "Notícias";
          } else if (group.includes("filme") || group.includes("cinema") || group.includes("serie") || nameLower.includes("telecine") || nameLower.includes("hbo") || nameLower.includes("megapix") || nameLower.includes("warner") || nameLower.includes("paramount") || nameLower.includes("universal")) {
            category = "Filmes & Séries";
          } else if (group.includes("infantil") || group.includes("kids") || group.includes("anime") || group.includes("desenho") || nameLower.includes("cartoon") || nameLower.includes("disney") || nameLower.includes("nickelodeon") || nameLower.includes("gloob")) {
            category = "Infantil";
          }

          currentInfo = {
            name,
            category,
            logo: logoMatch ? logoMatch[1] : "",
            quality: nameLower.includes("1080") || nameLower.includes("fhd") ? "1080p" : (nameLower.includes("720") || nameLower.includes("hd") ? "720p" : "HD")
          };
        } else if ((line.startsWith("http://") || line.startsWith("https://")) && currentInfo) {
          const id = "custom-" + Math.random().toString(36).substring(2, 9) + "-" + Date.now().toString(36);
          parsedChannels.push({
            id,
            name: currentInfo.name,
            category: currentInfo.category,
            quality: currentInfo.quality,
            logo: currentInfo.logo || "https://images.unsplash.com/photo-1593784991095-a205069470b6?w=320&auto=format&fit=crop&q=80",
            currentProgram: "Transmissão Ao Vivo • " + currentInfo.name,
            isCustom: true,
            servers: [
              {
                name: "Servidor Proxy Play Infinity (Recomendado)",
                url: line,
                isProxy: true
              },
              {
                name: "Servidor Direto",
                url: line,
                isProxy: false
              }
            ]
          });
          currentInfo = null;
        }
      }

      // Estatísticas das categorias
      const categoryCounts: Record<string, number> = {};
      parsedChannels.forEach(c => {
        categoryCounts[c.category] = (categoryCounts[c.category] || 0) + 1;
      });

      // Validação rápida: por padrão não bloqueia a resposta testando centenas de links (validateStreams = false)
      const validateStreams = req.body?.validateStreams === true; // padrão: false para resposta instantânea
      let onlineCount = 0;
      let offlineCount = 0;

      if (validateStreams && parsedChannels.length > 0) {
        // Testa canais em lotes paralelos para rapidez
        const BATCH_SIZE = 12;
        for (let i = 0; i < parsedChannels.length; i += BATCH_SIZE) {
          const batch = parsedChannels.slice(i, i + BATCH_SIZE);
          await Promise.all(batch.map(async (channel) => {
            const streamUrl = channel.servers?.[0]?.url;
            if (!streamUrl) {
              channel.isOnline = false;
              channel.status = "offline";
              offlineCount++;
              return;
            }

            try {
              const parsedStream = new URL(streamUrl);
              if (parsedStream.protocol !== "http:" && parsedStream.protocol !== "https:") throw new Error();
              if (await isPrivateOrLocalHost(parsedStream.hostname)) {
                channel.isOnline = false;
                channel.status = "offline";
                channel.error = "IP privado ou não autorizado (Anti-SSRF)";
                offlineCount++;
                return;
              }
            } catch (e) {
              channel.isOnline = false;
              channel.status = "offline";
              channel.error = "URL inválida";
              offlineCount++;
              return;
            }

            const startTime = Date.now();
            try {
              const controller = new AbortController();
              const timeout = setTimeout(() => controller.abort(), 3500);

              const checkRes = await fetch(streamUrl, {
                method: "GET",
                signal: controller.signal,
                headers: {
                  "Range": "bytes=0-1024",
                  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
                  "Accept": "*/*"
                }
              });
              clearTimeout(timeout);
              const elapsed = Date.now() - startTime;

              // Considera ativo se respondeu 2xx ou 3xx ou se o content-type for mpegurl/video
              const contentType = checkRes.headers.get("content-type") || "";
              const isOk = (checkRes.status >= 200 && checkRes.status < 400) || contentType.includes("mpeg") || contentType.includes("video");

              if (isOk) {
                channel.isOnline = true;
                channel.status = "online";
                channel.responseTimeMs = elapsed;
                onlineCount++;
              } else {
                channel.isOnline = false;
                channel.status = "offline";
                channel.statusCode = checkRes.status;
                offlineCount++;
              }
            } catch (err: any) {
              channel.isOnline = false;
              channel.status = "offline";
              channel.error = err.name === "AbortError" ? "Tempo limite esgotado (timeout)" : "Link inacessível";
              offlineCount++;
            }
          }));
        }
      } else {
        // Se validação estiver desativada
        parsedChannels.forEach(c => {
          c.isOnline = true;
          c.status = "untested";
        });
        onlineCount = parsedChannels.length;
      }

      return res.json({
        success: true,
        total: parsedChannels.length,
        onlineCount,
        offlineCount,
        validated: validateStreams,
        categories: categoryCounts,
        channels: parsedChannels,
        sample: parsedChannels.slice(0, 10)
      });
    } catch (err: any) {
      console.error("[M3U Parser API Error]:", err.message);
      return res.status(500).json({ success: false, error: err.message || "Erro ao processar lista M3U" });
    }
  });

  // API 4: Proxy WatchPlay API (para obter opções de episódio e player sem bloqueio de CORS)
  router.all(["/api/watchplay-proxy-api", "/api/watchplay-proxy-api/api", "/api/watchplay-proxy", "/api/watchplay-proxy/api"], async (req, res) => {
    try {
      const upstreamRes = await fetch("https://v1.watchplay.shop/api", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "Referer": "https://v1.watchplay.shop/",
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        },
        body: new URLSearchParams(req.body as Record<string, string>),
      });
      const data = await upstreamRes.json();
      return res.json(data);
    } catch (err: any) {
      console.error("[WatchPlay Proxy API Error]:", err.message);
      return res.status(500).json({ errors: "1", message: err.message });
    }
  });

  // Proxy de assets estáticos do WatchPlayer (/assets/artplayer.js, /assets/hls.min.js, /assets/myplayer.js, etc.)

export default router;
