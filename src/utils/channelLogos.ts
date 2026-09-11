// Base de dados e mapeamento confiável de logotipos de canais de TV brasileiros e internacionais

// SVG Data URIs otimizados e independentes de rede para canais sem CDN externa estável
const CAZETV_SVG = `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 100" width="240" height="100"><rect width="240" height="100" rx="16" fill="%23FFE600"/><text x="120" y="52" font-family="-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif" font-weight="900" font-style="italic" font-size="44" fill="%23111111" text-anchor="middle" letter-spacing="-1.5">CAZÉ</text><rect x="85" y="64" width="70" height="24" rx="6" fill="%23111111"/><text x="120" y="81" font-family="-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif" font-weight="900" font-size="16" fill="%23FFE600" text-anchor="middle" letter-spacing="4">TV</text></svg>`;

const FIFA_PLUS_SVG = `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 100" width="240" height="100"><rect width="240" height="100" rx="16" fill="%230B1426"/><text x="96" y="62" font-family="-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif" font-weight="900" font-size="42" fill="%23FFFFFF" text-anchor="middle" letter-spacing="2">FIFA</text><text x="170" y="64" font-family="-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif" font-weight="900" font-size="52" fill="%2300FF87" text-anchor="middle">+</text></svg>`;

const BMC_NEWS_SVG = `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 100" width="240" height="100"><rect width="240" height="100" rx="16" fill="%2308182B"/><text x="120" y="50" font-family="-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif" font-weight="900" font-size="34" fill="%23FFFFFF" text-anchor="middle" letter-spacing="1">BM%26C</text><rect x="65" y="62" width="110" height="22" rx="4" fill="%23EA580C"/><text x="120" y="77" font-family="-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif" font-weight="900" font-size="14" fill="%23FFFFFF" text-anchor="middle" letter-spacing="4">NEWS</text></svg>`;

// Mapas de logotipos confiáveis (GitHub tv-logos raw com CORS liberado ou fontes oficiais diretas)
const RELIABLE_CHANNEL_LOGOS: Record<string, string> = {
  // Premiere
  'premiere': 'https://raw.githubusercontent.com/tv-logo/tv-logos/main/countries/brazil/premiere-br.png',
  'premiere-clubes': 'https://raw.githubusercontent.com/tv-logo/tv-logos/main/countries/brazil/premiere-br.png',
  'premiere-1': 'https://raw.githubusercontent.com/tv-logo/tv-logos/main/countries/brazil/premiere-br.png',
  'premiere-2': 'https://raw.githubusercontent.com/tv-logo/tv-logos/main/countries/brazil/premiere-br.png',
  'premiere-3': 'https://raw.githubusercontent.com/tv-logo/tv-logos/main/countries/brazil/premiere-br.png',
  'premiere-4': 'https://raw.githubusercontent.com/tv-logo/tv-logos/main/countries/brazil/premiere-br.png',
  'premiere-5': 'https://raw.githubusercontent.com/tv-logo/tv-logos/main/countries/brazil/premiere-br.png',
  'premiere-6': 'https://raw.githubusercontent.com/tv-logo/tv-logos/main/countries/brazil/premiere-br.png',
  'premiere-7': 'https://raw.githubusercontent.com/tv-logo/tv-logos/main/countries/brazil/premiere-br.png',
  'premiere-8': 'https://raw.githubusercontent.com/tv-logo/tv-logos/main/countries/brazil/premiere-br.png',

  // SporTV
  'sportv': 'https://raw.githubusercontent.com/tv-logo/tv-logos/main/countries/brazil/sportv-br.png',
  'sportv-hd': 'https://raw.githubusercontent.com/tv-logo/tv-logos/main/countries/brazil/sportv-br.png',
  'sportv-2': 'https://raw.githubusercontent.com/tv-logo/tv-logos/main/countries/brazil/sportv2-br.png',
  'sportv-3': 'https://raw.githubusercontent.com/tv-logo/tv-logos/main/countries/brazil/sportv3-br.png',

  // ESPN
  'espn': 'https://raw.githubusercontent.com/tv-logo/tv-logos/main/countries/united-states/espn-us.png',
  'espn-brasil': 'https://raw.githubusercontent.com/tv-logo/tv-logos/main/countries/united-states/espn-us.png',
  'espn-4': 'https://raw.githubusercontent.com/tv-logo/tv-logos/main/countries/brazil/espn-4-br.png',

  // Globo Esporte / ge
  'ge-fast': 'https://raw.githubusercontent.com/tv-logo/tv-logos/main/countries/brazil/ge-tv-br.png',
  'ge': 'https://raw.githubusercontent.com/tv-logo/tv-logos/main/countries/brazil/ge-tv-br.png',

  // CazéTV e FIFA
  'cazetv': CAZETV_SVG,
  'fifa-plus': FIFA_PLUS_SVG,

  // N Sports & Red Bull
  'n-sports': 'https://i.imgur.com/7QnJojr.png',
  'red-bull-tv': 'https://images.pluto.tv/channels/5e7cb84a172a0f0007da69e4/colorLogoPNG.png',
  'pluto-esportes': 'https://images.pluto.tv/channels/5f32d2db0af67400077f29c4/colorLogoPNG.png',

  // TV Aberta
  'globo': 'https://raw.githubusercontent.com/tv-logo/tv-logos/main/countries/brazil/globo-br.png',
  'rede-globo': 'https://raw.githubusercontent.com/tv-logo/tv-logos/main/countries/brazil/globo-br.png',
  'sbt': 'https://raw.githubusercontent.com/tv-logo/tv-logos/main/countries/brazil/sbt-br.png',
  'record-tv': 'https://raw.githubusercontent.com/tv-logo/tv-logos/main/countries/brazil/record-br.png',
  'record': 'https://raw.githubusercontent.com/tv-logo/tv-logos/main/countries/brazil/record-br.png',
  'band': 'https://raw.githubusercontent.com/tv-logo/tv-logos/main/countries/brazil/band-br.png',
  'bandeirantes': 'https://raw.githubusercontent.com/tv-logo/tv-logos/main/countries/brazil/band-br.png',

  // Notícias
  'record-news': 'https://raw.githubusercontent.com/tv-logo/tv-logos/main/countries/brazil/record-news-br.png',
  'bmc-news': BMC_NEWS_SVG,
  'cnn-brasil': 'https://raw.githubusercontent.com/tv-logo/tv-logos/main/countries/brazil/cnn-brasil-br.png',
  'globo-news': 'https://raw.githubusercontent.com/tv-logo/tv-logos/main/countries/brazil/globo-news-br.png',
  'jovem-pan-news': 'https://raw.githubusercontent.com/tv-logo/tv-logos/main/countries/brazil/jovem-pan-news-br.png',

  // Filmes, Séries & Outros
  'adrenalina-pura': 'https://images.pluto.tv/channels/61b790b985706b00072cb797/colorLogoPNG.png',
  'filmes-suspense': 'https://images.pluto.tv/channels/5f171d3442a0500007362f22/colorLogoPNG.png',
  'comedy-central': 'https://raw.githubusercontent.com/tv-logo/tv-logos/main/countries/united-states/comedy-central-us.png',
  'anime-tv': 'https://images.pluto.tv/channels/5f4fb4cf605ddf000748e16f/colorLogoPNG.png',
  'kids-junior': 'https://images.pluto.tv/channels/5ffcc5130fd98c0007f2e216/colorLogoPNG.png',
};

/**
 * Normaliza e resolve o logotipo mais confiável para um canal de TV.
 * Substitui links instáveis da Wikimedia (que causam HTTP 400 por bloqueio de hotlink)
 * por fontes permanentes com suporte a CORS.
 */
export function resolveChannelLogo(channel: { id?: string; name: string; logo?: string; category?: string }): string {
  const nameNorm = channel.name.toLowerCase().trim();
  const idNorm = (channel.id || '').toLowerCase().trim();

  // 1. Verificação por ID direto
  if (idNorm && RELIABLE_CHANNEL_LOGOS[idNorm]) {
    return RELIABLE_CHANNEL_LOGOS[idNorm];
  }

  // 2. Se o logo atual é da Wikimedia (muito comum dar erro 400 / 403), devemos substituir
  const isWikimedia = channel.logo && (
    channel.logo.includes('upload.wikimedia.org') || 
    channel.logo.includes('wikipedia.org') ||
    channel.logo.includes('colorLogoSVG_') // SVG do pluto que dá 404
  );

  // 3. Verificação por correspondência de Nome
  if (nameNorm.includes('premiere')) {
    return RELIABLE_CHANNEL_LOGOS['premiere'];
  }
  if (nameNorm.includes('sportv 2') || nameNorm.includes('sportv2')) {
    return RELIABLE_CHANNEL_LOGOS['sportv-2'];
  }
  if (nameNorm.includes('sportv 3') || nameNorm.includes('sportv3')) {
    return RELIABLE_CHANNEL_LOGOS['sportv-3'];
  }
  if (nameNorm.includes('sportv')) {
    return RELIABLE_CHANNEL_LOGOS['sportv'];
  }
  if (nameNorm.includes('espn')) {
    return RELIABLE_CHANNEL_LOGOS['espn'];
  }
  if (nameNorm.includes('cazé') || nameNorm.includes('caze')) {
    return CAZETV_SVG;
  }
  if (nameNorm.includes('globo esporte') || nameNorm.includes('ge fast') || nameNorm.startsWith('ge ')) {
    return RELIABLE_CHANNEL_LOGOS['ge-fast'];
  }
  if (nameNorm.includes('fifa')) {
    return FIFA_PLUS_SVG;
  }
  if (nameNorm.includes('n sports') || nameNorm.includes('nsports')) {
    return RELIABLE_CHANNEL_LOGOS['n-sports'];
  }
  if (nameNorm.includes('red bull')) {
    return RELIABLE_CHANNEL_LOGOS['red-bull-tv'];
  }
  if (nameNorm.includes('pluto tv esportes') || nameNorm.includes('pluto esportes')) {
    return RELIABLE_CHANNEL_LOGOS['pluto-esportes'];
  }
  if (nameNorm.includes('sbt')) {
    return RELIABLE_CHANNEL_LOGOS['sbt'];
  }
  if (nameNorm.includes('record news')) {
    return RELIABLE_CHANNEL_LOGOS['record-news'];
  }
  if (nameNorm.includes('record')) {
    return RELIABLE_CHANNEL_LOGOS['record-tv'];
  }
  if (nameNorm.includes('bandeirantes') || nameNorm.includes('band')) {
    return RELIABLE_CHANNEL_LOGOS['band'];
  }
  if (nameNorm.includes('globo')) {
    return RELIABLE_CHANNEL_LOGOS['globo'];
  }
  if (nameNorm.includes('bm&c') || nameNorm.includes('bmc')) {
    return BMC_NEWS_SVG;
  }
  if (nameNorm.includes('comedy central')) {
    return RELIABLE_CHANNEL_LOGOS['comedy-central'];
  }
  if (nameNorm.includes('adrenalina')) {
    return RELIABLE_CHANNEL_LOGOS['adrenalina-pura'];
  }
  if (nameNorm.includes('suspense')) {
    return RELIABLE_CHANNEL_LOGOS['filmes-suspense'];
  }
  if (nameNorm.includes('anime')) {
    return RELIABLE_CHANNEL_LOGOS['anime-tv'];
  }
  if (nameNorm.includes('kids') || nameNorm.includes('junior')) {
    return RELIABLE_CHANNEL_LOGOS['kids-junior'];
  }

  // 4. Se não é da Wikimedia e tem logo fornecido, mantém o original
  if (channel.logo && !isWikimedia) {
    return channel.logo;
  }

  // 5. Fallback padrão: retorna vazio para o componente ChannelLogo renderizar a capa estilizada
  return '';
}

/**
 * Retorna as iniciais ou nome abreviado do canal para exibir no badge gráfico
 */
export function getChannelBadgeInfo(name: string, category?: string) {
  const cleanName = name
    .replace(/\s+(HD|FHD|4K|SD|Ao Vivo|Live|Plus|\+)\b/gi, '')
    .trim();

  // Cores temáticas de fundo baseadas no canal ou categoria
  const lower = cleanName.toLowerCase();
  
  if (lower.includes('premiere')) {
    return {
      text: 'PREMIERE',
      short: 'PFC',
      bgGradient: 'from-emerald-900 to-green-700',
      borderColor: 'border-emerald-500/50',
      textColor: 'text-emerald-300',
      iconType: 'sports'
    };
  }
  if (lower.includes('sportv')) {
    return {
      text: cleanName.toUpperCase(),
      short: 'STV',
      bgGradient: 'from-blue-950 via-slate-900 to-indigo-900',
      borderColor: 'border-blue-500/40',
      textColor: 'text-blue-300',
      iconType: 'sports'
    };
  }
  if (lower.includes('espn')) {
    return {
      text: 'ESPN',
      short: 'ESPN',
      bgGradient: 'from-red-950 to-neutral-900',
      borderColor: 'border-red-500/50',
      textColor: 'text-red-400',
      iconType: 'sports'
    };
  }
  if (lower.includes('globo')) {
    return {
      text: 'GLOBO',
      short: 'GLOBO',
      bgGradient: 'from-sky-950 via-slate-900 to-blue-900',
      borderColor: 'border-sky-500/40',
      textColor: 'text-sky-300',
      iconType: 'tv'
    };
  }
  if (lower.includes('sbt')) {
    return {
      text: 'SBT',
      short: 'SBT',
      bgGradient: 'from-amber-950 via-yellow-950 to-neutral-900',
      borderColor: 'border-amber-500/40',
      textColor: 'text-amber-300',
      iconType: 'tv'
    };
  }
  if (lower.includes('band')) {
    return {
      text: 'BAND',
      short: 'BAND',
      bgGradient: 'from-green-950 to-emerald-900',
      borderColor: 'border-green-500/40',
      textColor: 'text-green-300',
      iconType: 'tv'
    };
  }
  if (lower.includes('record')) {
    return {
      text: 'RECORD',
      short: 'REC',
      bgGradient: 'from-slate-950 to-blue-950',
      borderColor: 'border-blue-400/30',
      textColor: 'text-blue-200',
      iconType: 'tv'
    };
  }

  // Genérico por categoria
  if (category === 'Esportes') {
    return {
      text: cleanName,
      short: cleanName.slice(0, 4).toUpperCase(),
      bgGradient: 'from-orange-950 via-neutral-900 to-amber-950',
      borderColor: 'border-orange-500/40',
      textColor: 'text-orange-400',
      iconType: 'sports'
    };
  }
  if (category === 'Notícias') {
    return {
      text: cleanName,
      short: cleanName.slice(0, 4).toUpperCase(),
      bgGradient: 'from-red-950 via-neutral-900 to-slate-900',
      borderColor: 'border-red-500/40',
      textColor: 'text-red-300',
      iconType: 'news'
    };
  }
  if (category === 'Filmes & Séries') {
    return {
      text: cleanName,
      short: cleanName.slice(0, 4).toUpperCase(),
      bgGradient: 'from-purple-950 via-neutral-900 to-indigo-950',
      borderColor: 'border-purple-500/40',
      textColor: 'text-purple-300',
      iconType: 'movie'
    };
  }
  if (category === 'Infantil') {
    return {
      text: cleanName,
      short: cleanName.slice(0, 4).toUpperCase(),
      bgGradient: 'from-pink-950 via-neutral-900 to-purple-950',
      borderColor: 'border-pink-500/40',
      textColor: 'text-pink-300',
      iconType: 'kids'
    };
  }

  return {
    text: cleanName,
    short: cleanName.slice(0, 4).toUpperCase(),
    bgGradient: 'from-neutral-900 to-neutral-950',
    borderColor: 'border-white/10',
    textColor: 'text-neutral-300',
    iconType: 'tv'
  };
}
