import { Router, Request, Response } from "express";

const router = Router();

// Cache em memória para evitar bloqueios de IP (TTL de 6 horas)
// Mapeia: "tmdbId_type_s_e" -> "https://mixdrop.co/e/..."
const _vizerCache = new Map<string, { url: string; timestamp: number }>();
const CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6 horas

/**
 * Busca o link Mixdrop do Vizer simulando um navegador
 * @param query Nome do filme/série para buscar
 * @param tmdbId ID para confirmação (opcional)
 */
async function scrapeVizerForMixdrop(title: string, year: string, type: "movie" | "series", s?: string, e?: string): Promise<string | null> {
  try {
    const searchUrl = `https://vizer.tv/pesquisar/${encodeURIComponent(title)}`;
    
    // 1. Busca silenciosa no Vizer
    const searchRes = await fetch(searchUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
        "Accept-Language": "pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7",
      },
      signal: AbortSignal.timeout(8000)
    });
    
    if (!searchRes.ok) return null;
    const searchHtml = await searchRes.text();
    
    // RegEx simples para achar o link do filme nos resultados do Vizer
    // (A extração real precisaria adaptar-se ao HTML exato do Vizer)
    const linkMatch = searchHtml.match(/href="([^"]+\/(filme|serie)\/[^"]+)"/i);
    if (!linkMatch) return null;
    
    let mediaUrl = linkMatch[1];
    if (!mediaUrl.startsWith("http")) {
      mediaUrl = `https://vizer.tv${mediaUrl.startsWith("/") ? "" : "/"}${mediaUrl}`;
    }

    // Se for série, nós precisaríamos montar a URL do episódio
    if (type === "series" && s && e) {
      // Normalmente sites como vizer tem endpoints /serie/nome/temporada/episodio
      // Isso seria injetado aqui via regras do site
    }
    
    // 2. Acessa a página do filme/episódio
    const mediaRes = await fetch(mediaUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0",
        "Referer": searchUrl
      },
      signal: AbortSignal.timeout(8000)
    });
    
    if (!mediaRes.ok) return null;
    const mediaHtml = await mediaRes.text();
    
    // 3. Procura o Iframe do Mixdrop dentro do código-fonte
    const mixdropMatch = mediaHtml.match(/src="(https:\/\/(mixdrop\.[a-z]+|uloz\.to)\/e\/[^"]+)"/i);
    if (mixdropMatch) {
      return mixdropMatch[1];
    }
    
    return null;
  } catch (err) {
    console.error("[Vizer Scraper] Erro durante a extração:", err);
    return null;
  }
}

router.get("/api/vizer-stream", async (req: Request, res: Response) => {
  try {
    const { tmdbId, type, title, year, s, e } = req.query;
    
    if (!tmdbId || !type || !title) {
      return res.status(400).json({ success: false, error: "Parâmetros tmdbId, type e title são obrigatórios." });
    }
    
    const cacheKey = `${tmdbId}_${type}_${s || 0}_${e || 0}`;
    
    // Verifica o Cache
    const cached = _vizerCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
      console.log(`[Vizer Scraper] Servindo Mixdrop do Cache para TMDB ${tmdbId}`);
      return res.json({ success: true, url: cached.url });
    }
    
    // Faz o scraping
    console.log(`[Vizer Scraper] Iniciando extração no Vizer para: ${title} (${year})`);
    const mixdropUrl = await scrapeVizerForMixdrop(
      String(title),
      String(year || ""),
      type as "movie" | "series",
      s ? String(s) : undefined,
      e ? String(e) : undefined
    );
    
    if (mixdropUrl) {
      // Salva no cache
      _vizerCache.set(cacheKey, { url: mixdropUrl, timestamp: Date.now() });
      return res.json({ success: true, url: mixdropUrl });
    }
    
    return res.status(404).json({ success: false, error: "Nenhum link Mixdrop Dublado encontrado no Vizer para este título." });
  } catch (err: any) {
    console.error("[Vizer Scraper] Falha crítica:", err);
    return res.status(500).json({ success: false, error: "Erro interno no servidor de extração." });
  }
});

export default router;
