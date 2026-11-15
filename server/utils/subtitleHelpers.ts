/**
 * Helpers puros para busca, validação, decodificação e conversão de legendas
 * externas (SubtitleCat / SRT -> VTT), extraídos de `subtitlesRoutes.ts`
 * para serem testáveis em Node puro sem Express/cheerio.
 */

export interface SubtitleCatSearchItem {
  href: string;
  text: string;
}

export interface SubtitleCatAnchor {
  href: string;
  id?: string;
}

/**
 * Decodifica bytes de `.srt` tentando UTF-8 estrito primeiro e caindo para
 * Windows-1252 (ISO-8859-1 estendido), muito comum em legendas PT-BR antigas
 * onde acentos (`é`, `ç`, `ã`) viravam `` ao decodificar direto em UTF-8.
 */
export function decodeSubtitleBuffer(buffer: ArrayBuffer | Uint8Array): string {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder("windows-1252").decode(bytes);
  }
}

/**
 * Converte SRT (ou VTT já existente) em WEBVTT padronizado.
 * Aceita BOM `\uFEFF`, `\r\n`, índice numérico com espaços e timestamps com
 * 1 ou 2 dígitos de hora separados por `,` ou `.`.
 */
export function srtToVtt(srt: string): string {
  const normalized = srt.replace(/^\uFEFF/, "").replace(/\r\n|\r/g, "\n");
  if (/^\s*WEBVTT\b/i.test(normalized)) {
    return normalized.replace(/^\s*WEBVTT[^\n]*/i, "WEBVTT");
  }

  const lines = normalized.split("\n");
  const out: string[] = ["WEBVTT", ""];
  const timeRe = /^\s*(\d{1,2}):(\d{2}:\d{2})[,.](\d{3})\s*-->\s*(\d{1,2}):(\d{2}:\d{2})[,.](\d{3})(.*)$/;

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (/^\s*\d+\s*$/.test(line) || line.trim() === "") {
      i++;
      continue;
    }

    const m = line.match(timeRe);
    if (m) {
      const start = `${m[1].padStart(2, "0")}:${m[2]}.${m[3]}`;
      const end = `${m[4].padStart(2, "0")}:${m[5]}.${m[6]}`;
      const settings = m[7] ? m[7].trimEnd() : "";
      out.push(`${start} --> ${end}${settings}`);
      i++;
      while (i < lines.length && lines[i].trim() !== "") {
        out.push(lines[i]);
        i++;
      }
      out.push("");
    } else {
      i++;
    }
  }

  return out.join("\n");
}

function cleanSearchTitle(raw: string): string {
  return raw
    .replace(/['’]/g, "")
    .replace(/[:,\.\(\)\[\]\-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Monta queries de busca ordenadas para o SubtitleCat a partir do TMDB (`en-US`).
 * Títulos originais em escrita não-latina (animes/doramas) priorizam o nome
 * em inglês para evitar queries em kanji/hangul que retornam 0 resultados.
 */
export function buildSubtitleSearchQueries(
  tmdbData: {
    original_title?: string;
    original_name?: string;
    title?: string;
    name?: string;
  },
  mediaType: "movie" | "tv",
  season: string,
  episode: string,
): string[] {
  const original = cleanSearchTitle(tmdbData.original_title || tmdbData.original_name || "");
  const english = cleanSearchTitle(tmdbData.title || tmdbData.name || "");
  const hasLatin = (s: string) => /[a-zA-Z0-9]/.test(s);

  const baseOrder = original && !hasLatin(original) && english
    ? [english, original]
    : [original, english];

  const suffix = mediaType === "tv"
    ? ` S${season.padStart(2, "0")}E${episode.padStart(2, "0")}`
    : "";

  const seen = new Set<string>();
  const queries: string[] = [];
  for (const base of baseOrder) {
    if (!base || !hasLatin(base)) continue;
    const key = base.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    queries.push(`${base}${suffix}`);
  }
  return queries;
}

function normalizeForMatch(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/['’]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/**
 * Filtra e ordena resultados da busca do SubtitleCat garantindo correspondência
 * real de título (e episódio exato no caso de séries), evitando baixar
 * legendas de outras séries cujo nome contém a palavra buscada (ex: "You").
 */
export function rankSubtitleCatResults(
  items: readonly SubtitleCatSearchItem[],
  targetTitle: string,
  mediaType: "movie" | "tv",
  season: string,
  episode: string,
): SubtitleCatSearchItem[] {
  const normTarget = normalizeForMatch(targetTitle);
  const targetWords = normTarget.split(/\s+/).filter(Boolean);
  if (targetWords.length === 0) return [];

  const sNum = Number(season);
  const eNum = Number(episode);
  const epRegex = new RegExp(`(?:^|[^a-z0-9])(?:s0*${sNum}[\\s._-]*e0*${eNum}|0*${sNum}x0*${eNum})(?!\\d)`, "i");
  const releaseTagRegex = /\b(?:(?:19|20)\d{2}|480p|720p|1080p|2160p|4k|webrip|web|bluray|bdrip|brrip|hdtv|dvdrip|hdrip|remux|x264|x265|hevc|h264|aac|dts|track\d+)\b/i;

  const scored: Array<{ item: SubtitleCatSearchItem; score: number }> = [];

  for (const item of items) {
    const raw = (item.text || "").replace(/^(\s*\[[^\]]+\]\s*)+/, "");
    if (!raw) continue;

    let titleSegment = raw;
    if (mediaType === "tv") {
      const epMatch = raw.match(epRegex);
      if (!epMatch || epMatch.index === undefined) continue;
      titleSegment = raw.slice(0, epMatch.index);
    }

    const normSegment = normalizeForMatch(titleSegment);
    const tagMatch = normSegment.match(releaseTagRegex);
    let lead = (tagMatch && tagMatch.index !== undefined
      ? normSegment.slice(0, tagMatch.index)
      : normSegment
    ).trim();
    lead = lead.replace(/\s+(?:us|uk|au|br)$/i, "").trim();

    if (!lead) continue;
    if (lead === normTarget) {
      scored.push({ item, score: 1000 });
      continue;
    }

    if (lead.startsWith(`${normTarget} `)) {
      const extraWords = lead.slice(normTarget.length + 1).split(/\s+/).filter(Boolean);
      const maxAllowedExtra = targetWords.length <= 2 ? 1 : 2;
      if (extraWords.length <= maxAllowedExtra) {
        scored.push({ item, score: 800 - extraWords.length * 50 });
      }
      continue;
    }

    // Permite variação mínima com "the " no início apenas para títulos multi-palavra
    if (targetWords.length >= 2 && lead === `the ${normTarget}`) {
      scored.push({ item, score: 850 });
    }
  }

  return scored.sort((a, b) => b.score - a.score).map((entry) => entry.item);
}

/**
 * Seleciona e ordena links `.srt` na página de detalhe do SubtitleCat:
 * prioriza explicitamente PT-BR antes de PT genérico e normaliza `/` inicial.
 */
export function pickSubtitleCatDownloadLinks(anchors: readonly SubtitleCatAnchor[]): string[] {
  const ptBr: string[] = [];
  const ptGeneric: string[] = [];
  const seen = new Set<string>();

  for (const anchor of anchors) {
    const rawHref = (anchor.href || "").trim();
    if (!rawHref || rawHref.startsWith("javascript:")) continue;
    const cleanPath = rawHref.split(/[?#]/, 1)[0];
    if (!/\.srt$/i.test(cleanPath)) continue;

    const normalizedHref = rawHref.replace(/^\/+/, "");
    if (seen.has(normalizedHref)) continue;

    const id = (anchor.id || "").toLowerCase();
    const isPtBr =
      id === "download_pt-br" ||
      /(?:^|[-_.])pt[-_]?br\.srt$/i.test(cleanPath) ||
      /(?:brazil|brasil)/i.test(cleanPath);
    const isPtGeneric =
      !isPtBr &&
      (id === "download_pt" ||
        /(?:^|[-_.])pt\.srt$/i.test(cleanPath) ||
        /portuguese/i.test(cleanPath));

    if (isPtBr) {
      seen.add(normalizedHref);
      ptBr.push(normalizedHref);
    } else if (isPtGeneric) {
      seen.add(normalizedHref);
      ptGeneric.push(normalizedHref);
    }
  }

  return [...ptBr, ...ptGeneric];
}
