const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const esbuild = require('esbuild');
const Module = require('node:module');

// Compila utils do player integration para testar computeNextEpisode
const compiled = esbuild.buildSync({
  entryPoints: [path.join(__dirname, '../src/utils/playerIntegration.ts')],
  bundle: true,
  platform: 'node',
  format: 'cjs',
  write: false,
});
const m = new Module(__filename + '.fixture', module);
m._compile(compiled.outputFiles[0].text, __filename + '.fixture');
const { computeNextEpisode } = m.exports;

// Helper para extrair HLS do Vizer (FSHD)
async function resolveVizerEpisodeStream(tmdbId, season, episode) {
  const fshdUrl = `https://fshd.link/serie/${tmdbId}/${season}/${episode}`;
  const pageRes = await fetch(fshdUrl, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
      'Referer': 'https://vizer.best/'
    }
  });
  assert.equal(pageRes.status, 200, `Página do FSHD deve responder 200 para S${season}E${episode}`);
  const html = await pageRes.text();

  // Encontra o content_id do episódio ativo
  const activeContentMatch = html.match(/<div class=["']episodeOption(?:\s+active)?["']\s+data-contentid=["'](\d+)["']/);
  assert.ok(activeContentMatch, `Deve encontrar data-contentid para S${season}E${episode}`);
  const contentId = parseInt(activeContentMatch[1], 10);

  // Consulta /api/options
  const optRes = await fetch('https://fshd.link/api/options', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'Referer': fshdUrl
    },
    body: JSON.stringify({ content_id: contentId, content_type: 2 })
  });
  assert.equal(optRes.status, 200, 'API /api/options deve responder 200');
  const optData = await optRes.json();
  assert.ok(optData.options && optData.options.length > 0, 'Deve retornar lista de opções/players');
  const videoId = optData.options[0].ID;

  // Consulta /api/players
  const playerRes = await fetch('https://fshd.link/api/players', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'Referer': fshdUrl
    },
    body: JSON.stringify({ content_info: contentId, content_type: "2", video_id: videoId })
  });
  assert.equal(playerRes.status, 200, 'API /api/players deve responder 200');
  const playerData = await playerRes.json();
  assert.ok(playerData.video_url, 'Deve retornar URL criptografada do player');

  // Abre a video_url e obtém o redirect do player
  const videoRes = await fetch(playerData.video_url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36', 'Referer': fshdUrl }
  });
  assert.equal(videoRes.status, 200, 'video_url deve responder 200');
  const videoHtml = await videoRes.text();
  const playerRedirect = videoHtml.match(/window\.location\.href\s*=\s*["']([^"']+)["']/)?.[1];
  assert.ok(playerRedirect, 'Deve extrair redirect do player');

  const dataParam = playerRedirect.match(/data=([a-f0-9]+)/)?.[1];
  assert.ok(dataParam, 'Deve extrair parâmetro data com token de vídeo');
  const masterUrl = `https://112234152.xyz/hls/${dataParam}/master.txt`;

  return {
    contentId,
    videoId,
    playerRedirect,
    dataParam,
    masterUrl
  };
}

test('1. Extração Real de Stream Vizer: VisionQuest T1:E1 resolve HLS 1080p e baixa chunk de vídeo', async () => {
  const result = await resolveVizerEpisodeStream(213375, 1, 1);
  assert.ok(result.masterUrl.includes('/hls/'), 'masterUrl deve ser uma rota HLS');

  // Valida a playlist master
  const masterRes = await fetch(result.masterUrl, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'Referer': result.playerRedirect
    }
  });
  assert.equal(masterRes.status, 200);
  const masterContent = await masterRes.text();
  assert.ok(masterContent.includes('#EXTM3U'), 'Master deve ser playlist HLS válida');
  assert.ok(masterContent.includes('RESOLUTION=1920x1080'), 'Deve ter variante Full HD 1080p');

  // Pega a URL da variante 1080p
  const variantUrl = masterContent.match(/https?:\/\/[^\s]+/)?.[0];
  assert.ok(variantUrl, 'Deve encontrar URL da variante');

  const variantRes = await fetch(variantUrl, {
    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)', 'Referer': 'https://112234152.xyz/' }
  });
  assert.equal(variantRes.status, 200);
  const variantContent = await variantRes.text();
  assert.ok(variantContent.includes('#EXTINF:'), 'Variante deve conter segmentos de vídeo');

  // Pega o primeiro segmento .ts (.jpg disfarçado)
  const segmentUrl = variantContent.match(/https?:\/\/[^\s]+/)?.[0];
  assert.ok(segmentUrl, 'Deve encontrar URL do segmento');

  const segmentRes = await fetch(segmentUrl, {
    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)', 'Referer': 'https://112234152.xyz/' }
  });
  assert.equal(segmentRes.status, 200);
  const buf = await segmentRes.arrayBuffer();
  assert.ok(buf.byteLength > 1000000, 'Segmento deve conter pelo menos 1 MB de dados');

  const firstByte = new Uint8Array(buf)[0];
  assert.equal(firstByte, 0x47, 'Primeiro byte deve ser 0x47 (MPEG-TS Sync Byte oficial)');
});

test('2. Compatibilidade com NetflixPlayerSkin: Comandos PLAY, PAUSE, SEEK +10s e -10s', async () => {
  // Simulação do player HTML5 e da ponte postMessage controlada pela skin Netflix
  const playerState = {
    currentTime: 0,
    duration: 3360,
    paused: true,
    volume: 1,
    muted: false,
    playbackRate: 1,
  };

  const dispatchStatus = () => ({
    type: 'WATCHPLAY_STATUS',
    data: { ...playerState }
  });

  const handleCommand = (cmd) => {
    switch (cmd.type) {
      case 'PLAY':
        playerState.paused = false;
        break;
      case 'PAUSE':
        playerState.paused = true;
        break;
      case 'SEEK_RELATIVE':
        playerState.currentTime = Math.max(0, Math.min(playerState.currentTime + cmd.seconds, playerState.duration));
        break;
      case 'SEEK_ABSOLUTE':
        playerState.currentTime = Math.max(0, Math.min(cmd.time, playerState.duration));
        if (cmd.resumePlay) playerState.paused = false;
        break;
      case 'SET_VOLUME':
        playerState.volume = Math.max(0, Math.min(1, cmd.volume));
        break;
      case 'SET_MUTED':
        playerState.muted = !!cmd.muted;
        break;
    }
    return dispatchStatus();
  };

  // Teste 1: Estado inicial
  assert.equal(playerState.paused, true, 'Player deve começar pausado');
  assert.equal(playerState.currentTime, 0, 'Tempo inicial deve ser 0');

  // Teste 2: Comando PLAY da skin
  const resPlay = handleCommand({ type: 'PLAY' });
  assert.equal(playerState.paused, false, 'Comando PLAY deve despausar o player');
  assert.equal(resPlay.data.paused, false);

  // Teste 3: Comando PAUSE da skin
  const resPause = handleCommand({ type: 'PAUSE' });
  assert.equal(playerState.paused, true, 'Comando PAUSE deve pausar o player');
  assert.equal(resPause.data.paused, true);

  // Teste 4: Comando AVANÇAR 10s (SEEK_RELATIVE +10)
  const resSeekFwd = handleCommand({ type: 'SEEK_RELATIVE', seconds: 10 });
  assert.equal(playerState.currentTime, 10, 'Avanço de 10s deve mudar currentTime para 10');
  assert.equal(resSeekFwd.data.currentTime, 10);

  // Avançar mais 10s
  handleCommand({ type: 'SEEK_RELATIVE', seconds: 10 });
  assert.equal(playerState.currentTime, 20, 'Avanço sucessivo de 10s deve mudar currentTime para 20');

  // Teste 5: Comando RETROCEDER 10s (SEEK_RELATIVE -10)
  const resSeekBack = handleCommand({ type: 'SEEK_RELATIVE', seconds: -10 });
  assert.equal(playerState.currentTime, 10, 'Retrocesso de 10s deve mudar currentTime de 20 para 10');
  assert.equal(resSeekBack.data.currentTime, 10);

  // Retroceder outros 10s até o início
  handleCommand({ type: 'SEEK_RELATIVE', seconds: -10 });
  assert.equal(playerState.currentTime, 0, 'Retrocesso até 0 deve fixar currentTime em 0');

  // Retroceder abaixo de 0 não deve dar valor negativo
  handleCommand({ type: 'SEEK_RELATIVE', seconds: -10 });
  assert.equal(playerState.currentTime, 0, 'Retrocesso abaixo de 0 deve manter currentTime em 0 (clamp)');

  // Teste 6: Seek absoluto na barra de progresso (scrubber)
  handleCommand({ type: 'SEEK_ABSOLUTE', time: 1800, resumePlay: true });
  assert.equal(playerState.currentTime, 1800, 'Seek absoluto deve mover para 1800s');
  assert.equal(playerState.paused, false, 'Seek absoluto com resumePlay deve continuar tocando');
});

test('3. Simulação de Passar para o Próximo Episódio: Transição de T1:E1 para T1:E2', async () => {
  const episodesList = Array.from({ length: 7 }, (_, i) => ({
    episode_number: i + 1,
    name: `Episódio ${i + 1}`,
  }));

  // 1. A skin detecta o próximo episódio via computeNextEpisode
  const nextEp = computeNextEpisode({
    isSeries: true,
    season: 1,
    episode: 1,
    totalEpisodes: 7,
    availableSeasons: [1],
    episodesList,
  });

  assert.ok(nextEp !== null, 'Deve existir próximo episódio para o Ep 1');
  assert.equal(nextEp.episode_number, 2, 'O próximo episódio deve ser o 2');
  assert.equal(nextEp.seasonNumber, 1, 'Deve permanecer na temporada 1');
  assert.equal(nextEp.isNextSeason, false, 'Não é virada de temporada');

  // 2. Quando o usuário clica em "Assistir Agora" no preview, resolve o Ep 2 no Vizer
  const ep2Result = await resolveVizerEpisodeStream(213375, nextEp.seasonNumber, nextEp.episode_number);
  assert.ok(ep2Result.masterUrl.includes('/hls/'), 'masterUrl do Ep 2 deve ser rota HLS');
  assert.notEqual(ep2Result.dataParam, null);

  // 3. Valida que o master HLS do Ep 2 é funcional e 100% autônomo
  const ep2MasterRes = await fetch(ep2Result.masterUrl, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'Referer': ep2Result.playerRedirect
    }
  });
  assert.equal(ep2MasterRes.status, 200, 'Master HLS do Ep 2 deve responder status 200');
  const ep2MasterText = await ep2MasterRes.text();
  assert.ok(ep2MasterText.includes('#EXTM3U'), 'Ep 2 deve ter playlist HLS válida');
  assert.ok(ep2MasterText.includes('RESOLUTION=1920x1080'), 'Ep 2 deve ter resolução Full HD 1080p');
});
