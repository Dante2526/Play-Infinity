import { Router } from "express";
import fs from "fs";
import path from "path";
import * as cheerio from "cheerio";

export const subtitlesRouter = Router();

const CACHE_DIR = path.join(process.cwd(), "data", "subtitles-cache");
if (!fs.existsSync(CACHE_DIR)) {
  fs.mkdirSync(CACHE_DIR, { recursive: true });
}

// Mínimo de cues para considerar uma legenda válida (evita intertítulos/abertura)
const MIN_VALID_CUES = 20;

// Helper para converter SRT em VTT na memória
function srtToVtt(srt: string): string {
  let vtt = "WEBVTT\n\n";
  const lines = srt.replace(/\r\n|\r/g, "\n").split("\n");
  let i = 0;
  while (i < lines.length) {
    let line = lines[i];
    if (line.match(/^\d+$/)) {
      i++;
      continue;
    }
    if (line.match(/\d{2}:\d{2}:\d{2},\d{3}/)) {
      line = line.replace(/,/g, ".");
      vtt += line + "\n";
      i++;
      while (i < lines.length && lines[i].trim() !== "") {
        vtt += lines[i] + "\n";
        i++;
      }
      vtt += "\n";
    } else {
      i++;
    }
  }
  return vtt;
}

// Conta o número de cues num VTT — usado para validar a legenda
function countVttCues(vtt: string): number {
  return (vtt.match(/\d{2}:\d{2}:\d{2}\.\d{3}\s+-->/g) || []).length;
}

// Tenta baixar a legenda PT-BR de um resultado específico do SubtitleCat
async function tryFetchSubtitleFromResult(resultHref: string): Promise<string | null> {
  try {
    const detailUrl = `https://www.subtitlecat.com/${resultHref}`;
    const detailRes = await fetch(detailUrl, { signal: AbortSignal.timeout(8000) });
    if (!detailRes.ok) return null;
    const detailHtml = await detailRes.text();
    const $detail = cheerio.load(detailHtml);

    let downloadHref = "";
    $detail("a").each((_, el) => {
      const href = $detail(el).attr("href");
      if (
        href &&
        !href.startsWith("javascript:") &&
        href.endsWith(".srt") &&
        (href.includes("-pt-BR") || href.includes("-pt") || href.toLowerCase().includes("portuguese") || href.toLowerCase().includes("brasil"))
      ) {
        if (!downloadHref) downloadHref = href;
      }
    });

    if (!downloadHref) return null;

    const downloadUrl = `https://www.subtitlecat.com/${downloadHref}`;
    const srtRes = await fetch(downloadUrl, { signal: AbortSignal.timeout(10000) });
    if (!srtRes.ok) return null;
    const srtBuffer = await srtRes.arrayBuffer();
    const srtText = new TextDecoder("utf-8").decode(srtBuffer);
    const vttText = srtToVtt(srtText);

    if (countVttCues(vttText) < MIN_VALID_CUES) return null;
    return vttText;
  } catch {
    return null;
  }
}

subtitlesRouter.get("/api/subtitles", async (req, res) => {
  try {
    const { tmdb, type, season, episode, lang } = req.query;
    if (!tmdb || !type || !lang) {
      return res.status(400).json({ error: "Parâmetros tmdb, type e lang são obrigatórios." });
    }

    const tmdbId = String(tmdb);
    const mediaType = String(type);
    const s = season ? String(season) : "1";
    const e = episode ? String(episode) : "1";
    const cacheKey = `${mediaType}_${tmdbId}_s${s}_e${e}_${lang}.vtt`;
    const cachePath = path.join(CACHE_DIR, cacheKey);

    // 1. Verifica cache local — mas valida cues mínimas (evita reutilizar cache corrompido)
    if (fs.existsSync(cachePath)) {
      const stat = fs.statSync(cachePath);
      const isExpired = Date.now() - stat.mtimeMs > 30 * 24 * 60 * 60 * 1000;
      if (!isExpired) {
        const cached = fs.readFileSync(cachePath, "utf-8");
        if (countVttCues(cached) >= MIN_VALID_CUES) {
          const b64 = Buffer.from(cachePath).toString("base64");
          return res.json({ success: true, url: `/api/subtitle-file?path=${b64}` });
        }
        console.warn(`[Subtitles] Cache inválido para ${cacheKey} (${countVttCues(cached)} cues < ${MIN_VALID_CUES}), rebuscando...`);
        fs.unlinkSync(cachePath);
      }
    }

    // 2. Busca TMDB em inglês — usa original_title para garantir que o SubtitleCat encontre
    const TMDB_KEY = process.env.VITE_TMDB_API_KEY || "e0cc43e590a5c5c0d03f920bd4fe9424";
    const tmdbUrl = `https://api.themoviedb.org/3/${mediaType === "movie" ? "movie" : "tv"}/${tmdbId}?api_key=${TMDB_KEY}&language=en-US`;
    const tmdbRes = await fetch(tmdbUrl, { signal: AbortSignal.timeout(8000) });
    if (!tmdbRes.ok) throw new Error(`TMDB failed: ${tmdbRes.status}`);
    const tmdbData = await tmdbRes.json();

    // Usa original_title (inglês) como termo principal de busca no SubtitleCat
    let searchTitle = tmdbData.original_title || tmdbData.original_name || tmdbData.title || tmdbData.name;
    searchTitle = searchTitle.replace(/[:,\.\(\)\[\]\-]/g, " ").replace(/\s+/g, " ").trim();

    if (mediaType === "tv") {
      const sStr = s.padStart(2, "0");
      const eStr = e.padStart(2, "0");
      searchTitle += ` S${sStr}E${eStr}`;
    }

    console.log(`[Subtitles] Buscando: "${searchTitle}" (TMDB ${tmdbId})`);

    // 3. Busca no SubtitleCat — coleta os primeiros 5 resultados
    const query = encodeURIComponent(searchTitle);
    const searchUrl = `https://www.subtitlecat.com/index.php?search=${query}`;
    const searchRes = await fetch(searchUrl, { signal: AbortSignal.timeout(10000) });
    const searchHtml = await searchRes.text();
    const $ = cheerio.load(searchHtml);

    const resultLinks: string[] = [];
    $("tbody tr td a").each((_, el) => {
      const href = $(el).attr("href");
      if (href && resultLinks.length < 5) resultLinks.push(href);
    });

    if (resultLinks.length === 0) {
      return res.status(404).json({ error: "Nenhum resultado encontrado no SubtitleCat." });
    }

    // 4. Tenta cada resultado até encontrar uma legenda PT-BR válida (>= MIN_VALID_CUES)
    let vttText: string | null = null;
    for (const link of resultLinks) {
      vttText = await tryFetchSubtitleFromResult(link);
      if (vttText) {
        console.log(`[Subtitles] Legenda válida (${countVttCues(vttText)} cues): ${link}`);
        break;
      }
    }

    if (!vttText) {
      return res.status(404).json({ error: "Legenda PT-BR com conteúdo suficiente não encontrada." });
    }

    // 5. Salvar em cache e retornar
    fs.writeFileSync(cachePath, vttText, "utf-8");
    const b64 = Buffer.from(cachePath).toString("base64");
    return res.json({ success: true, url: `/api/subtitle-file?path=${b64}` });

  } catch (err: any) {
    console.error("[Subtitles] Error:", err.message);
    return res.status(500).json({ error: err.message });
  }
});

subtitlesRouter.get("/api/subtitle-file", (req, res) => {
  const b64Path = req.query.path as string;
  if (!b64Path) return res.status(400).send("Path missing");

  try {
    const filePath = Buffer.from(b64Path, "base64").toString("utf-8");
    if (!fs.existsSync(filePath)) {
      return res.status(404).send("File not found");
    }
    res.setHeader("Content-Type", "text/vtt");
    res.setHeader("Access-Control-Allow-Origin", "*");
    fs.createReadStream(filePath).pipe(res);
  } catch (e) {
    res.status(500).send("Error reading file");
  }
});
