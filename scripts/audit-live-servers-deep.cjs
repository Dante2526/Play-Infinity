#!/usr/bin/env node
/**
 * scripts/audit-live-servers-deep.cjs
 *
 * Varredura profunda de servidores de canais ao vivo (HLS diretos e Embeds).
 * - Testa resposta HTTP e reprodução de chunks de mídia reais.
 * - Analisa Elementary Streams em pacotes MPEG-TS (188 bytes):
 *   - Detecta presença de stream de vídeo (AVC/H.264, HEVC/H.265).
 *   - Detecta e classifica codec de áudio:
 *     - AAC (0x0F, 0x11): Totalmente compatível e audível em navegadores web.
 *     - AC-3 / E-AC-3 (0x81, 0x84, 0x87): Incompatível com Chrome/MSE (toca mudo sem transcodificação).
 *     - NONE: Vídeo mudo.
 * - Para fontes Embed:
 *   - Identifica hosts mortos ou bloqueados (sporturbo, nossoplayer, dadinho, localhost70).
 *   - Inspeciona streams m3u8 embutidos e valida reprodução real.
 */

const fs = require('fs');
const path = require('path');

const DEAD_EMBED_HOSTS = new Set([
  'sporturbo.link',
  'nossoplayeronlinehd.ink',
  'dadinhodetapioca.fun',
  'localhost70.xyz',
  'rdembed.sbs',
  'vaiagora.vip',
  'vivlar.me',
  's13-s1001604.lat',
  's25-cloudfront-net.lat',
]);

/**
 * Analisa um buffer de segmento MPEG-TS e extrai os codecs de vídeo e áudio.
 */
function inspectTsSegment(buf) {
  if (!Buffer.isBuffer(buf) || buf.length < 188) {
    return { hasVideo: false, hasAudio: false, videoCodec: 'NONE', audioCodec: 'NONE', streams: [] };
  }

  let pmtPid = -1;
  const streams = [];

  for (let i = 0; i <= buf.length - 188; i += 188) {
    if (buf[i] !== 0x47) continue;
    const pid = ((buf[i + 1] & 0x1f) << 8) | buf[i + 2];
    const payloadStart = (buf[i + 1] & 0x40) !== 0;
    const adaptation = (buf[i + 3] >> 4) & 0x03;
    let offset = i + 4;
    if (adaptation === 2 || adaptation === 3) {
      offset += 1 + buf[offset];
    }
    if (offset >= i + 188) continue;

    // PAT: PID 0
    if (pid === 0 && payloadStart) {
      const pointer = buf[offset++];
      offset += pointer;
      if (offset < i + 188 && buf[offset] === 0x00) {
        const sectionLen = ((buf[offset + 1] & 0x0f) << 8) | buf[offset + 2];
        const end = Math.min(offset + 3 + sectionLen - 4, i + 188);
        let p = offset + 8;
        while (p < end) {
          const progNum = (buf[p] << 8) | buf[p + 1];
          const pPid = ((buf[p + 2] & 0x1f) << 8) | buf[p + 3];
          if (progNum !== 0) {
            pmtPid = pPid;
            break;
          }
          p += 4;
        }
      }
    }

    // PMT
    if (pmtPid !== -1 && pid === pmtPid && payloadStart) {
      let p = offset;
      const pointer = buf[p++];
      p += pointer;
      if (p < i + 188 && buf[p] === 0x02) {
        const sectionLen = ((buf[p + 1] & 0x0f) << 8) | buf[p + 2];
        const progInfoLen = ((buf[p + 10] & 0x0f) << 8) | buf[p + 11];
        p += 12 + progInfoLen;
        const end = Math.min(offset + 1 + pointer + 3 + sectionLen - 4, i + 188);
        while (p + 5 <= end) {
          const streamType = buf[p];
          const elemPid = ((buf[p + 1] & 0x1f) << 8) | buf[p + 2];
          const esInfoLen = ((buf[p + 3] & 0x0f) << 8) | buf[p + 4];
          streams.push({ streamType, elemPid });
          p += 5 + esInfoLen;
        }
        break;
      }
    }
  }

  let hasVideo = false;
  let hasAudio = false;
  let videoCodec = 'NONE';
  let audioCodec = 'NONE';

  for (const s of streams) {
    if (s.streamType === 0x1b) {
      hasVideo = true;
      videoCodec = 'H.264 / AVC';
    } else if (s.streamType === 0x24) {
      hasVideo = true;
      videoCodec = 'H.265 / HEVC';
    } else if (s.streamType === 0x01 || s.streamType === 0x02) {
      hasVideo = true;
      videoCodec = 'MPEG-2 Video';
    } else if (s.streamType === 0x0f || s.streamType === 0x11) {
      hasAudio = true;
      audioCodec = 'AAC';
    } else if (s.streamType === 0x03 || s.streamType === 0x04) {
      hasAudio = true;
      audioCodec = 'MP3/MPEG';
    } else if (s.streamType === 0x81) {
      hasAudio = true;
      audioCodec = 'AC-3';
    } else if (s.streamType === 0x84 || s.streamType === 0x87) {
      hasAudio = true;
      audioCodec = 'E-AC-3';
    }
  }

  return {
    hasVideo,
    hasAudio,
    videoCodec,
    audioCodec,
    webPlayableAudio: audioCodec === 'AAC' || audioCodec === 'MP3/MPEG',
    streams
  };
}

/**
 * Testa um stream HLS direto baixando o manifest e o primeiro chunk de mídia.
 */
async function auditHlsStream(m3u8Url, referer = '') {
  try {
    const res = await fetch(m3u8Url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
        ...(referer ? { 'Referer': referer } : {})
      },
      signal: AbortSignal.timeout(6000)
    });
    if (!res.ok) {
      return { alive: false, error: `HTTP ${res.status}` };
    }
    const manifest = await res.text();
    if (!manifest.includes('#EXTM3U')) {
      return { alive: false, error: 'Manifest HLS inválido' };
    }

    // Procura linhas de segmento ou variante
    const lines = manifest.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    let segmentUrl = null;

    for (const line of lines) {
      if (line.startsWith('#')) continue;
      // Encontrou URL ou path
      if (line.includes('.ts') || line.includes('.m4s') || line.includes('/hls/') || line.includes('.m3u8')) {
        try {
          segmentUrl = new URL(line, m3u8Url).href;
          break;
        } catch {}
      }
    }

    if (!segmentUrl) {
      return { alive: true, hasVideo: true, hasAudio: false, audioCodec: 'UNKNOWN', webPlayableAudio: false, note: 'Sem segmentos aparentes' };
    }

    // Se for sub-playlist (master), baixa a sub-playlist
    if (segmentUrl.includes('.m3u8')) {
      const subRes = await fetch(segmentUrl, {
        headers: { 'User-Agent': 'Mozilla/5.0', ...(referer ? { 'Referer': referer } : {}) },
        signal: AbortSignal.timeout(5000)
      });
      const subManifest = await subRes.text();
      const subLines = subManifest.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
      for (const l of subLines) {
        if (!l.startsWith('#') && (l.includes('.ts') || l.includes('.m4s') || !l.includes('.m3u8'))) {
          segmentUrl = new URL(l, segmentUrl).href;
          break;
        }
      }
    }

    // Baixa o primeiro segmento (até 512KB) para inspeção de pacotes
    const segRes = await fetch(segmentUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0',
        'Range': 'bytes=0-524287',
        ...(referer ? { 'Referer': referer } : {})
      },
      signal: AbortSignal.timeout(6000)
    });

    if (!segRes.ok && segRes.status !== 206) {
      return { alive: false, error: `Falha ao baixar segmento: HTTP ${segRes.status}` };
    }

    const segBuf = Buffer.from(await segRes.arrayBuffer());
    const info = inspectTsSegment(segBuf);

    return {
      alive: info.hasVideo || segBuf.length > 5000,
      hasVideo: info.hasVideo,
      hasAudio: info.hasAudio,
      videoCodec: info.videoCodec,
      audioCodec: info.audioCodec,
      webPlayableAudio: info.webPlayableAudio,
      segmentBytes: segBuf.length
    };
  } catch (err) {
    return { alive: false, error: err.message };
  }
}

/**
 * Testa um servidor Embed MinhaTela.
 */
async function auditEmbedServer(url) {
  try {
    const u = new URL(url);
    const host = u.hostname.toLowerCase();
    if (DEAD_EMBED_HOSTS.has(host)) {
      return { alive: false, error: `Host marcado como morto na blocklist: ${host}` };
    }

    // meuplayeronlinehd.com: se aponta para localhost70.xyz, gera tela branca com ad
    if (host.includes('meuplayeronlinehd.com')) {
      return { alive: false, error: 'meuplayeronlinehd aponta para localhost70 (tela branca)' };
    }

    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
      signal: AbortSignal.timeout(6000)
    });
    if (!res.ok) {
      return { alive: false, error: `HTTP ${res.status}` };
    }

    const html = await res.text();
    // Procura streams m3u8 diretos embutidos
    const m3u8Match = html.match(/https?:\/\/[^"']+\.m3u8[^"']*/i);
    if (m3u8Match) {
      const hlsAudit = await auditHlsStream(m3u8Match[0], url);
      return {
        alive: hlsAudit.alive,
        hasVideo: hlsAudit.hasVideo,
        hasAudio: hlsAudit.hasAudio,
        audioCodec: hlsAudit.audioCodec,
        webPlayableAudio: hlsAudit.webPlayableAudio,
        embeddedM3u8: m3u8Match[0]
      };
    }

    // Clappr / Shaka / JWPlayer
    const hasPlayer = /jwplayer|clappr|videojs|shaka|hls\.js/i.test(html);
    const hasError = /error\.txt|bloqueado|disabled/i.test(html);

    if (hasPlayer && !hasError && html.length > 3000) {
      return {
        alive: true,
        hasVideo: true,
        hasAudio: true, // player de terceiro com controle de áudio próprio
        audioCodec: 'EMBED_INTERNAL',
        webPlayableAudio: true
      };
    }

    return { alive: false, error: 'Player não identificado ou página incompleta' };
  } catch (err) {
    return { alive: false, error: err.message };
  }
}

/**
 * Realiza a auditoria de um servidor qualquer.
 */
async function auditServer(server) {
  if (server.isEmbed) {
    return auditEmbedServer(server.url);
  }
  // Se for rota de proxy local /api/external-channel, testamos via VPS Oracle
  let fullUrl = server.url;
  if (fullUrl.startsWith('/')) {
    fullUrl = `https://play-infinity.stream${fullUrl}`;
  }
  return auditHlsStream(fullUrl);
}

module.exports = {
  DEAD_EMBED_HOSTS,
  inspectTsSegment,
  auditHlsStream,
  auditEmbedServer,
  auditServer
};

// Se executado diretamente pela CLI:
if (require.main === module) {
  (async () => {
    console.log('--- Iniciando Varredura Profunda de Servidores (SporTV 3 HD) ---');
    const servers = [
      { name: 'Servidor 1 (Saimo)', url: '/api/external-channel?name=SporTV%203', isEmbed: false },
      { name: 'Servidor 2 (MPHD)', url: 'https://meuplayeronlinehd.com/myplay/watch.html?id=sportv3', isEmbed: true },
      { name: 'Servidor 3 (MPHD2)', url: 'https://meuplayeronlinehd.com/myplay/watch.html?id=sportv3-2', isEmbed: true },
      { name: 'Servidor 4 (SPT)', url: 'https://sporturbo.link/player/canais/ampv-sportv3', isEmbed: true },
      { name: 'Servidor 5 (RDE)', url: 'https://v1.rdse.rest/canal/sportv3', isEmbed: true },
      { name: 'Servidor 6 (EMB)', url: 'https://ww5.embedtv.lat/sportv3', isEmbed: true },
      { name: 'Servidor 7 (EMB2)', url: 'https://embedcanaisdetv.xyz/e/index.php?canal=sportv3', isEmbed: true },
      { name: 'Servidor 8 (NSS)', url: 'https://nossoplayeronlinehd.ink/tv/sportv3', isEmbed: true },
      { name: 'Servidor 9 (RDC)', url: 'https://rdcanais.net/sportv3', isEmbed: true },
      { name: 'Servidor 10 (RDC2)', url: 'https://rdcanais.net/sportv3alternativo', isEmbed: true },
      { name: 'Servidor 11 (RDCHD)', url: 'https://redecanaistv.pk/player3/ch.php?categoria=live&canal=sportv3', isEmbed: true },
      { name: 'Servidor 12 (RDCSD)', url: 'https://redecanaistv.pk/player3/ch.php?categoria=live&canal=sportv3-sd', isEmbed: true }
    ];

    const results = [];
    for (const s of servers) {
      process.stdout.write(`Auditando ${s.name}... `);
      const res = await auditServer(s);
      results.push({ ...s, ...res });
      if (res.alive) {
        console.log(`[VIVO] Vídeo: ${res.videoCodec || 'Sim'}, Áudio: ${res.audioCodec} (Web: ${res.webPlayableAudio ? 'SIM' : 'NÃO'})`);
      } else {
        console.log(`[MORTO/DELETAR] Motivo: ${res.error}`);
      }
    }

    console.log('\n--- Resultado da Limpeza ---');
    const aliveServers = results.filter(r => r.alive);
    console.log(`Total inicial: ${servers.length} servidores`);
    console.log(`Sobreviventes vivos: ${aliveServers.length} servidores`);
    console.log(`Deletados: ${servers.length - aliveServers.length} servidores`);

    // Prioriza servidores com áudio compatível para web (AAC)
    aliveServers.sort((a, b) => {
      if (a.webPlayableAudio && !b.webPlayableAudio) return -1;
      if (!a.webPlayableAudio && b.webPlayableAudio) return 1;
      return 0;
    });

    console.log('\nNova Ordem de Servidores (Priorizando Áudio com Som Imediato):');
    aliveServers.forEach((s, i) => {
      console.log(`  Servidor ${i + 1}: ${s.name} (Áudio: ${s.audioCodec})`);
    });
  })();
}
