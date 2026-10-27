/**
 * Rotas da camada de canais externos ("Saimo-style" — Live TV).
 *
 * GET /api/external-channel?name=<canal>[&format=json]
 *   Comportamento PADRÃO (sem format): res.redirect(302) para a playlist da
 *   melhor fonte viva — compatível com o LivePlayerModal (hls.js espera URL
 *   de playlist .m3u8, não JSON) e com o Sentinela (probeLiveStreamUrl segue
 *   o redirect e valida #EXTM3U).
 *
 *   Decisão de redirect (regra de Mixed Content — produção roda em
 *   https://play-infinity.stream e o navegador BLOQUEIA http:// direto):
 *     · fonte https:// SEM referer/agente → redirect DIRETO ao CDN
 *       (browser conecta direto; IP do VPS fora do caminho)
 *     · fonte http:// OU com referer/agente → redirect para
 *       /api/live-stream-proxy?url=<enc>&sig=<signProxyUrl(url)>[&referer=<enc>]
 *       (proxy assinado; a rota de proxy já faz anti-SSRF + reescrita de URIs
 *       dos segmentos, garantindo CORS same-origin para o player)
 *
 *   Com ?format=json → retorna { url, directUrl, source, ... } sem redirect
 *   (uso administrativo/futuro; nunca usado pelo player).
 *
 * POST /api/admin/external-sync-saimo   — sync manual do catálogo (admin-only)
 * GET  /api/admin/external-catalog      — estatísticas do catálogo (admin-only)
 *
 * Segurança (relatórios #8/#12): validação estrita de query via
 * externalValidation.ts; nome só é usado para lookup em memória; toda fonte
 * é validada anti-SSRF (isPrivateOrLocalHost) dentro do resolver ANTES de
 * qualquer fetch do servidor.
 */
import { Router } from "express";
import { validateExternalChannelName, validateExternalFormatParam } from "../utils/externalValidation";
import { resolveExternalChannel, externalCatalogStats } from "../services/externalCatalog";
import { syncSaimoAllDeduped } from "../services/saimoCatalogScraper";
import { signProxyUrl } from "../utils/helpers";

const router = Router();

// ---------------------------------------------------------------------------
// CORS espelhado do /api/live-stream-proxy (videoScrapers.ts): permite o app
// web (play-infinity.stream), o app Android (capacitor/ionic) e dev local.
// ---------------------------------------------------------------------------
function isAllowedViewerOrigin(origin: string): boolean {
  return (
    /^(https?:\/\/)?(localhost(:\d+)?|127\.0\.0\.1(:\d+)?)$/i.test(origin) ||
    /^capacitor:\/\/localhost$/i.test(origin) ||
    /^ionic:\/\/localhost$/i.test(origin) ||
    /^(https?:\/\/)?([a-zA-Z0-9-]+\.)*play-infinity\.stream$/i.test(origin) ||
    /^(https?:\/\/)?play-infinity-[a-zA-Z0-9-]+\.run\.app$/i.test(origin)
  );
}

function applyViewerCors(req: { headers: { origin?: string } }, res: import("express").Response): void {
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

// ---------------------------------------------------------------------------
// GET /api/external-channel?name=<canal>[&format=json]
// ---------------------------------------------------------------------------
router.get("/api/external-channel", async (req, res) => {
  applyViewerCors(req, res);
  if (req.method === "OPTIONS") return res.status(204).end();

  try {
    const nameValidation = validateExternalChannelName(req.query.name);
    if (!nameValidation.ok) {
      return res.status(400).json({ success: false, error: nameValidation.error });
    }
    const formatValidation = validateExternalFormatParam(req.query.format);
    if (!formatValidation.ok) {
      return res.status(400).json({ success: false, error: formatValidation.error });
    }

    // Deadline 4.5s (default do resolver é 7s): o orçamento do cliente precisa
    // cobrir a cadeia INTEIRA — resolver + redirect 302 + proxy re-buscando a
    // playlist upstream (timeout 8s no /api/live-stream-proxy). A Sentinela
    // (12s) e o teste de conexão do painel (12s) só cabem a cadeia se o
    // resolver devolver rápido. Com 4.5s: 1 batch de 4 fontes (playlist 3s +
    // segmento 1.5s em paralelo) completa; se houver fonte viva no batch 1,
    // retorna em ~4.5s. O player (hls.js) tem timeouts próprios de fragmento
    // e não depende deste orçamento.
    const resolved = await resolveExternalChannel(nameValidation.value!, { deadlineMs: 7000, batch: 6, probeTimeoutMs: 2000 });
    if (!resolved) {
      return res.status(502).json({
        success: false,
        error: "Canal não encontrado no catálogo externo ou sem fontes utilizáveis.",
      });
    }

    // Regra de Mixed Content / cabeçalhos custom:
    // http:// (bloqueado pelo browser em página https) ou referer/agente
    // exigidos → encapsular no proxy interno assinado.
    const needsProxy =
      resolved.url.toLowerCase().startsWith("http://") || !!resolved.referer || !!resolved.agente;

    let target: string;
    if (needsProxy) {
      // Location RELATIVO (RFC 7231 permite URI-reference): cada cliente
      // resolve contra a origem que já usou —
      //   browser:  https://play-infinity.stream/api/live-stream-proxy (sem
      //             mixed content, TLS certo)
      //   Sentinela/teste do painel: http://127.0.0.1:3000/api/live-stream-proxy
      //             (porta HTTP do Express, sem tentativa de TLS)
      // Bug que este fix fecha: com URL absoluta montada como
      // `${NODE_ENV=production ? https}://${req.get("host")}`, a sondagem
      // interna da Sentinela (http://127.0.0.1:3000) recebia
      // Location: https://127.0.0.1:3000/... — TLS numa porta HTTP puro →
      // "wrong version number" → painel acusava "fora do ar" mesmo com o
      // canal tocando. (O nginx também não repassa X-Forwarded-Proto, então
      // detecção por header não era opção.) hls.js e fetch do Node seguem
      // redirects relativos nativamente.
      const params = new URLSearchParams();
      params.set("url", resolved.url);
      params.set("sig", signProxyUrl(resolved.url));
      if (resolved.referer) params.set("referer", resolved.referer);
      target = `/api/live-stream-proxy?${params.toString()}`;
    } else {
      target = resolved.url;
    }

    // Log sem credenciais: hostname + índice da fonte (fontes Xtream têm
    // usuario/senha no path — nunca logar a URL completa).
    try {
      const host = new URL(resolved.url).hostname;
      console.log(
        `[external] canal="${resolved.channelName}" (req="${nameValidation.value}") fonte #${resolved.fonteIndex + 1} host=${host} ${needsProxy ? "→ proxy assinado" : "→ direto"}`
      );
    } catch {
      console.log(`[external] canal="${resolved.channelName}" fonte #${resolved.fonteIndex + 1} ${needsProxy ? "→ proxy assinado" : "→ direto"}`);
    }

    if (formatValidation.value === "json") {
      return res.json({
        success: true,
        url: target,
        directUrl: resolved.url,
        source: "external",
        channel: resolved.channelName,
        fonteIndex: resolved.fonteIndex,
        quality: resolved.qualidade || null,
        referer: resolved.referer || null,
        needsProxy,
      });
    }

    res.setHeader("Cache-Control", "public, max-age=30");
    return res.redirect(302, target);
  } catch (err: any) {
    console.error("[external] Erro na rota /api/external-channel:", err?.message || err);
    return res.status(500).json({ success: false, error: "Erro interno ao resolver canal externo." });
  }
});

// ---------------------------------------------------------------------------
// POST /api/admin/external-sync-saimo — sync manual (montada sob /api/admin,
// que já exige requireAdminAuth no server.ts)
// ---------------------------------------------------------------------------
router.post("/api/admin/external-sync-saimo", async (_req, res) => {
  try {
    const result = await syncSaimoAllDeduped();
    if (!result.success) {
      return res.status(502).json({ success: false, error: result.error || "Falha no sync Saimo." });
    }
    return res.json({
      success: true,
      channelsCount: result.channelsCount,
      fontesCount: result.fontesCount,
      basesCount: result.basesCount,
      skippedBases: result.skippedBases,
      durationMs: result.durationMs,
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err?.message || "Erro interno no sync." });
  }
});

// ---------------------------------------------------------------------------
// GET /api/admin/external-catalog — estatísticas (admin-only)
// ---------------------------------------------------------------------------
router.get("/api/admin/external-catalog", (_req, res) => {
  try {
    const stats = externalCatalogStats();
    return res.json({ success: true, ...stats });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err?.message || "Erro interno." });
  }
});

export default router;
