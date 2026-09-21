import { Router } from "express";

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

    // Obtém a base do proxy
    const proxyUrl = process.env.VITE_PROXY_URL || "https://play-infinity-app.duckdns.org";

    // Redireciona para o proxy com URL fresca
    res.redirect(`${proxyUrl}/api/live-stream-proxy?url=${encodeURIComponent(streamUrl)}`);
  } catch (e: any) {
    res.status(500).send("Erro obtendo token Xtream: " + e.message);
  }
});

export default router;
