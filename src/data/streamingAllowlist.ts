/**
 * ============================================================================
 * PLAY INFINITY - ALLOWLIST COMPARTILHADA DE DOMÍNIOS DE STREAMING
 * ============================================================================
 *
 * MORFOLOGIA (ADR-0002 — ver docs/adr/0002-allowlist-vs-blacklist.md):
 * Este arquivo é a ÚNICA fonte da verdade das listas de domínios
 * autorizados, compartilhada entre:
 *   - server/utils/helpers.ts (validateSafeUrl / isAllowedLiveStreamingDomain)
 *   - src/data/serverBlacklist.ts (hierarquia allowlist > keys da blacklist)
 *
 * Antes da extração (02/11/2026) as listas viviam só em helpers.ts
 * (server-only) e a blacklist de src/data/ não podia consultá-las — o que
 * permitiu o falso positivo histórico em que a chave curta "embedplay"
 * bloqueava o CDN homologado embedplayer2.xyz (95% do HLS do catálogo
 * Saimo morto) sem nenhum conflito aparente entre as duas listas.
 *
 * HIERARQUIA DE DECISÃO (isServerBlacklisted):
 *   1. Host EXATAMENTE nesta allowlist  >  KEYS da blacklist (strings)
 *      (protege domínios homologados de colisões acidentais de substring)
 *   2. REGEX/patterns deliberados da blacklist  >  esta allowlist
 *      (banimento explícito do dono nunca é sobrescrito — ex. superflixapi.top
 *      segue bloqueado pelo regex de família /superflix[a-z0-9-]*\.(top|...)/
 *      embora conste na lista VOD abaixo por legado)
 *
 * Para banir um domínio que está aqui: adicione um REGEX de família à entrada
 * correspondente em serverBlacklist.ts E remova-o daqui.
 */

export const ALLOWED_STREAMING_DOMAINS: string[] = [
  "watchplay.shop",
  "v1.watchplay.shop",
  "playerflix.ink",
  "playerflix.biz",
  "myembed.biz",
  "superflixapi.top",
  "embedder.net",
  "warezcdn.net",
  "warezcdn.com",
  "encontrei.info",
  "themoviedb.org",
  "tmdb.org",
  "youtube.com",
  "youtu.be",
  "unsplash.com",
  "image.tmdb.org",
  "vixsrc.to",
  "vix-content.net",
  "videasy.to",
  "videasy.net",
  "vidlink.pro",
  "2embed.cc",
  "autoembed.cc",
  "player.autoembed.cc",
  "speedracelight.com",
  "animesonlinecc.to",
  "blogger.com",
  "mixdrop.co",
  "mixdrop.to",
  "mixdrop.ch",
  "mixdrop.bz",
  "mixdrop.vc",
  "mixdrop.ag",
  "mxdrop.to",
  "mxdrop.top",
  "mxcontent.net",
  "nixplay.lat",
  "nixplay.com",
  "nixplay.net",
  "streamtape.com",
  "tapecontent.net",
  "strtape.tech",
  "streamtape.net",
  "streamtape.cc",
  "streamtape.site",
  "tapenation.com",
  "tape.xxx",
  "doodstream.com",
  "dood.to",
  "dood.so",
  "dood.ws",
  "dood.pm",
  "dood.wf",
  "dood.la",
  "dood.sh",
  "doodcdn.co",
  "doods.pro",
  "playmogo.com",
  "cloudatacdn.com",
  "ds2play.com",
  "do0od.com",
  "dood.watch",
  "animesdigital.org",
  "api.anivideo.net",
  "cdn-s01.mywallpaper-4k-image.net",
  "cdn-sv01.maximaimg.online"
];

export const ALLOWED_LIVE_STREAMING_DOMAINS: string[] = [
  "up.kiwi",
  "wurl.com",
  "jmp2.uk",
  "amagi.tv",
  "otteravision.com",
  "jmvstream.com",
  "cdntvms.com.br",
  "pluto.tv",
  "bolodechocolate.fit",
  "akamaihd.net",
  "cloudfront.net",
  "fastly.net",
  "qzz.io",
  "watchplay.shop",
  "v1.watchplay.shop",
  "vixsrc.to",
  "vixsrc.net",
  "vix-content.net",
  "embedplayer2.xyz",
  "embedplayer.site",
  "112234152.xyz",
  "00000410.xyz",
  "venom.00000410.xyz",
  "fshd.link",
  "vizer.best",
  "cdn8embed.xyz",
  "playerembedcanais.site",
  "cdn10embed.xyz",
  "cdn13embed.xyz",
  "embedcanaisdetv.xyz",
  "s25-cloudfront-net.lat",
  "playerflix.ink",
  "playerflix.biz",
  "myembed.biz",
  "embedder.net",
  "warezcdn.net",
  "warezcdn.com",
  "186.233.184.65",
  "186.233.118.171",
  "198.13.16.163",
  "186.233.118.163",
  "195.178.110.110",
  "170.83.16.50",
  "45.162.64.114",
  "170.83.49.66",
  "181.78.197.59",
  "190.83.2.182",
  ...ALLOWED_STREAMING_DOMAINS
];

/**
 * Host EXATAMENTE na allowlist (composta live+VOD).
 * Usado pela hierarquia da blacklist: domínio homologado vence KEYS.
 */
export function isExactAllowedStreamingDomain(hostname: string): boolean {
  if (!hostname || typeof hostname !== "string") return false;
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, "").trim();
  return ALLOWED_LIVE_STREAMING_DOMAINS.includes(host);
}

/**
 * Host exato OU subdomínio de um domínio da allowlist.
 * Mesma semântica usada por isAllowedLiveStreamingDomain (helpers.ts).
 */
export function isAllowedStreamingDomainHost(hostname: string): boolean {
  if (!hostname || typeof hostname !== "string") return false;
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, "").trim();
  return ALLOWED_LIVE_STREAMING_DOMAINS.some(
    (domain) => host === domain || host.endsWith("." + domain)
  );
}
