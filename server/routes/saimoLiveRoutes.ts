/**
 * Rota Dinâmica de Resolução de Fontes Saimo Ao Vivo (/api/saimo-source).
 *
 * Resolve fontes de canais dinamicamente (especialmente s25-cloudfront-net.lat
 * que sofrem rotação de hash pelo operador upstream) sem que o cliente ou o
 * arquivo liveChannels.ts precisem guardar hashes temporários.
 */
import { Router, Request, Response } from "express";
import { getSaimoLiveSource, forceTokenRefresh } from "../services/saimoLiveTokenWatcher";
import { signProxyUrl } from "../utils/helpers";

const router = Router();

function isAllowedViewerOrigin(origin: string): boolean {
  return (
    /^(https?:\/\/)?(localhost(:\d+)?|127\.0\.0\.1(:\d+)?)$/i.test(origin) ||
    /^capacitor:\/\/localhost$/i.test(origin) ||
    /^ionic:\/\/localhost$/i.test(origin) ||
    /^(https?:\/\/)?([a-zA-Z0-9-]+\.)*play-infinity\.stream$/i.test(origin) ||
    /^(https?:\/\/)?play-infinity-[a-zA-Z0-9-]+\.run\.app$/i.test(origin)
  );
}

function applyViewerCors(req: Request, res: Response): void {
  const origin = req.headers.origin as string | undefined;
  if (origin) {
    if (isAllowedViewerOrigin(origin)) {
      res.setHeader("Access-Control-Allow-Origin", origin);
      res.setHeader("Access-Control-Allow-Credentials", "true");
    }
  } else {
    res.setHeader("Access-Control-Allow-Origin", "*");
  }
  res.setHeader("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "*");
}

router.get("/api/saimo-source", async (req: Request, res: Response) => {
  applyViewerCors(req, res);
  if (req.method === "OPTIONS") return res.status(204).end();

  const channelRaw = req.query.channel || req.query.name || req.query.id;
  if (!channelRaw || typeof channelRaw !== "string") {
    return res.status(400).json({ success: false, error: "Parâmetro 'channel' ou 'name' obrigatório." });
  }

  const channel = channelRaw.trim();
  if (channel.length > 80 || /[\r\n<>]/.test(channel)) {
    return res.status(400).json({ success: false, error: "Nome de canal inválido." });
  }

  let sourceIndex = 1;
  if (req.query.source) {
    const parsed = parseInt(String(req.query.source), 10);
    if (!isNaN(parsed) && parsed >= 1 && parsed <= 10) {
      sourceIndex = parsed;
    }
  }

  res.setHeader("Cache-Control", "no-store");

  // 1. Tenta obter do cache em memória
  let source = getSaimoLiveSource(channel, sourceIndex);

  // 2. Se não encontrou, tenta re-sync rápido
  if (!source) {
    await forceTokenRefresh(channel);
    source = getSaimoLiveSource(channel, sourceIndex);
  }

  if (!source || !source.url) {
    return res.status(404).json({
      success: false,
      error: `Fonte ${sourceIndex} não encontrada para o canal "${channel}".`
    });
  }

  const sig = signProxyUrl(source.url);
  const params = new URLSearchParams();
  params.set("url", source.url);
  params.set("sig", sig);
  if (source.referer) params.set("referer", source.referer);
  if (source.agente) params.set("agente", source.agente);

  const targetProxyUrl = `/api/live-stream-proxy?${params.toString()}`;

  if (req.query.format === "json") {
    return res.json({
      success: true,
      channel,
      sourceIndex,
      url: source.url,
      referer: source.referer,
      agente: source.agente,
      proxyUrl: targetProxyUrl
    });
  }

  // Comportamento padrão: redirect 302 direto para o proxy assinado
  return res.redirect(302, targetProxyUrl);
});

export default router;
