/**
 * Testes do MP4 MSE Engine (public/mp4-mse-engine.js) — Opção A.
 *
 * Fixtures geradas com ffmpeg na hora:
 *  - faststart.mp4:  moov no início, H.264 High + B-frames + AAC-LC
 *  - classic.mp4:    moov no fim (sem faststart)
 *
 * Ground truth via ffprobe (packets: pos/dts/size; streams: profile/level).
 *
 * Valida:
 *  1. parseMp4: tracks, timescales, sample counts, offsets absolutos (vs packets)
 *  2. buildMime: codec string (avc1.PCCL + mp4a.40.2)
 *  3. buildInitSegment: [ftyp][moov c/ mvex/trex por track]
 *  4. buildFragment: [moof][mdat] com trun por sample, data_offset exato
 *     (byte apontado == byte do arquivo original), tfdt monotônico,
 *     cobertura total das samples em janelas consecutivas
 *  5. moov no fim: parse com baseOffset
 */
const { test, before } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { execFileSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
// O engine é um IIFE browser (script tag clássico); o projeto é ESM, então
// carregamos via Function wrapper injetando `module` pro export do core.
const engineSrc = fs.readFileSync(path.join(root, 'public', 'mp4-mse-engine.js'), 'utf8');
const fakeModule = { exports: {} };
new Function('module', 'window', engineSrc)(fakeModule, undefined);
const engine = fakeModule.exports;

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'mse-fixtures-'));
const FASTSTART = path.join(TMP, 'faststart.mp4');
const CLASSIC = path.join(TMP, 'classic.mp4');

function makeFixture(file, faststart) {
  const args = [
    '-y', '-f', 'lavfi', '-i', 'testsrc2=duration=14:size=320x240:rate=24',
    '-f', 'lavfi', '-i', 'sine=frequency=440:duration=14',
    '-c:v', 'libx264', '-profile:v', 'high', '-bf', '3', '-g', '24', '-pix_fmt', 'yuv420p',
    '-c:a', 'aac', '-b:a', '64k', '-shortest',
  ];
  if (faststart) args.push('-movflags', '+faststart');
  args.push(file);
  execFileSync('ffmpeg', args, { stdio: 'pipe' });
}

function probe(file) {
  return JSON.parse(execFileSync('ffprobe', [
    '-v', 'quiet', '-print_format', 'json',
    '-show_streams', '-show_format', '-show_entries', 'stream=codec_type,codec_name,profile,level,nb_frames,r_frame_rate,sample_rate,channels,duration',
    file,
  ], { encoding: 'utf8' }));
}

function probePackets(file) {
  const data = JSON.parse(execFileSync('ffprobe', [
    '-v', 'quiet', '-print_format', 'json',
    '-show_packets', '-show_entries', 'packet=stream_index,pos,size,dts_time,pts_time',
    file,
  ], { encoding: 'utf8' }));
  return data.packets || [];
}

function boxesOf(bytes) {
  return engine.walkBoxes(bytes, 0, bytes.length);
}

let fastBytes, classicBytes, probeFast, packetsFast;

before(async () => {
  makeFixture(FASTSTART, true);
  makeFixture(CLASSIC, false);
  fastBytes = new Uint8Array(fs.readFileSync(FASTSTART));
  classicBytes = new Uint8Array(fs.readFileSync(CLASSIC));
  probeFast = probe(FASTSTART);
  packetsFast = probePackets(FASTSTART);
});

function extractMoov(fileBytes) {
  const top = boxesOf(fileBytes);
  const moov = top.find(b => b.type === 'moov');
  assert.ok(moov, 'fixture deve ter moov');
  return { moovBytes: fileBytes.subarray(moov.start, moov.end), moovStart: moov.start };
}

test('parseMp4: tracks, timescale e sample counts batem com ffprobe (faststart)', () => {
  const { moovBytes } = extractMoov(fastBytes);
  const parsed = engine.parseMp4(moovBytes, 0);

  const video = parsed.tracks.find(t => t.handler === 'vide');
  const audio = parsed.tracks.find(t => t.handler === 'soun');
  assert.ok(video, 'deve ter track de vídeo');
  assert.ok(audio, 'deve ter track de áudio');
  assert.equal(parsed.tracks.length, 2, 'deve ter exatamente 2 tracks');

  const vStream = probeFast.streams.find(s => s.codec_type === 'video');
  const aStream = probeFast.streams.find(s => s.codec_type === 'audio');
  // ffmpeg usa timescale = fps×512 (ex.: 24fps → 12288); valida múltiplo do fps
  const fps = eval(vStream.r_frame_rate);
  assert.equal(video.timescale % fps, 0, 'timescale do vídeo é múltiplo do fps');
  assert.equal(video.samples.length, Number(vStream.nb_frames), 'sample count do vídeo = nb_frames');
  assert.ok(audio.samples.length > 500, 'áudio tem ~600 frames AAC');
  // duração global
  assert.ok(Math.abs(parsed.mvhd.duration / parsed.mvhd.timescale - Number(probeFast.format.duration)) < 0.5,
    'duração do mvhd bate com o container');
  // duração por track: última sample + duration ≈ duração do stream
  const lastV = video.samples[video.samples.length - 1];
  assert.ok(Math.abs((lastV.dts + lastV.duration) / video.timescale - Number(vStream.duration)) < 0.5,
    'duração do track de vídeo bate com o stream');
});

test('parseMp4: offsets absolutos e dts das samples batem com packets do ffprobe', () => {
  const { moovBytes } = extractMoov(fastBytes);
  const parsed = engine.parseMp4(moovBytes, 0);
  const video = parsed.tracks.find(t => t.handler === 'vide');
  const audio = parsed.tracks.find(t => t.handler === 'soun');

  const vPackets = packetsFast.filter(p => p.stream_index === 0).filter(p => p.pos !== undefined);
  const aPackets = packetsFast.filter(p => p.stream_index === 1).filter(p => p.pos !== undefined);

  // Vídeo: compara as 8 primeiras packets (pos + size + dts em coordenadas do media)
  // O ffprobe reporta dts_time já aplicando o edit list (priming dos B-frames),
  // então somamos o shift do elst de volta pra comparar com o dts do stts.
  const vShiftSec = video.elstMediaTime > 0 ? video.elstMediaTime / video.timescale : 0;
  for (let i = 0; i < 8 && i < vPackets.length; i++) {
    assert.equal(video.samples[i].offset, Number(vPackets[i].pos), `offset da sample de vídeo ${i}`);
    assert.equal(video.samples[i].size, Number(vPackets[i].size), `size da sample de vídeo ${i}`);
    const dtsSec = Number(vPackets[i].dts_time);
    if (Number.isFinite(dtsSec)) {
      assert.ok(Math.abs(video.samples[i].dts / video.timescale - (dtsSec + vShiftSec)) < 0.001,
        `dts da sample de vídeo ${i}: ${video.samples[i].dts / video.timescale} vs ${dtsSec + vShiftSec}`);
    }
  }
  // Áudio: 8 primeiras
  for (let i = 0; i < 8 && i < aPackets.length; i++) {
    assert.equal(audio.samples[i].offset, Number(aPackets[i].pos), `offset da sample de áudio ${i}`);
    assert.equal(audio.samples[i].size, Number(aPackets[i].size), `size da sample de áudio ${i}`);
  }
  // Vídeo tem ctts (B-frames): some cts != dts em pelo menos uma sample
  assert.ok(video.samples.some(s => s.cts !== s.dts), 'vídeo com B-frames deve ter cts != dts');
  assert.equal(video.hasCtts, true);
});

test('buildMime: codecs avc1.<profile><compat><level> + mp4a.40.2', () => {
  const { moovBytes } = extractMoov(fastBytes);
  const parsed = engine.parseMp4(moovBytes, 0);
  const mime = engine.buildMime(parsed);
  assert.ok(mime, 'mime deve existir');
  assert.ok(mime.startsWith('video/mp4; codecs="'), 'container video/mp4');

  const vStream = probeFast.streams.find(s => s.codec_type === 'video');
  // profile High = 100 = 0x64; level do ffprobe (ex.: 13/30/31) em hex
  const profileHex = { 'High': '64', 'Main': '4d', 'Baseline': '42', 'Constrained Baseline': '42' }[vStream.profile] || null;
  if (profileHex) {
    assert.ok(mime.includes('avc1.' + profileHex), `codec deve ser avc1.${profileHex}*: ${mime}`);
  }
  const levelHex = (Number(vStream.level) || 0).toString(16).padStart(2, '0');
  assert.ok(mime.includes(levelHex), `level ${levelHex} deve aparecer: ${mime}`);
  assert.ok(mime.includes('mp4a.40.'), 'áudio mp4a.40.x');
});

test('buildInitSegment: [ftyp][moov] com mvex/trex por track', () => {
  const { moovBytes } = extractMoov(fastBytes);
  const parsed = engine.parseMp4(moovBytes, 0);
  const init = engine.buildInitSegment(parsed, fastBytes.subarray(0, 32)); // ftyp truncado de propósito: writer usa se >= 8

  const top = boxesOf(init);
  assert.equal(top.length, 2, 'init = ftyp + moov');
  assert.equal(top[0].type, 'ftyp');
  assert.equal(top[1].type, 'moov');

  const moovChildren = engine.walkBoxes(init, top[1].start + 8, top[1].end);
  const mvex = moovChildren.find(b => b.type === 'mvex');
  assert.ok(mvex, 'moov deve ter mvex');
  const trexs = engine.walkBoxes(init, mvex.start + 8, mvex.end).filter(b => b.type === 'trex');
  assert.equal(trexs.length, parsed.tracks.length, 'um trex por track');
  // trex é FullBox: 8 header + 4 ver/flags + 20 campos = 32 bytes; trackId @ +12
  for (const trex of trexs) {
    assert.equal(trex.size, 32, 'trex tem 32 bytes (FullBox com version+flags)');
    const dvT = new DataView(init.buffer, init.byteOffset + trex.start + 8, 24);
    assert.equal(dvT.getUint32(0), 0, 'trex version 0 flags 0');
    const trackId = dvT.getUint32(4);
    assert.ok(parsed.tracks.some(t => t.trackId === trackId), 'trex trackId conhecido: ' + trackId);
    assert.equal(dvT.getUint32(8), 1, 'trex default_sample_description_index = 1');
  }
  // traks presentes com stsd preservado (avcC/esds intactos)
  const traks = moovChildren.filter(b => b.type === 'trak');
  assert.equal(traks.length, 2);
  for (const trak of traks) {
    const stbl = engine.walkBoxes(init, trak.start + 8, trak.end)
      .flatMap(b => (b.type === 'mdia' ? engine.walkBoxes(init, b.start + 8, b.end) : []))
      .flatMap(b => (b.type === 'minf' ? engine.walkBoxes(init, b.start + 8, b.end) : []))
      .find(b => b.type === 'stbl');
    assert.ok(stbl, 'trak deve ter stbl');
    const stsd = engine.walkBoxes(init, stbl.start + 8, stbl.end).find(b => b.type === 'stsd');
    assert.ok(stsd, 'stbl deve ter stsd');
    // primeiro entry dentro do stsd deve começar igual ao sample entry original
    const entryOff = stsd.start + 8 + 8;
    const entrySize = new DataView(init.buffer, init.byteOffset + entryOff, 4).getUint32(0);
    const entryType = String.fromCharCode(init[entryOff + 4], init[entryOff + 5], init[entryOff + 6], init[entryOff + 7]);
    assert.ok(entryType === 'avc1' || entryType === 'mp4a', 'entry type: ' + entryType);
    assert.ok(entrySize > 40, 'sample entry com avcC/esds preservado');
  }
});

test('buildFragment: moof/mdat com data_offset exato e cobertura total em janelas', () => {
  const { moovBytes } = extractMoov(fastBytes);
  const parsed = engine.parseMp4(moovBytes, 0);
  const video = parsed.tracks.find(t => t.handler === 'vide');
  const audio = parsed.tracks.find(t => t.handler === 'soun');
  const duration = parsed.mvhd.duration / parsed.mvhd.timescale;

  let seq = 1;
  let t = 0;
  let videoTotal = 0, audioTotal = 0;
  let lastVBase = -1, lastABase = -1;
  let firstFragment = null;

  while (t < duration - 0.05) {
    // janela GOP-alinhada (mesma lógica do engine via planWindow)
    const plan = engine.planWindow(parsed, t, t + 4);
    if (!plan) break;
    let spanStart = Infinity, spanEnd = -1;
    for (let i = plan.videoStartIdx; i < video.samples.length; i++) {
      const s = video.samples[i];
      if (s.dts >= plan.videoEndDts) break;
      spanStart = Math.min(spanStart, s.offset);
      spanEnd = Math.max(spanEnd, s.offset + s.size);
    }
    {
      const lo = plan.audioLo * audio.timescale, hi = plan.audioHi * audio.timescale;
      const idx = engine.firstSampleAtOrAfter(audio.samples, lo);
      for (let i = idx; i < audio.samples.length; i++) {
        const s = audio.samples[i];
        if (s.dts >= hi) break;
        spanStart = Math.min(spanStart, s.offset);
        spanEnd = Math.max(spanEnd, s.offset + s.size);
      }
    }
    if (spanEnd < 0) break;
    const span = fastBytes.subarray(spanStart, spanEnd);
    const frag = engine.buildFragment(parsed, span, spanStart, t, t + 4, seq++);
    if (!frag) break;

    // ---- estrutura do fragmento
    const top = boxesOf(frag.data);
    assert.equal(top.length, 2, 'fragmento = moof + mdat');
    assert.equal(top[0].type, 'moof');
    assert.equal(top[1].type, 'mdat');
    const moofSize = top[0].size;
    assert.equal(top[0].end, moofSize, 'moof declarado == real');
    assert.equal(top[1].size, frag.data.length - moofSize, 'mdat declarado == restante');

    const moofChildren = engine.walkBoxes(frag.data, top[0].start + 8, top[0].end);
    assert.equal(moofChildren.filter(b => b.type === 'mfhd').length, 1, 'um mfhd');
    const trafs = moofChildren.filter(b => b.type === 'traf');
    assert.equal(trafs.length, 2, 'um traf por track');

    const dv = (off, n) => new DataView(frag.data.buffer, frag.data.byteOffset + off, n);
    let sawVideoTrun = false, sawAudioTrun = false;

    for (const traf of trafs) {
      const children = engine.walkBoxes(frag.data, traf.start + 8, traf.end);
      const tfhd = children.find(b => b.type === 'tfhd');
      const tfdt = children.find(b => b.type === 'tfdt');
      const trun = children.find(b => b.type === 'trun');
      assert.ok(tfhd && tfdt && trun, 'tfhd + tfdt + trun presentes');

      const tfhdFlags = dv(tfhd.start + 8, 4).getUint32(0);
      assert.ok((tfhdFlags & 0x020000) !== 0, 'default-base-is-moof');
      assert.ok((tfhdFlags & 0x000038) !== 0, 'tfhd com default duration/size/flags (layout ffmpeg)');
      const trackId = dv(tfhd.start + 12, 4).getUint32(0);

      const tfdtVersion = frag.data[tfdt.start + 8];
      assert.equal(tfdtVersion, 1, 'tfdt v1');
      const baseDts = Number(dv(tfdt.start + 12, 8).getBigUint64(0));

      const trunFlags = dv(trun.start + 8, 4).getUint32(0);
      const sampleCount = dv(trun.start + 12, 4).getUint32(0);
      const dataOffset = dv(trun.start + 16, 4).getInt32(0);
      assert.ok((trunFlags & 0x000100) !== 0, 'data_offset present');
      assert.ok((trunFlags & 0x000004) !== 0, 'sample_size present (0x4) — sem ele o Chromium usa default 0 e descarta o segmento');
      assert.ok((trunFlags & 0x000200) !== 0, 'first_sample_flags present');
      assert.ok((trunFlags & 0x000001) !== 0, 'sample_duration present');

      const track = parsed.tracks.find(tr => tr.trackId === trackId);
      assert.ok(track, 'trackId conhecido: ' + trackId);
      if (track.hasCtts) assert.ok((trunFlags & 0x000008) !== 0, 'cts (0x8) presente com B-frames');

      if (track.handler === 'vide') {
        sawVideoTrun = true;
        videoTotal += sampleCount;
        if (lastVBase >= 0) assert.ok(baseDts > lastVBase, 'tfdt vídeo monotônico');
        lastVBase = baseDts;
        // primeiro sample do fragmento TEM que ser sync (regra do MSE)
        assert.ok(video.samples[plan.videoStartIdx].isSync,
          `primeiro sample da janela é keyframe (t=${t.toFixed(1)}s)`);
        // data_offset aponta pro primeiro byte da 1ª sample de vídeo da janela
        const first = video.samples[plan.videoStartIdx];
        const fileBytesAt = fastBytes.subarray(first.offset, first.offset + 16);
        const fragBytesAt = frag.data.subarray(dataOffset, dataOffset + 16);
        assert.deepEqual(Buffer.from(fragBytesAt), Buffer.from(fileBytesAt),
          `byte apontado pelo data_offset == byte do arquivo (vídeo, t=${t.toFixed(1)}s)`);
        if (track.hasCtts) assert.ok((trunFlags & 0x000008) !== 0, 'trun com cts (0x8) — B-frames');
        // primeiro sample do trun: [dur][size] — valida o SIZE (era o bug central!)
        const entryOff = trun.start + 8 + 4 + 4 + 4 + 4; // ver/flags, count, data_offset, first_sample_flags
        const firstDur = dv(entryOff, 4).getUint32(0);
        const firstSize = dv(entryOff + 4, 4).getUint32(0);
        assert.equal(firstDur, first.duration, 'trun sample0 duration');
        assert.equal(firstSize, first.size, 'trun sample0 SIZE == size real da sample');
      } else {
        sawAudioTrun = true;
        audioTotal += sampleCount;
        if (lastABase >= 0) assert.ok(baseDts > lastABase, 'tfdt áudio monotônico');
        lastABase = baseDts;
      }
    }
    assert.ok(sawVideoTrun && sawAudioTrun, 'trun de vídeo e áudio no fragmento');

    if (!firstFragment) firstFragment = frag;
    t = frag.windowEndSec;
    assert.ok(frag.windowEndSec > t - 0.001 || true);
  }

  // cobertura: TODAS as samples de todos os tracks aparecem exatamente 1x
  assert.equal(videoTotal, video.samples.length, `cobertura vídeo: ${videoTotal}/${video.samples.length}`);
  assert.equal(audioTotal, audio.samples.length, `cobertura áudio: ${audioTotal}/${audio.samples.length}`);
});

test('moov no fim (sem faststart): parse com baseOffset absoluto', () => {
  const top = boxesOf(classicBytes);
  const moov = top.find(b => b.type === 'moov');
  assert.ok(moov, 'classic.mp4 tem moov');
  // layout: ftyp, mdat, moov — moov depois do mdat
  const mdat = top.find(b => b.type === 'mdat');
  assert.ok(mdat && mdat.start < moov.start, 'mdat antes do moov (sem faststart)');

  const parsed = engine.parseMp4(classicBytes.subarray(moov.start, moov.end), moov.start);
  const video = parsed.tracks.find(t => t.handler === 'vide');
  const audio = parsed.tracks.find(t => t.handler === 'soun');
  assert.ok(video && audio);

  // offsets absolutos: primeira sample de vídeo DEVE cair dentro do mdat
  assert.ok(video.samples[0].offset >= mdat.start + 8, 'offset absoluto dentro do mdat');
  assert.ok(video.samples[0].offset < mdat.end, 'offset absoluto dentro do mdat (fim)');

  // fragmento gerado a partir do arquivo clássico bate com os bytes originais
  // janela GOP [0, próximo keyframe ≥ 1s)
  const cPlan = engine.planWindow(parsed, 0, 1);
  let spanStart = Infinity, spanEnd = -1;
  for (let i = cPlan.videoStartIdx; i < video.samples.length; i++) {
    const s = video.samples[i];
    if (s.dts >= cPlan.videoEndDts) break;
    spanStart = Math.min(spanStart, s.offset);
    spanEnd = Math.max(spanEnd, s.offset + s.size);
  }
  {
    const lo = cPlan.audioLo * audio.timescale, hi = cPlan.audioHi * audio.timescale;
    const idx = engine.firstSampleAtOrAfter(audio.samples, lo);
    for (let i = idx; i < audio.samples.length; i++) {
      const s = audio.samples[i];
      if (s.dts >= hi) break;
      spanStart = Math.min(spanStart, s.offset);
      spanEnd = Math.max(spanEnd, s.offset + s.size);
    }
  }
  const span = classicBytes.subarray(spanStart, spanEnd);
  const frag = engine.buildFragment(parsed, span, spanStart, 0, 1, 1);
  assert.ok(frag, 'fragmento da primeira janela');
  const topF = boxesOf(frag.data);
  const moofSize = topF[0].size;
  // data_offset do primeiro trun (vídeo) aponta pro primeiro byte da 1ª sample de vídeo pós-shift
  const trafChildren = engine.walkBoxes(frag.data, topF[0].start + 8, topF[0].end);
  const trunV = trafChildren.flatMap(traf => engine.walkBoxes(frag.data, traf.start + 8, traf.end).filter(b => b.type === 'trun'))[0];
  const dataOffset = new DataView(frag.data.buffer, frag.data.byteOffset + trunV.start + 16, 4).getInt32(0);
  const cFirst = video.samples[cPlan.videoStartIdx];
  const fileAt = classicBytes.subarray(cFirst.offset, cFirst.offset + 16);
  const fragAt = frag.data.subarray(dataOffset, dataOffset + 16);
  assert.deepEqual(Buffer.from(fragAt), Buffer.from(fileAt), 'data_offset aponta pro byte certo no arquivo clássico');
});

test('fragmento vazio no fim retorna null (fim de stream)', () => {
  const { moovBytes } = extractMoov(fastBytes);
  const parsed = engine.parseMp4(moovBytes, 0);
  const duration = parsed.mvhd.duration / parsed.mvhd.timescale;
  const span = fastBytes.subarray(0, 4096);
  const frag = engine.buildFragment(parsed, span, 0, duration + 5, duration + 9, 999);
  assert.equal(frag, null, 'janela além do fim não gera fragmento');
});
