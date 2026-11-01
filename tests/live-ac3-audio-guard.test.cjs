/**
 * [Live AC-3] Guard do detector de áudio não-decodificável (AC-3/E-AC-3).
 *
 * Contexto real: o Servidor 1 do Premiere (fonte Saimo, 45.185.11.126:8000)
 * tem vídeo H.264 + áudio Dolby AC-3 5.1 (384 kb/s) confirmado por ffprobe.
 * Navegadores não decodificam AC-3 via MSE/hls.js → o vídeo tocava SEM SOM
 * (hls.js degrada removendo a track). E o master do Saimo NÃO declara
 * CODECS — o codec só aparece no demux do segmento (BUFFER_CODECS).
 *
 * Guards (fonte do LivePlayerModal.tsx):
 *  1. Veredito no MANIFEST_PARSED (codecs declarados no master)
 *  2. Veredito no BUFFER_CODECS (codec descoberto no demux — caso Saimo)
 *  3. isTypeSupported dinâmico (sem lista hard-coded de codecs "maus")
 *  4. Múltiplos servidores → switchToNextServer com motivo + aviso visível
 *  5. Servidor único → NÃO chama switchToNextServer (loop infinito de reload
 *     se o canal só tem o servidor AC-3) — avisa e segue mudo
 *  6. Aviso transitório (pill) renderizado no player + cleanup do timer
 *  7. Veredito único por fonte (flags manifest/demux não reagem duas vezes)
 *  8. Detecção de vídeo sem track de áudio no demux (áudio AC-3 descartado pelo TSDemuxer)
 *  9. Fallback em runtime no timeupdate (webkitAudioDecodedByteCount e mozHasAudio)
 * 10. switchToNextServer prioriza servidores não 'dead'
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const src = fs.readFileSync(
  path.join(__dirname, '..', 'src', 'components', 'LivePlayerModal.tsx'),
  'utf-8'
);

test('guard: veredito de codec de áudio no MANIFEST_PARSED (codecs declarados)', () => {
  assert.ok(src.includes('audioVerdict.manifest'), 'flag de veredito do manifesto existe');
  const manifestBlock = src.slice(
    src.indexOf('Codec declarado no master'),
    src.indexOf('Assegura volume inicial')
  );
  assert.ok(manifestBlock.includes('checkAudioCodecSupport(declared'), 'manifesto chama o veredito');
  assert.ok(manifestBlock.includes("return; // vai trocar de servidor"), 'aborta o play quando vai trocar');
});

test('guard: veredito de codec no BUFFER_CODECS (demux — master do Saimo sem CODECS)', () => {
  assert.ok(src.includes('Hls.Events.BUFFER_CODECS'), 'listener de BUFFER_CODECS registrado');
  const demuxBlock = src.slice(
    src.indexOf('Codec descoberto no DEMUX'),
    src.indexOf("hls.on(Hls.Events.MANIFEST_PARSED")
  );
  assert.ok(demuxBlock.includes('tracks?.audio'), 'lê a track de áudio do evento');
  assert.ok(demuxBlock.includes('audioTrack.codec'), 'lê codec descoberto no demux');
  assert.ok(demuxBlock.includes('levelCodec'), 'também considera levelCodec declarado');
  assert.ok(demuxBlock.includes('audioVerdict.demux'), 'veredito único (não repete por fragmento)');
});

test('guard: detecção de vídeo sem track de áudio no BUFFER_CODECS (áudio descartado pelo TSDemuxer)', () => {
  const demuxBlock = src.slice(
    src.indexOf('Codec descoberto no DEMUX'),
    src.indexOf("hls.on(Hls.Events.MANIFEST_PARSED")
  );
  assert.ok(
    demuxBlock.includes('videoTrack && !audioTrack && !audiovideoTrack'),
    'detecta vídeo inicializado sem nenhuma track de áudio decodificada'
  );
  assert.ok(
    demuxBlock.includes("checkAudioCodecSupport(['ac-3'], 'demux (áudio descartado/sem suporte)')"),
    'dispara veredito com codec ac-3'
  );
});

test('guard: fallback de segurança em runtime no timeupdate (zero bytes decodificados)', () => {
  const timeUpdateBlock = src.slice(
    src.indexOf('const handleTimeUpdate = () => {'),
    src.indexOf('const handleCanPlay = () => {')
  );
  assert.ok(
    timeUpdateBlock.includes('webkitAudioDecodedByteCount === 0'),
    'checa webkitAudioDecodedByteCount após reprodução'
  );
  assert.ok(
    timeUpdateBlock.includes('mozHasAudio === false'),
    'checa mozHasAudio para compatibilidade Firefox'
  );
  assert.ok(
    timeUpdateBlock.includes('switchToNextServer'),
    'troca de servidor se som for detectado ausente em runtime'
  );
});

test('guard: switchToNextServer prioriza fontes com sinal online (não dead)', () => {
  const switchBlock = src.slice(
    src.indexOf('const switchToNextServer = useCallback'),
    src.indexOf('// Recuperação automática em caso de queda')
  );
  assert.ok(
    switchBlock.includes("embedStatus[candidate] !== 'dead'"),
    'pula servidores sabidamente sem sinal ao alternar'
  );
});

test('guard: suporte testado dinamicamente via MediaSource.isTypeSupported', () => {
  assert.ok(src.includes('isTypeSupported?.(`audio/mp4; codecs="${codec}"`)'), 'testa suporte no próprio aparelho');
  assert.ok(src.includes('catch {'), 'erro no teste não decide nada (não bloqueia reprodução)');
});

test('guard: múltiplos servidores → troca automática com aviso visível', () => {
  const policy = src.slice(
    src.indexOf('const checkAudioCodecSupport'),
    src.indexOf('hls.on(Hls.Events.MANIFEST_LOADED')
  );
  assert.ok(policy.includes('channel.servers.length > 1'), 'só troca com alternativa real');
  assert.ok(policy.includes('switchToNextServer(`áudio ${codecList}'), 'troca com motivo identificável');
  assert.ok(policy.includes('showServerNotice'), 'aviso visível ao usuário');
});

test('guard: servidor único NÃO troca (evita loop infinito de reload)', () => {
  const policy = src.slice(
    src.indexOf('const checkAudioCodecSupport'),
    src.indexOf('hls.on(Hls.Events.MANIFEST_LOADED')
  );
  const singleBlock = policy.slice(policy.indexOf('} else {'));
  assert.ok(!singleBlock.includes('switchToNextServer'), 'ramo single-server não chama switchToNextServer');
  assert.ok(singleBlock.includes('transmissão sem som'), 'avisa que seguirá sem som');
  assert.ok(singleBlock.includes('15000'), 'aviso persiste mais tempo no caso único');
});

test('guard: pill de aviso renderizada no player e timer limpo no desmonte', () => {
  assert.ok(src.includes('{serverNotice && !isEmbedStream &&'), 'pill condicional no player (não em embeds)');
  assert.ok(src.includes('serverNoticeTimer.current) clearTimeout(serverNoticeTimer.current)'), 'cleanup do timer');
  assert.ok(/useEffect\(\(\) => \{\s*return \(\) => \{\s*if \(serverNoticeTimer\.current\)/.test(src), 'cleanup no desmonte do modal');
});
