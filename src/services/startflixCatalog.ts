/**
 * Service: startflixCatalog
 * Lookup de episódios do catálogo startflix (Ghosts e futuras séries).
 *
 * Mesma arquitetura do encontreiCatalog, mas em vez de retornar um fileId
 * do Mixdrop, retorna uma embed_url (URL de iframe) diretamente.
 *
 * Fluxo no VideoPlayerModal:
 *   const result = await findStartflixEpisode(tmdbId, season, episode);
 *   if (result?.embed_url) {
 *     // Renderiza <iframe src={result.embed_url} />
 *   }
 *
 * Não precisa de /api/mixdrop-stream nem /api/mixdrop-proxy — o iframe
 * faz tudo (UPNS player carrega o stream internamente via API própria).
 */
export interface StartflixResult {
  embed_url: string;
  player_type: string;
  player_id: string;
  audio: string;
  series_title?: string;
  functional: boolean;        // true = upns.xyz (iframe funciona); false = playembedapi (X-Frame bloqueia)
  not_functional_reason?: string | null;
}

const _cache = new Map<string, StartflixResult | null>();

const yieldToEventLoop = () => new Promise(r => setTimeout(r, 0));

export async function findStartflixEpisode(
  tmdbId: number,
  season: number,
  episode: number
): Promise<StartflixResult | null> {
  const cacheKey = `tv:${tmdbId}:${season}:${episode}`;
  if (_cache.has(cacheKey)) {
    await yieldToEventLoop();
    return _cache.get(cacheKey) || null;
  }
  try {
    const res = await fetch(
      `/api/startflix-lookup?tmdb_id=${tmdbId}&season=${season}&episode=${episode}`
    );
    if (!res.ok) {
      _cache.set(cacheKey, null);
      return null;
    }
    const data = await res.json();
    const result: StartflixResult = {
      embed_url: data.embed_url,
      player_type: data.player_type,
      player_id: data.player_id,
      audio: data.audio || 'Dublado',
      series_title: data.series_title,
      functional: data.functional !== false,
      not_functional_reason: data.not_functional_reason,
    };
    _cache.set(cacheKey, result);
    return result;
  } catch {
    _cache.set(cacheKey, null);
    return null;
  }
}

/**
 * Helper pra saber quais episódios de uma season estão disponíveis.
 * Retorna null se a série não estiver no catálogo.
 * Útil pra mostrar "E23-E44 disponíveis" na UI.
 */
export async function getStartflixSeasonInfo(
  tmdbId: number,
  season: number
): Promise<{ total: number; functional: number; functional_episodes: number[] } | null> {
  try {
    const res = await fetch('/api/startflix-catalog');
    if (!res.ok) return null;
    const data = await res.json();
    const series = (data.series || []).find((s: any) => s.tmdb_id === tmdbId);
    if (!series) return null;
    const seasonData = (series.seasons || []).find((s: any) => s.season === season);
    if (!seasonData) return null;
    return {
      total: seasonData.episode_count,
      functional: seasonData.functional_count,
      functional_episodes: [], // poderia ser preenchido, mas pra simplicidade fica vazio
    };
  } catch {
    return null;
  }
}

/**
 * Verifica rapidamente se uma série está no catálogo startflix.
 * Úsado no DetailsPage pra decidir se mostra "Startflix" como opção de player.
 */
export async function isStartflixAvailable(tmdbId: number): Promise<boolean> {
  try {
    const res = await fetch('/api/startflix-catalog');
    if (!res.ok) return false;
    const data = await res.json();
    return (data.series || []).some((s: any) => s.tmdb_id === tmdbId);
  } catch {
    return false;
  }
}
