/**
 * Validação de parâmetros de query da rota /api/subtitles — extraída para
 * ser testável em node puro (sem deps Express/cheerio).
 *
 * Segurança (relatório #12): o cacheKey era montado com tmdb/type/season/
 * episode/lang crus de req.query, sem validação de formato. Como
 * cacheKey vira filename via path.join(CACHE_DIR, cacheKey) e path.join
 * normaliza '..', um lang='../../etc/passwd' conseguia escapar CACHE_DIR.
 * Combinado com fs.writeFileSync(cachePath, vttText) (linha 212), isso
 * permitia escrita arbitrária em arquivos do servidor após SubtitleCat
 * retornar uma legenda válida.
 *
 * Regex adotado (allowlist estrita):
 *  - tmdb: 1-10 dígitos (TMDB IDs: ~10M hoje, 10 dígitos cobre até 9.999.999.999)
 *  - type: enum literal "movie" | "tv"
 *  - season/episode: 1-3 dígitos (1-999)
 *  - lang: ISO 639-1 + opcional subtag region (pt, pt-BR, en, es-419)
 *    — proíbe pontos, barras, '..', e qualquer char que escape o filename
 *
 * A rota ainda mantém defense in depth: após path.join, verifica que
 * path.resolve(cachePath) continua dentro de CACHE_DIR (redundante se a
 * regex estiver correta, mas pega bugs de regressão).
 */

export type SubtitleMediaType = "movie" | "tv";

export interface ValidSubtitleParams {
  tmdbId: string;
  mediaType: SubtitleMediaType;
  season: string;
  episode: string;
  lang: string;
}

export interface SubtitleValidationResult {
  ok: boolean;
  params?: ValidSubtitleParams;
  error?: string;
}

export function validateSubtitleParams(query: {
  tmdb?: unknown;
  type?: unknown;
  season?: unknown;
  episode?: unknown;
  lang?: unknown;
}): SubtitleValidationResult {
  const { tmdb, type, season, episode, lang } = query;

  if (!tmdb || !type || !lang) {
    return { ok: false, error: "Parâmetros tmdb, type e lang são obrigatórios." };
  }

  const tmdbId = String(tmdb);
  const mediaType = String(type);
  const s = season ? String(season) : "1";
  const e = episode ? String(episode) : "1";
  const langStr = String(lang);

  if (!/^\d{1,10}$/.test(tmdbId)) {
    return { ok: false, error: "tmdb deve ser numérico (1-10 dígitos)." };
  }
  if (mediaType !== "movie" && mediaType !== "tv") {
    return { ok: false, error: "type deve ser 'movie' ou 'tv'." };
  }
  if (!/^\d{1,3}$/.test(s)) {
    return { ok: false, error: "season deve ser numérico (1-3 dígitos)." };
  }
  if (!/^\d{1,3}$/.test(e)) {
    return { ok: false, error: "episode deve ser numérico (1-3 dígitos)." };
  }
  if (!/^[a-zA-Z]{2}(-[a-zA-Z0-9]{2,3})?$/.test(langStr)) {
    return { ok: false, error: "lang deve seguir o padrão 'pt' ou 'pt-BR' (apenas letras e hífen, sem pontos/barras)." };
  }

  return {
    ok: true,
    params: {
      tmdbId,
      mediaType: mediaType as SubtitleMediaType,
      season: s,
      episode: e,
      lang: langStr,
    },
  };
}
