/**
 * [LiveServerSweepGuard] Testes de guarda da varredura profunda, detecção de codecs
 * de áudio (AAC vs AC-3), descarte de hosts quebrados e priorização de servidores com som.
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');

const root = path.resolve(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf-8');

const { inspectTsSegment, DEAD_EMBED_HOSTS } = require('../scripts/audit-live-servers-deep.cjs');

// ---------------------------------------------------------------------------
// 1. Parser de segmentos MPEG-TS e classificação de codecs de áudio/vídeo
// ---------------------------------------------------------------------------
test('inspectTsSegment: identifica stream AVC (0x1b) e AAC (0x0f) como áudio web-compatível', () => {
  // Constrói um pacote TS sintético (PAT + PMT) com AVC e AAC
  const buf = Buffer.alloc(188 * 3, 0xff);

  // Pacote 1: PAT (PID 0)
  buf[0] = 0x47; // sync byte
  buf[1] = 0x40; // payload unit start + PID 0 msb
  buf[2] = 0x00; // PID 0 lsb
  buf[3] = 0x10; // no adaptation, payload only
  buf[4] = 0x00; // pointer field
  buf[5] = 0x00; // table id: PAT
  buf[6] = 0xb0; // section syntax + len msb
  buf[7] = 0x0d; // section len (13 bytes)
  buf[8] = 0x00; buf[9] = 0x01; // transport_stream_id
  buf[10] = 0xc1; // version, current_next
  buf[11] = 0x00; buf[12] = 0x00; // section 0 of 0
  buf[13] = 0x00; buf[14] = 0x01; // program 1
  buf[15] = 0xe1; buf[16] = 0x00; // PMT PID = 0x100 (256)
  // CRC dummy
  buf[17] = 0x00; buf[18] = 0x00; buf[19] = 0x00; buf[20] = 0x00;

  // Pacote 2: PMT (PID 0x100 = 256)
  const p2 = 188;
  buf[p2] = 0x47;
  buf[p2 + 1] = 0x41; buf[p2 + 2] = 0x00; // payload start + PID 0x100
  buf[p2 + 3] = 0x10;
  buf[p2 + 4] = 0x00; // pointer
  buf[p2 + 5] = 0x02; // table id: PMT
  buf[p2 + 6] = 0xb0; buf[p2 + 7] = 0x17; // section len (23 bytes)
  buf[p2 + 8] = 0x00; buf[p2 + 9] = 0x01; // program 1
  buf[p2 + 10] = 0xc1;
  buf[p2 + 11] = 0x00; buf[p2 + 12] = 0x00;
  buf[p2 + 13] = 0xe1; buf[p2 + 14] = 0x00; // PCR PID
  buf[p2 + 15] = 0xf0; buf[p2 + 16] = 0x00; // program_info_length = 0

  // ES 1: Video H.264 (0x1b) PID 0x101
  buf[p2 + 17] = 0x1b; // streamType
  buf[p2 + 18] = 0xe1; buf[p2 + 19] = 0x01; // elemPid 0x101
  buf[p2 + 20] = 0xf0; buf[p2 + 21] = 0x00; // esInfoLen = 0

  // ES 2: Audio AAC ADTS (0x0f) PID 0x102
  buf[p2 + 22] = 0x0f; // streamType
  buf[p2 + 23] = 0xe1; buf[p2 + 24] = 0x02; // elemPid 0x102
  buf[p2 + 25] = 0xf0; buf[p2 + 26] = 0x00; // esInfoLen = 0

  const info = inspectTsSegment(buf);
  assert.equal(info.hasVideo, true);
  assert.equal(info.videoCodec, 'H.264 / AVC');
  assert.equal(info.hasAudio, true);
  assert.equal(info.audioCodec, 'AAC');
  assert.equal(info.webPlayableAudio, true);
});

test('inspectTsSegment: identifica Dolby AC-3 (0x81) e marca como incompatível com browsers comuns', () => {
  const buf = Buffer.alloc(188 * 3, 0xff);
  buf[0] = 0x47; buf[1] = 0x40; buf[2] = 0x00; buf[3] = 0x10; buf[4] = 0x00;
  buf[5] = 0x00; buf[6] = 0xb0; buf[7] = 0x0d;
  buf[8] = 0x00; buf[9] = 0x01; buf[10] = 0xc1; buf[11] = 0x00; buf[12] = 0x00;
  buf[13] = 0x00; buf[14] = 0x01; buf[15] = 0xe1; buf[16] = 0x00;

  const p2 = 188;
  buf[p2] = 0x47; buf[p2 + 1] = 0x41; buf[p2 + 2] = 0x00; buf[p2 + 3] = 0x10; buf[p2 + 4] = 0x00;
  buf[p2 + 5] = 0x02; buf[p2 + 6] = 0xb0; buf[p2 + 7] = 0x17;
  buf[p2 + 8] = 0x00; buf[p2 + 9] = 0x01; buf[p2 + 10] = 0xc1; buf[p2 + 11] = 0x00; buf[p2 + 12] = 0x00;
  buf[p2 + 13] = 0xe1; buf[p2 + 14] = 0x00; buf[p2 + 15] = 0xf0; buf[p2 + 16] = 0x00;

  // Video H.264
  buf[p2 + 17] = 0x1b; buf[p2 + 18] = 0xe1; buf[p2 + 19] = 0x01; buf[p2 + 20] = 0xf0; buf[p2 + 21] = 0x00;
  // Audio AC-3 (0x81)
  buf[p2 + 22] = 0x81; buf[p2 + 23] = 0xe1; buf[p2 + 24] = 0x02; buf[p2 + 25] = 0xf0; buf[p2 + 26] = 0x00;

  const info = inspectTsSegment(buf);
  assert.equal(info.hasVideo, true);
  assert.equal(info.hasAudio, true);
  assert.equal(info.audioCodec, 'AC-3');
  assert.equal(info.webPlayableAudio, false); // AC-3 não toca no Chrome sem transcodificação
});

// ---------------------------------------------------------------------------
// 2. Proteção contra hosts e alvos quebrados no proxy
// ---------------------------------------------------------------------------
test('guard: DEAD_OR_BROKEN_EMBED_HOSTS cobre sporturbo, nossoplayer, dadinho e localhost70', () => {
  const proxySrc = read('server/services/embedPlayerProxy.ts');
  assert.ok(proxySrc.includes('sporturbo.link'), 'cobre sporturbo');
  assert.ok(proxySrc.includes('nossoplayeronlinehd.ink'), 'cobre nossoplayer');
  assert.ok(proxySrc.includes('dadinhodetapioca.fun'), 'cobre dadinho');
  assert.ok(proxySrc.includes('localhost70.xyz'), 'cobre localhost70');
});

test('guard: probeEmbedPlayer identifica alvos quebrados e marca alive=false', () => {
  const proxySrc = read('server/services/embedPlayerProxy.ts');
  assert.ok(proxySrc.includes('isBrokenTarget'), 'filtra alvos quebrados');
  assert.ok(proxySrc.includes('localhost70.xyz'), 'bloqueia localhost70 (ad-wall branco)');
  assert.ok(proxySrc.includes('dadinhodetapioca.fun'), 'bloqueia dadinho (403)');
});

// ---------------------------------------------------------------------------
// 3. Priorização de áudio AAC no catálogo e LivePlayerModal
// ---------------------------------------------------------------------------
test('guard: externalCatalog promove fonte com AAC para Servidor 1 quando Saimo é AC-3', () => {
  const catSrc = read('server/services/externalCatalog.ts');
  assert.ok(catSrc.includes('embedcanaisdetv.xyz'), 'detecta fonte com áudio AAC');
  assert.ok(catSrc.includes('firstIsSaimo'), 'avalia se o primeiro é Saimo');
  assert.ok(catSrc.includes('isAc3LikelyChannel'), 'restringe promoção aos canais onde Saimo usa AC-3');
  assert.ok(catSrc.includes('Servidor ${idx + 1}'), 'renumera servidores sequencialmente');
});

test('guard: LivePlayerModal filtra visualmente servidores dead do menu e corrige catch', () => {
  const modalSrc = read('src/components/LivePlayerModal.tsx');
  assert.ok(modalSrc.includes("embedStatus[idx] !== 'dead' || selectedServerIndex === idx"), 'deleta servidores mortos do menu');
  assert.ok(modalSrc.includes("[idx]: 'dead'"), 'catch do probe define status como dead');
});
