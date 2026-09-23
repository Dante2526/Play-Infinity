/**
 * Endpoint: GET /api/bolodechocolate?canal=premiereclubes
 * 
 * Faz fetch do bolodechocolate.fit, decodifica o array DCI (base64),
 * extrai o DASH MPD URL + ClearKey DRM.
 * 
 * Retorna: { mpd_url, ck_id, ck_key }
 * 
 * O bolodechocolate.fit não tem ads nem anti-sandbox.
 * O stream é MPEG-DASH com ClearKey DRM na CDN aiv-cdn.net.
 */
import { Router } from "express";
import { Readable } from "stream";

const router = Router();

const BREADCRUMB_BASE = 17890309;

// Cache em memória (5 min de TTL — a URL muda mas a chave pode ser estável)
let cache: { url: string; ck_id: string; ck_key: string; expires: number } | null = null;

function decodeDCI(html: string): { url: string; ck_id: string; ck_key: string } | null {
  // Extrai o array DCI
  const match = html.match(/var DCI = \[([\s\S]*?)\]/);
  if (!match) return null;

  const items = match[1].match(/"([^"]+)"/g)?.map(s => s.replace(/"/g, '')) || [];

  // Decodifica: base64 → remove non-digits → parseInt → subtract BASE → charCode
  let trg = '';
  for (const item of items) {
    try {
      const decoded = Buffer.from(item, 'base64').toString('utf-8');
      const digits = decoded.replace(/\D/g, '');
      if (digits) {
        const charCode = parseInt(digits) - BREADCRUMB_BASE;
        if (charCode >= 0 && charCode <= 1114111) {
          trg += String.fromCharCode(charCode);
        }
      }
    } catch {}
  }

  // Extrai url, ck_id, ck_key do HTML decodificado
  const urlMatch = trg.match(/window\.url\s*=\s*"([^"]+)"/);
  const ckIdMatch = trg.match(/window\.ck_id\s*=\s*"([^"]+)"/);
  const ckKeyMatch = trg.match(/window\.ck_key\s*=\s*"([^"]+)"/);

  if (!urlMatch || !ckIdMatch || !ckKeyMatch) return null;

  return {
    url: urlMatch[1],
    ck_id: ckIdMatch[1],
    ck_key: ckKeyMatch[1],
  };
}

router.get("/api/bolodechocolate", async (req, res) => {
  try {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Cache-Control", "public, max-age=60");

    const canal = (req.query.canal as string) || "premiereclubes";

    // Cache check (5 min)
    if (cache && cache.expires > Date.now()) {
      return res.json({ mpd_url: cache.url, ck_id: cache.ck_id, ck_key: cache.ck_key, cached: true });
    }

    // Fetch do bolodechocolate.fit
    const embedUrl = `https://bolodechocolate.fit/embed/${canal}.html`;
    const upstream = await fetch(embedUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36",
        "Accept": "text/html,*/*",
        "Referer": "https://piratatvs.com/",
      },
    });

    if (!upstream.ok) {
      return res.status(502).json({ error: `bolodechocolate.fit retornou ${upstream.status}` });
    }

    const html = await upstream.text();

    // Decodifica o array DCI
    const decoded = decodeDCI(html);
    if (!decoded) {
      return res.status(502).json({ error: "Não foi possível decodificar o stream (DCI array)" });
    }

    // Atualiza cache (5 min)
    cache = {
      url: decoded.url,
      ck_id: decoded.ck_id,
      ck_key: decoded.ck_key,
      expires: Date.now() + 5 * 60 * 1000,
    };

    console.log(`[bolodechocolate] Canal: ${canal} | URL: ${decoded.url.substring(0, 80)}...`);

    return res.json({
      mpd_url: decoded.url,
      ck_id: decoded.ck_id,
      ck_key: decoded.ck_key,
      cached: false,
    });
  } catch (err: any) {
    console.error("[bolodechocolate] Erro:", err?.message || err);
    return res.status(500).json({ error: "Erro interno" });
  }
});

export default router;
