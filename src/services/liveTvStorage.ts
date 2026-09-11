import { LiveChannel, INITIAL_LIVE_CHANNELS } from '../data/liveChannels';
import { resolveChannelLogo } from '../utils/channelLogos';

const FAVORITES_KEY = 'play_infinity_live_favorites';
const CUSTOM_CHANNELS_KEY = 'play_infinity_custom_channels';
const LAST_CHANNEL_KEY = 'play_infinity_last_channel_id';

export function getFavoriteChannelIds(): string[] {
  try {
    const raw = localStorage.getItem(FAVORITES_KEY);
    return raw ? JSON.parse(raw) : ['premiere-clubes', 'ge-fast', 'globo'];
  } catch {
    return ['premiere-clubes', 'ge-fast'];
  }
}

export function toggleFavoriteChannel(channelId: string): boolean {
  const favs = getFavoriteChannelIds();
  const exists = favs.includes(channelId);
  const updated = exists ? favs.filter(id => id !== channelId) : [...favs, channelId];
  try {
    localStorage.setItem(FAVORITES_KEY, JSON.stringify(updated));
  } catch (err) {
    console.warn('Erro ao salvar canal favorito:', err);
  }
  return !exists;
}

export function getCustomChannels(): LiveChannel[] {
  try {
    const raw = localStorage.getItem(CUSTOM_CHANNELS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveCustomChannel(channel: LiveChannel): void {
  const current = getCustomChannels();
  const index = current.findIndex(c => c.id === channel.id);
  let updated: LiveChannel[];
  if (index >= 0) {
    updated = [...current];
    updated[index] = channel;
  } else {
    updated = [channel, ...current];
  }
  try {
    localStorage.setItem(CUSTOM_CHANNELS_KEY, JSON.stringify(updated));
  } catch (err) {
    console.warn('Erro ao salvar canal customizado:', err);
  }
}

export function deleteCustomChannel(channelId: string): void {
  const current = getCustomChannels();
  const updated = current.filter(c => c.id !== channelId);
  try {
    localStorage.setItem(CUSTOM_CHANNELS_KEY, JSON.stringify(updated));
  } catch (err) {
    console.warn('Erro ao excluir canal:', err);
  }
}

export function getAllChannels(): LiveChannel[] {
  const custom = getCustomChannels();
  // Se algum custom tiver o mesmo id que o inicial, o custom sobrescreve
  const customIds = new Set(custom.map(c => c.id));
  const initialFiltered = INITIAL_LIVE_CHANNELS.filter(c => !customIds.has(c.id));
  const combined = [...custom, ...initialFiltered];

  // Garante que todo canal tenha logo válido e sem links quebrados
  return combined.map(channel => ({
    ...channel,
    logo: resolveChannelLogo(channel)
  }));
}

export function getLastPlayedChannelId(): string | null {
  try {
    return localStorage.getItem(LAST_CHANNEL_KEY);
  } catch {
    return null;
  }
}

export function setLastPlayedChannelId(channelId: string): void {
  try {
    localStorage.setItem(LAST_CHANNEL_KEY, channelId);
  } catch {}
}

/**
 * Analisa e extrai canais a partir de texto de lista M3U/M3U8
 */
export function parseM3UPlaylist(m3uContent: string): LiveChannel[] {
  const lines = m3uContent.split('\n');
  const results: LiveChannel[] = [];
  let currentMeta: Partial<LiveChannel> | null = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    if (line.startsWith('#EXTINF:')) {
      const nameMatch = line.match(/,(.+)$/);
      const name = nameMatch ? nameMatch[1].trim() : 'Canal Importado';
      const logoMatch = line.match(/tvg-logo="([^"]+)"/);
      const groupMatch = line.match(/group-title="([^"]+)"/);

      let category: LiveChannel['category'] = 'Variedades';
      const grp = (groupMatch ? groupMatch[1] : '').toLowerCase();
      const n = name.toLowerCase();

      if (grp.includes('sport') || grp.includes('esporte') || n.includes('premiere') || n.includes('sport') || n.includes('espn') || n.includes('futebol')) {
        category = 'Esportes';
      } else if (grp.includes('aberta') || grp.includes('aberto') || n.includes('globo') || n.includes('sbt') || n.includes('record') || n.includes('band')) {
        category = 'TV Aberta';
      } else if (grp.includes('news') || grp.includes('noticia') || n.includes('news') || n.includes('jornal')) {
        category = 'Notícias';
      } else if (grp.includes('filme') || grp.includes('cinema') || grp.includes('serie') || n.includes('telecine') || n.includes('hbo') || n.includes('filme')) {
        category = 'Filmes & Séries';
      } else if (grp.includes('infantil') || grp.includes('kids') || grp.includes('anime') || grp.includes('desenho')) {
        category = 'Infantil';
      }

      currentMeta = {
        name,
        category,
        logo: logoMatch ? logoMatch[1] : '',
        quality: n.includes('1080') || n.includes('fhd') ? '1080p' : '720p',
        isCustom: true
      };
    } else if (line.startsWith('http') && currentMeta) {
      const id = 'custom-' + Math.random().toString(36).substring(2, 9);
      results.push({
        id,
        name: currentMeta.name || 'Canal M3U',
        category: currentMeta.category || 'Variedades',
        logo: currentMeta.logo || 'https://images.unsplash.com/photo-1593784991095-a205069470b6?w=320&auto=format&fit=crop&q=80',
        currentProgram: 'Transmissão Ao Vivo Importada M3U',
        quality: currentMeta.quality || 'HD',
        isCustom: true,
        servers: [
          {
            name: 'Servidor Proxy (Recomendado)',
            url: line,
            isProxy: true
          },
          {
            name: 'Servidor Direto',
            url: line,
            isProxy: false
          }
        ]
      });
      currentMeta = null;
    }
  }

  return results;
}
