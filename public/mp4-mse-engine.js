/**
 * Play Infinity — MP4 MSE Engine (Opção A: transmuxing client-side MP4 → fMP4)
 * ============================================================================
 *
 * Transforma um MP4 progressivo servido com HTTP Range (proxies /api/md-proxy
 * do MixDrop e /api/streamtape-stream do StreamTape) em playback via MediaSource:
 *
 *   1. Lê o início do arquivo (ftyp + moov) com fetch Range — detecta moov no
 *      início (faststart), moov grande cortado, OU moov no fim (layout clássico).
 *   2. Parseia as sample tables (stts/stsz/stsc/stco/stss/ctts/elst) dos tracks.
 *   3. Gera um init segment fMP4 (moov reconstruído + mvex/trex).
 *   4. Baixa o vídeo EM JANELAS DE TEMPO (~6s): para cada janela monta um
 *      fragmento [moof][mdat] com trun por sample (duration/size/flags/cts) e
 *      faz SourceBuffer.appendBuffer().
 *   5. Scheduler mantém ~36s de buffer à frente, evicta ~120s atrás, trata
 *      seek (janela monotônica à frente / reset total do MSE pra trás),
 *      retry de janela com backoff e endOfStream no fim.
 *
 * Fallback: se MSE não existir, o codec não for suportado, o servidor ignorar
 * Range ou o parse falhar, onFallback() é chamado e o caller volta pro
 * playback nativo (video.src = url) — nunca pior do que o comportamento atual.
 *
 * O core (parser + writers) é puro e exportado via CommonJS para os testes
 * de Node; o engine browser usa `window.PlayInfinityMp4Mse.attach(video,url,opts)`.
 */
(function (global) {
  'use strict';

  /* ================================================================
   * UTILIDADES ISO BMFF (big endian)
   * ================================================================ */

  function u32(bytes, off) { return ((bytes[off] << 24) | (bytes[off + 1] << 16) | (bytes[off + 2] << 8) | bytes[off + 3]) >>> 0; }
  function s32(bytes, off) { return (bytes[off] << 24) | (bytes[off + 1] << 16) | (bytes[off + 2] << 8) | bytes[off + 3]; }
  function u64(bytes, off) { return u32(bytes, off) * 4294967296 + u32(bytes, off + 4); }
  function type4(bytes, off) { return String.fromCharCode(bytes[off], bytes[off + 1], bytes[off + 2], bytes[off + 3]); }

  /** Percorre boxes top-level de um buffer; retorna lista {type,start,size,end,headerSize,truncated}. */
  function walkBoxes(bytes, start, end) {
    const boxes = [];
    let off = start;
    while (off + 8 <= end) {
      let size = u32(bytes, off);
      const t = type4(bytes, off + 4);
      let headerSize = 8;
      if (size === 1) {
        if (off + 16 > end) { boxes.push({ type: t, start: off, size: -1, end: end, headerSize: 16, truncated: true }); break; }
        size = u64(bytes, off + 8); headerSize = 16;
      } else if (size === 0) {
        size = end - off;
      }
      const boxEnd = off + size;
      boxes.push({ type: t, start: off, size: size, end: Math.min(boxEnd, end), headerSize: headerSize, truncated: boxEnd > end });
      if (boxEnd > end || size <= 0) break;
      off = boxEnd;
    }
    return boxes;
  }

  /** Primeiro índice com samples[idx].dts >= tick (busca binária). */
  function firstSampleAtOrAfter(samples, tick) {
    let lo = 0, hi = samples.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (samples[mid].dts < tick) lo = mid + 1; else hi = mid;
    }
    return lo;
  }

  /* ================================================================
   * PARSER DO MOOV (core puro — testável em Node)
   * ================================================================ */

  /**
   * parseMp4(moovBytes, baseOffset)
   *  - moovBytes: buffer cujo início é o box 'moov' COMPLETO
   *  - baseOffset: offset absoluto no arquivo onde esse buffer começa
   *    (pra converter offsets de chunk do stco em offsets absolutos)
   * Retorna { mvhd, tracks, moovSize }
   */
  function parseMp4(moovBytes, baseOffset) {
    baseOffset = baseOffset || 0;
    if (moovBytes.length < 8 || type4(moovBytes, 4) !== 'moov') throw new Error('mse_not_moov');
    const declared = u32(moovBytes, 0);
    const limit = Math.min(moovBytes.length, declared === 0 ? moovBytes.length : declared);

    const mvhd = { timescale: 0, duration: 0 };
    const tracks = [];

    for (const moovChild of walkBoxes(moovBytes, 8, limit)) {
      if (moovChild.type === 'mvhd') {
        const b = moovBytes, p = moovChild.start + moovChild.headerSize;
        const version = b[p];
        if (version === 1) { mvhd.timescale = u32(b, p + 20); mvhd.duration = u64(b, p + 24); }
        else { mvhd.timescale = u32(b, p + 12); mvhd.duration = u32(b, p + 16); }
      } else if (moovChild.type === 'trak') {
        const track = parseTrak(moovBytes, moovChild);
        if (track) tracks.push(track);
      }
    }
    if (!mvhd.timescale || !tracks.length) throw new Error('mse_bad_moov');
    return { mvhd, tracks, moovSize: limit };
  }

  function parseTrak(bytes, trakBox) {
    const track = {
      trackId: 0, timescale: 0, duration: 0, handler: '',
      width: 0, height: 0, volume: 0,
      sampleEntry: null, sampleEntryType: '', codec: null,
      samples: [], hasCtts: false, elstMediaTime: 0,
    };
    let elstBox = null, stblBox = null, tkhdBox = null, mdhdBox = null;

    for (const child of walkBoxes(bytes, trakBox.start + trakBox.headerSize, trakBox.end)) {
      if (child.type === 'tkhd') tkhdBox = child;
      else if (child.type === 'edts') {
        for (const edtsChild of walkBoxes(bytes, child.start + child.headerSize, child.end)) {
          if (edtsChild.type === 'elst') elstBox = edtsChild;
        }
      } else if (child.type === 'mdia') {
        for (const mdiaChild of walkBoxes(bytes, child.start + child.headerSize, child.end)) {
          if (mdiaChild.type === 'mdhd') mdhdBox = mdiaChild;
          else if (mdiaChild.type === 'hdlr') {
            track.handler = type4(bytes, mdiaChild.start + mdiaChild.headerSize + 8);
          } else if (mdiaChild.type === 'minf') {
            for (const minfChild of walkBoxes(bytes, mdiaChild.start + mdiaChild.headerSize, mdiaChild.end)) {
              if (minfChild.type === 'stbl') stblBox = minfChild;
            }
          }
        }
      }
    }
    if (!tkhdBox || !mdhdBox || !stblBox) return null;

    { // tkhd → trackId / width / height / volume
      // payload (desde ver/flags): v0: ctime@4 mtime@8 track_ID@12 reserved@16 duration@20
      // layer@32 alt@34 volume@36 res@38 matrix@40 width@76 height@80
      // v1: ctime@4(u64) mtime@12(u64) track_ID@20 reserved@24 duration@28(u64)
      // layer@44 alt@46 volume@48 res@50 matrix@52 width@88 height@92
      const p = tkhdBox.start + tkhdBox.headerSize;
      const version = bytes[p];
      track.trackId = version === 1 ? u32(bytes, p + 20) : u32(bytes, p + 12);
      const volumeOff = version === 1 ? p + 48 : p + 36;
      const widthOff = version === 1 ? p + 88 : p + 76;
      if (widthOff + 8 <= tkhdBox.end) {
        track.width = u32(bytes, widthOff);       // 16.16 fixed
        track.height = u32(bytes, widthOff + 4);  // 16.16 fixed
      }
      if (volumeOff + 2 <= tkhdBox.end) track.volume = (bytes[volumeOff] << 8) | bytes[volumeOff + 1]; // 8.8 fixed
    }
    { // mdhd → timescale/duration
      const p = mdhdBox.start + mdhdBox.headerSize;
      const version = bytes[p];
      if (version === 1) { track.timescale = u32(bytes, p + 20); track.duration = u64(bytes, p + 24); }
      else { track.timescale = u32(bytes, p + 12); track.duration = u32(bytes, p + 16); }
    }
    { // elst → media_time do primeiro edit (priming AAC / empty edit)
      if (elstBox) {
        const p = elstBox.start + elstBox.headerSize;
        const version = bytes[p];
        const entries = u32(bytes, p + 4);
        if (entries > 0) {
          if (version === 1) {
            // entry v1: segment_duration u64 @8, media_time s64 @16, rate s32 @24
            const hi = s32(bytes, p + 16), lo = u32(bytes, p + 20);
            track.elstMediaTime = hi === 0 ? lo : (hi < 0 ? -1 : hi * 4294967296 + lo);
          } else {
            // entry v0: segment_duration u32 @8, media_time s32 @12, rate s32 @16
            track.elstMediaTime = s32(bytes, p + 12);
          }
        }
      }
    }

    if (!track.trackId || !track.timescale) return null;
    try {
      parseStbl(bytes, stblBox, track);
    } catch (e) {
      // hint/meta tracks com stbl atípica: só derruba o track se for vide/soun
      if (track.handler === 'vide' || track.handler === 'soun') throw e;
      return null;
    }
    if (!track.samples.length || !track.sampleEntry) return null;
    if (track.handler !== 'vide' && track.handler !== 'soun') return null;
    return track;
  }

  function parseStbl(bytes, stblBox, track) {
    let stsdBox = null, sttsBox = null, cttsBox = null, stscBox = null, stszBox = null, stcoBox = null, stssBox = null;

    for (const child of walkBoxes(bytes, stblBox.start + stblBox.headerSize, stblBox.end)) {
      switch (child.type) {
        case 'stsd': stsdBox = child; break;
        case 'stts': sttsBox = child; break;
        case 'ctts': cttsBox = child; break;
        case 'stsc': stscBox = child; break;
        case 'stsz': stszBox = child; break;
        case 'stco': case 'co64': stcoBox = child; break;
        case 'stss': stssBox = child; break;
      }
    }
    if (!stsdBox || !sttsBox || !stscBox || !stszBox || !stcoBox) throw new Error('mse_bad_stbl');

    { // stsd: primeiro sample entry (bytes completos do box) + codec
      const p = stsdBox.start + stsdBox.headerSize;
      const entryCount = u32(bytes, p + 4);
      if (entryCount < 1) throw new Error('mse_no_sample_entry');
      const entryStart = p + 8;
      const entrySize = u32(bytes, entryStart);
      const entryType = type4(bytes, entryStart + 4);
      if (entrySize < 8 || entryStart + entrySize > stsdBox.end) throw new Error('mse_bad_sample_entry');
      track.sampleEntryType = entryType;
      track.sampleEntry = bytes.subarray(entryStart, entryStart + entrySize);
      track.codec = extractCodec(bytes, entryStart, entryType);
    }

    const durations = []; // stts
    {
      const p = sttsBox.start + sttsBox.headerSize;
      const n = u32(bytes, p + 4);
      for (let i = 0; i < n; i++) {
        const count = u32(bytes, p + 8 + i * 8);
        const delta = u32(bytes, p + 12 + i * 8);
        for (let j = 0; j < count; j++) durations.push(delta);
      }
    }

    const sizes = []; // stsz
    {
      const p = stszBox.start + stszBox.headerSize;
      const constant = u32(bytes, p + 4);
      const count = u32(bytes, p + 8);
      if (constant !== 0) { for (let i = 0; i < count; i++) sizes.push(constant); }
      else { for (let i = 0; i < count; i++) sizes.push(u32(bytes, p + 12 + i * 4)); }
    }
    if (sizes.length !== durations.length) throw new Error('mse_stbl_mismatch');

    const chunkOffsets = []; // stco / co64
    {
      const is64 = type4(bytes, stcoBox.start + 4) === 'co64';
      const p = stcoBox.start + stcoBox.headerSize;
      const n = u32(bytes, p + 4);
      for (let i = 0; i < n; i++) {
        chunkOffsets.push(is64 ? u64(bytes, p + 8 + i * 8) : u32(bytes, p + 8 + i * 4));
      }
    }

    const stscRuns = []; // stsc
    {
      const p = stscBox.start + stscBox.headerSize;
      const n = u32(bytes, p + 4);
      for (let i = 0; i < n; i++) {
        stscRuns.push({
          firstChunk: u32(bytes, p + 8 + i * 12),
          samplesPerChunk: u32(bytes, p + 12 + i * 12),
        });
      }
    }

    const syncSet = new Set(); // stss (1-based)
    if (stssBox) {
      const p = stssBox.start + stssBox.headerSize;
      const n = u32(bytes, p + 4);
      for (let i = 0; i < n; i++) syncSet.add(u32(bytes, p + 8 + i * 4));
    }

    const cttsOffsets = new Array(sizes.length).fill(0); // ctts
    if (cttsBox) {
      track.hasCtts = true;
      const p = cttsBox.start + cttsBox.headerSize;
      const version = bytes[p];
      const n = u32(bytes, p + 4);
      let idx = 0;
      for (let i = 0; i < n; i++) {
        const count = u32(bytes, p + 8 + i * 8);
        const offset = version === 1 ? s32(bytes, p + 12 + i * 8) : u32(bytes, p + 12 + i * 8);
        for (let j = 0; j < count && idx < cttsOffsets.length; j++) cttsOffsets[idx++] = offset;
      }
    }

    // monta samples com dts/cts/offset absolutos
    const sampleCount = sizes.length;
    const samples = new Array(sampleCount);
    let dts = 0, sampleIdx = 0, runIdx = 0;
    for (let chunk = 0; chunk < chunkOffsets.length && sampleIdx < sampleCount; chunk++) {
      while (runIdx + 1 < stscRuns.length && stscRuns[runIdx + 1].firstChunk <= chunk + 1) runIdx++;
      const perChunk = stscRuns[runIdx].samplesPerChunk;
      let offsetInChunk = 0;
      for (let s = 0; s < perChunk && sampleIdx < sampleCount; s++) {
        samples[sampleIdx] = {
          dts: dts,
          cts: dts + cttsOffsets[sampleIdx],
          duration: durations[sampleIdx],
          size: sizes[sampleIdx],
          offset: chunkOffsets[chunk] + offsetInChunk, // absoluto no arquivo
          isSync: track.handler === 'soun' ? true : (stssBox ? syncSet.has(sampleIdx + 1) : true),
        };
        offsetInChunk += sizes[sampleIdx];
        dts += durations[sampleIdx];
        sampleIdx++;
      }
    }
    if (sampleIdx !== sampleCount) throw new Error('mse_chunk_map_incomplete');
    track.samples = samples;
    track.duration = track.duration || dts;
  }

  /** Extrai a codec string (avc1.PCCL / mp4a.40.N) do sample entry. */
  function extractCodec(bytes, entryStart, entryType) {
    const entrySize = u32(bytes, entryStart);
    const entryEnd = entryStart + entrySize;
    try {
      if (entryType === 'avc1' || entryType === 'avc3') {
        // VisualSampleEntry: children após header(8) + 78 bytes fixos
        for (const childStart of candidateChildOffsets(bytes, entryStart, entryEnd, 78)) {
          if (childStart + 8 <= entryEnd && type4(bytes, childStart + 4) === 'avcC') {
            const p = childStart + 8;
            if (p + 4 > entryEnd) return null;
            return 'avc1.' + hex2(bytes[p + 1]) + hex2(bytes[p + 2]) + hex2(bytes[p + 3]);
          }
        }
        return null;
      }
      if (entryType === 'mp4a') {
        for (const childStart of candidateChildOffsets(bytes, entryStart, entryEnd, 28)) {
          if (childStart + 8 <= entryEnd && type4(bytes, childStart + 4) === 'esds') {
            const aot = parseEsdsAudioObjectType(bytes, childStart + 8, u32(bytes, childStart) - 8);
            return 'mp4a.40.' + (aot || 2);
          }
        }
        return 'mp4a.40.2';
      }
    } catch (e) { return null; }
    return null;
  }

  /** Offsets candidatos de filhos do sample entry (v0 canônico + versões 1/2 do mp4a). */
  function candidateChildOffsets(bytes, entryStart, entryEnd, canonicalPayload) {
    const base = entryStart + 8 + canonicalPayload;
    return [base, base + 16, base + 24, base + 8].filter(function (off) {
      return off + 8 <= entryEnd && u32(bytes, off) >= 12 && off + u32(bytes, off) <= entryEnd;
    });
  }

  function parseEsdsAudioObjectType(bytes, p, end) {
    if (bytes[p] !== 0x03) return null;
    let q = p + 1;
    q = skipDescriptorLength(bytes, q);
    q += 2; // ES_ID
    const streamDependence = (bytes[q] & 0x40) !== 0;
    const urlFlag = (bytes[q] & 0x80) !== 0;
    const ocrFlag = (bytes[q] & 0x20) !== 0;
    q += 1;
    if (streamDependence) q += 2;
    if (urlFlag) q += 1 + bytes[q];
    if (ocrFlag) q += 2;
    if (q >= end || bytes[q] !== 0x04) return null;
    q += 1;
    q = skipDescriptorLength(bytes, q);
    q += 13; // OTI(1) streamType(1) bufferSize(3) maxBitrate(4) avgBitrate(4)
    if (q < end && bytes[q] === 0x05) {
      q += 1;
      q = skipDescriptorLength(bytes, q);
      if (q < end) return (bytes[q] >> 3) & 0x1f;
    }
    return null;
  }

  function skipDescriptorLength(bytes, q) {
    while (q < bytes.length && (bytes[q] & 0x80) !== 0) q++;
    return q + 1;
  }

  function hex2(v) { return (v < 16 ? '0' : '') + v.toString(16); }

  /* ================================================================
   * WRITERS (core puro)
   * ================================================================ */

  function BoxWriter() { this.chunks = []; this.length = 0; }
  BoxWriter.prototype.u8 = function (v) { this.chunks.push(new Uint8Array([v & 0xff])); this.length += 1; return this; };
  BoxWriter.prototype.u24 = function (v) { this.u8((v >> 16) & 0xff).u8((v >> 8) & 0xff).u8(v & 0xff); return this; };
  BoxWriter.prototype.u16 = function (v) { this.chunks.push(new Uint8Array([(v >> 8) & 0xff, v & 0xff])); this.length += 2; return this; };
  BoxWriter.prototype.u32 = function (v) {
    v = v >>> 0;
    this.chunks.push(new Uint8Array([(v >>> 24) & 0xff, (v >>> 16) & 0xff, (v >>> 8) & 0xff, v & 0xff]));
    this.length += 4; return this;
  };
  BoxWriter.prototype.s32 = function (v) { return this.u32(v); };
  BoxWriter.prototype.u64 = function (v) { this.u32(Math.floor(v / 4294967296)); this.u32(v % 4294967296); return this; };
  BoxWriter.prototype.ascii = function (s) { for (let i = 0; i < s.length; i++) this.u8(s.charCodeAt(i)); return this; };
  BoxWriter.prototype.raw = function (arr) { this.chunks.push(arr); this.length += arr.length; return this; };
  BoxWriter.prototype.matrix = function () {
    this.u32(0x00010000); this.u32(0); this.u32(0);
    this.u32(0); this.u32(0x00010000); this.u32(0);
    this.u32(0); this.u32(0); this.u32(0x40000000);
    return this;
  };
  BoxWriter.prototype.box = function (type, payloadFn) {
    const inner = new BoxWriter();
    payloadFn(inner);
    this.u32(8 + inner.length); this.ascii(type);
    this.chunks.push.apply(this.chunks, inner.chunks);
    this.length += inner.length;
    return this;
  };
  BoxWriter.prototype.build = function () {
    const out = new Uint8Array(this.length);
    let off = 0;
    for (const c of this.chunks) { out.set(c, off); off += c.length; }
    return out;
  };

  /** Init segment: [ftyp original][moov reconstruído c/ mvex]. */
  function buildInitSegment(parsed, ftypBytes) {
    const w = new BoxWriter();
    if (ftypBytes && ftypBytes.length >= 8) w.raw(ftypBytes);
    else w.box('ftyp', function (f) { f.ascii('isom'); f.u32(0); f.ascii('iso2'); f.u32(0); });
    w.raw(rewriteMoov(parsed));
    return w.build();
  }

  /** Moov fragmentado: duration zerada, stbl vazia, + mvex/trex. */
  function rewriteMoov(parsed) {
    const out = new BoxWriter();
    out.box('moov', function (m) {
      // ---- mvhd v0 (100 bytes de payload)
      m.box('mvhd', function (mv) {
        mv.u8(0); mv.u24(0);              // version/flags
        mv.u32(0); mv.u32(0);             // creation/mtime
        mv.u32(parsed.mvhd.timescale);
        mv.u32(0);                        // duration (fragmentado)
        mv.u32(0x00010000);               // rate 1.0
        mv.u16(0x0100); mv.u16(0);        // volume 1.0 + reserved
        mv.u32(0); mv.u32(0);             // reserved
        mv.matrix();                      // 36
        mv.u32(0); mv.u32(0); mv.u32(0); mv.u32(0); mv.u32(0); mv.u32(0); // pre_defined
        mv.u32(parsed.tracks.length + 1); // next_track_id
      });
      for (const track of parsed.tracks) {
        m.box('trak', function (t) {
          // ---- tkhd v0 (84 bytes de payload)
          t.box('tkhd', function (tk) {
            tk.u8(0); tk.u24(0x7);        // flags: track_enabled|in_movie|in_preview
            tk.u32(0); tk.u32(0);         // ctime/mtime
            tk.u32(track.trackId); tk.u32(0);
            tk.u32(0);                    // duration (fragmentado)
            tk.u32(0); tk.u32(0);         // reserved
            tk.u16(0); tk.u16(0);         // layer / alternate_group
            if (track.handler === 'soun') tk.u16(track.volume || 0x0100); else tk.u16(0);
            tk.u16(0);                    // reserved
            tk.matrix();
            tk.u32(track.width || 0);     // 16.16
            tk.u32(track.height || 0);    // 16.16
          });
          t.box('mdia', function (md) {
            md.box('mdhd', function (mh) {
              mh.u8(0); mh.u24(0);
              mh.u32(0); mh.u32(0);
              mh.u32(track.timescale);
              mh.u32(0);                  // duration
              mh.u16(0x55c4); mh.u16(0);  // language 'und'
            });
            md.box('hdlr', function (h) {
              h.u8(0); h.u24(0);
              h.u32(0); h.ascii(track.handler);
              h.u32(0); h.u32(0); h.u32(0); // reserved
              h.ascii('PI\x00');           // name
            });
            md.box('minf', function (mi) {
              if (track.handler === 'vide') {
                mi.box('vmhd', function (v) { v.u8(0); v.u24(1); v.u16(0); v.u16(0); v.u16(0); v.u16(0); });
              } else {
                mi.box('smhd', function (v) { v.u8(0); v.u24(0); v.u16(0); v.u16(0); });
              }
              mi.box('dinf', function (d) {
                d.box('dref', function (dr) {
                  dr.u8(0); dr.u24(0); dr.u32(1);
                  dr.box('url ', function (u) { u.u8(0); u.u24(1); });
                });
              });
              mi.box('stbl', function (sb) {
                sb.box('stsd', function (sd) {
                  sd.u8(0); sd.u24(0); sd.u32(1);
                  sd.raw(track.sampleEntry);
                });
                sb.box('stts', function (s) { s.u8(0); s.u24(0); s.u32(0); });
                sb.box('stsc', function (s) { s.u8(0); s.u24(0); s.u32(0); });
                sb.box('stsz', function (s) { s.u8(0); s.u24(0); s.u32(0); s.u32(0); });
                sb.box('stco', function (s) { s.u8(0); s.u24(0); s.u32(0); });
              });
            });
          });
        });
      }
      m.box('mvex', function (mx) {
        for (const track of parsed.tracks) {
          mx.box('trex', function (tx) {
            tx.u8(0); tx.u24(0);            // version + flags (FullBox!)
            tx.u32(track.trackId);
            tx.u32(1);  // default_sample_description_index
            tx.u32(0); tx.u32(0); tx.u32(0); // duration/size/flags
          });
        }
      });
    });
    return out.build();
  }

  /** Keyframes (sync samples) do track de vídeo, com cache. */
  function syncsOf(videoTrack) {
    if (videoTrack.__syncs) return videoTrack.__syncs;
    const syncs = [];
    for (let i = 0; i < videoTrack.samples.length; i++) {
      const s = videoTrack.samples[i];
      if (s.isSync) syncs.push({ idx: i, dts: s.dts });
    }
    videoTrack.__syncs = syncs;
    return syncs;
  }

  /**
   * planWindow(parsed, t0Sec, t1Sec) — janela alinhada por GOP.
   * O MSE/Chromium DESCARTA media segments que não começam com sync sample
   * (keyframe) — então cada fragmento abre num keyframe e fecha no próximo
   * keyframe que cumpre o mínimo de duração (t1Sec). Sem syncs (stss ausente
   * = tudo keyframe), a janela é por tempo mesmo.
   * Retorna { videoStartIdx, videoEndDts, audioLo, audioHi, startSec, endSec }.
   */
  function planWindow(parsed, t0Sec, t1Sec) {
    const video = parsed.tracks.find(function (t) { return t.handler === 'vide'; });
    const audio = parsed.tracks.find(function (t) { return t.handler === 'soun'; });
    const base = video || audio;
    if (!base) return null;
    if (!video) {
      const ts = base.timescale;
      const lastS = base.samples[base.samples.length - 1];
      const endSec = Math.min(t1Sec, (lastS.dts + lastS.duration) / ts);
      return { videoStartIdx: -1, videoEndDts: endSec * ts, audioLo: t0Sec, audioHi: endSec, startSec: t0Sec, endSec: endSec };
    }
    const ts = video.timescale;
    const syncs = syncsOf(video);
    const t0Ticks = Math.max(0, t0Sec * ts);
    const t1Ticks = Math.max(t1Sec * ts, t0Ticks + 1);
    const lastSample = video.samples[video.samples.length - 1];
    if (t0Ticks >= lastSample.dts + lastSample.duration) return null; // além do fim

    let startIdx = -1, startDts = -1;
    for (const k of syncs) {
      if (k.dts >= t0Ticks) { startIdx = k.idx; startDts = k.dts; break; }
    }
    if (startIdx === -1) {
      // t0 cai depois do último keyframe: último GOP (trecho final)
      const last = syncs[syncs.length - 1];
      startIdx = last ? last.idx : 0;
      startDts = last ? last.dts : 0;
    }
    let endDts = -1, isFinal = false;
    for (const k of syncs) {
      if (k.dts > startDts && k.dts >= t1Ticks) { endDts = k.dts; break; }
    }
    if (endDts === -1) { endDts = lastSample.dts + lastSample.duration; isFinal = true; }
    const startSec = startDts / ts;
    const endSec = endDts / ts;
    // janela final: áudio pode ter frames além do fim do vídeo (1 AAC frame ~23ms)
    return { videoStartIdx: startIdx, videoEndDts: endDts, audioLo: startSec, audioHi: isFinal ? Infinity : endSec, startSec: startSec, endSec: endSec };
  }

  /* ================================================================
   * FRAGMENTO [moof][mdat]
   * ================================================================ */

  /**
   * buildFragment(parsed, spanBytes, spanStart, t0Sec, t1Sec, seq)
   * Monta [moof][mdat] da janela GOP-alinhada que começa no primeiro keyframe
   * ≥ t0Sec e termina no primeiro keyframe ≥ t1Sec (mínimo de duração).
   * spanBytes: bytes do arquivo cobrindo [spanStart, spanStart+len).
   * Retorna { data, windowEndSec, samplesVideo, samplesAudio } ou null se vazia.
   */
  function buildFragment(parsed, spanBytes, spanStart, t0Sec, t1Sec, seq) {
    const video = parsed.tracks.find(function (t) { return t.handler === 'vide'; });
    const audio = parsed.tracks.find(function (t) { return t.handler === 'soun'; });

    const plan = planWindow(parsed, t0Sec, t1Sec);
    if (!plan) return null;

    // NOTA: ignoramos o elst (priming) — igual ao ffmpeg empty_moov. O MSE
    // descarta media segments que não abrem com sync sample; o alinhamento
    // por GOP (plan) já garante isso.
    const trackWindows = [];
    for (const track of parsed.tracks) {
      const win = [];
      if (track === video && plan.videoStartIdx >= 0) {
        for (let i = plan.videoStartIdx; i < track.samples.length; i++) {
          const s = track.samples[i];
          if (s.dts >= plan.videoEndDts) break;
          win.push(s);
        }
      } else if (track === audio) {
        const lo = plan.audioLo * track.timescale;
        const hi = plan.audioHi * track.timescale;
        const startIdx = firstSampleAtOrAfter(track.samples, lo);
        for (let i = startIdx; i < track.samples.length; i++) {
          const s = track.samples[i];
          if (s.dts >= hi) break;
          win.push(s);
        }
      }
      trackWindows.push({ track: track, samples: win, shift: 0 });
    }
    if (!trackWindows.some(function (tw) { return tw.samples.length > 0; })) return null;

    // bytes do mdat: vídeo primeiro, depois áudio
    const videoTw = trackWindows.find(function (tw) { return tw.track.handler === 'vide'; });
    const audioTw = trackWindows.find(function (tw) { return tw.track.handler === 'soun'; });
    const videoParts = [], audioParts = [];
    let videoLen = 0, audioLen = 0;
    const take = function (s) {
      const from = s.offset - spanStart, to = from + s.size;
      if (from < 0 || to > spanBytes.length) throw new Error('mse_span_out_of_range');
      return spanBytes.subarray(from, to);
    };
    if (videoTw) for (const s of videoTw.samples) { const b = take(s); videoParts.push(b); videoLen += b.length; }
    if (audioTw) for (const s of audioTw.samples) { const b = take(s); audioParts.push(b); audioLen += b.length; }

    // tamanho do moof (para data_offset, relativo ao início do moof)
    // trun: 8 header + 16 (ver/flags+count+data_offset+first_sample_flags) + n×(dur 4 + size 4 [+ cts 4])
    function trunLen(n, hasCts) { return 8 + 16 + n * (8 + (hasCts ? 4 : 0)); }
    function trafLen(n, hasCts) { return 8 + 28 + 20 + trunLen(n, hasCts); } // traf + tfhd(28) + tfdt(20) + trun
    let moofSize = 8 + 16; // moof + mfhd
    for (const tw of trackWindows) {
      if (tw.samples.length) moofSize += trafLen(tw.samples.length, tw.track.hasCtts);
    }

    const w = new BoxWriter();
    w.box('moof', function (mf) {
      mf.box('mfhd', function (h) { h.u8(0); h.u24(0); h.u32(seq); });
      for (const tw of trackWindows) {
        const track = tw.track;
        const samples = tw.samples;
        if (!samples.length) continue;
        const shift = tw.shift;
        const baseDts = samples[0].dts - shift;
        const dataOffset = moofSize + 8 + (track.handler === 'vide' ? 0 : videoLen);
        mf.box('traf', function (tf) {
          // tfhd com defaults (layout comprovado do ffmpeg): default-base-is-moof
          // + default-duration + default-size + default-flags
          tf.box('tfhd', function (h) {
            h.u32(0x020038);
            h.u32(track.trackId);
            h.u32(samples[0].duration);
            h.u32(samples[0].size);
            h.u32(0x01010000);
          });
          tf.box('tfdt', function (h) { h.u8(1); h.u24(0); h.u64(baseDts); });
          // trun: [ver/flags][count][data_offset][first_sample_flags] + n×[duration][size][cts?]
          // bits: 0x1 duration | 0x4 SIZE (o Chromium usa; sem ele o size vira o
          // default do trex = 0 e o media segment é descartado!) | 0x8 cts |
          // 0x100 data-offset | 0x200 first-sample-flags
          tf.box('trun', function (h) {
            const hasCts = track.hasCtts;
            h.u8(hasCts ? 1 : 0); // v1 = cts signed
            h.u24(0x000305 | (hasCts ? 0x000008 : 0)); // duration|size|data-offset|first-flags|cts?
            h.u32(samples.length);
            h.s32(dataOffset);
            h.u32(samples[0].isSync ? 0x02000000 : 0x01000000); // first_sample_flags
            for (const s of samples) {
              h.u32(s.duration);
              h.u32(s.size);
              if (hasCts) h.s32(s.cts - s.dts);
            }
          });
        });
      }
    });
    w.box('mdat', function (md) {
      for (const p of videoParts) md.raw(p);
      for (const p of audioParts) md.raw(p);
    });

    // Fim nominal da janela = próximo keyframe (GOP-alinhado)
    const windowEndSec = plan.endSec;
    return {
      data: w.build(),
      windowEndSec: windowEndSec,
      samplesVideo: videoTw ? videoTw.samples.length : 0,
      samplesAudio: audioTw ? audioTw.samples.length : 0,
    };
  }

  /** Mime + codec string pra MediaSource.isTypeSupported. */
  function buildMime(parsed) {
    const video = parsed.tracks.find(function (t) { return t.handler === 'vide'; });
    const audio = parsed.tracks.find(function (t) { return t.handler === 'soun'; });
    if (video && video.sampleEntryType.indexOf('avc') !== 0) return null; // hev1/etc → sem MSE
    if (video && !video.codec) return null;
    const codecs = [];
    if (video) codecs.push(video.codec);
    if (audio) codecs.push(audio.codec || 'mp4a.40.2');
    if (!codecs.length) return null;
    return 'video/mp4; codecs="' + codecs.join(', ') + '"';
  }

  /* ================================================================
   * ENGINE (browser)
   * ================================================================ */

  const DEFAULTS = {
    segmentSeconds: 6,
    bufferAhead: 36,
    keepBehind: 120,
    maxRetries: 3,
    headerTimeoutMs: 12000,
    segmentTimeoutMs: 25000,
    segmentIdleMs: 8000,
    stallTimeoutMs: 15000,
    debug: false,
  };

  function attach(video, url, options) {
    const opts = {};
    for (const k in DEFAULTS) opts[k] = DEFAULTS[k];
    if (options) for (const k in options) opts[k] = options[k];
    const log = opts.debug ? function (m) { try { console.log('[mp4-mse]', m); } catch (e) {} } : function () {};

    if (typeof global.MediaSource === 'undefined' || typeof global.MediaSource.isTypeSupported !== 'function') {
      if (opts.onFallback) opts.onFallback('no_mse');
      return null;
    }

    const engine = { destroyed: false, usingMse: false, destroy: destroy,
      stats: { resets: 0, seekEvents: 0, windows: 0, lastAction: 'created' } };

    let parsed = null, mime = null;
    let ms = null, sb = null, objectUrl = null;
    let appendQueue = [], eosQueued = false;
    let nextWindowStart = Math.max(0, Number(opts.initialTime) || 0);
    let seqNum = 1;
    let fetchingWindow = false;
    let fetchController = null;
    let lastAppendedEndSec = 0;
    let durationSec = 0;
    let timers = [];
    let seekDebounce = null;
    let stallSince = 0, lastCurrentTime = 0;
    let retryCount = 0;
    let lastEvict = 0;
    let restoring = false;
    let resetLoopCount = 0;
    let lastLoopMarkTime = 0;
    let initSegmentBytes = null;
    const listeners = [];

    const on = function (ev, fn, el) { (el || video).addEventListener(ev, fn); listeners.push([ev, fn, el || video]); };
    const off = function () { for (const l of listeners) l[2].removeEventListener(l[0], l[1]); listeners.length = 0; };

    // ---------- fetch com Range ----------
    async function fetchRange(start, end, timeoutMs) {
      const controller = new AbortController();
      fetchController = controller;
      const timer = setTimeout(function () { controller.abort(); }, timeoutMs || opts.segmentTimeoutMs);
      try {
        const response = await fetch(url, {
          headers: { Range: 'bytes=' + start + '-' + end },
          signal: controller.signal,
          cache: 'no-store',
        });
        if (!response.ok) throw new Error('mse_http_' + response.status);
        if (response.status === 200) {
          // range ignorado? (exigimos 206 para qualquer start; para start=0 testamos content-length)
          const cl = Number(response.headers.get('content-length') || 0);
          if (start > 0 || cl > (end - start + 1)) throw new Error('mse_range_unsupported');
        }
        return await readWithIdle(response, controller);
      } finally {
        clearTimeout(timer);
        if (fetchController === controller) fetchController = null;
      }
    }

    function readWithIdle(response, controller) {
      return new Promise(function (resolve, reject) {
        const reader = response.body && response.body.getReader ? response.body.getReader() : null;
        if (!reader) {
          response.arrayBuffer().then(function (b) { resolve(new Uint8Array(b)); }, reject);
          return;
        }
        const chunks = [];
        let size = 0, idle = null, done = false;
        const failIdle = function () { cleanup(); try { controller.abort(); } catch (e) {} reject(new Error('mse_idle_timeout')); };
        const cleanup = function () {
          if (idle) clearTimeout(idle);
          done = true;
          try {
            const p = reader.cancel();
            if (p && typeof p.catch === 'function') p.catch(function () {});
          } catch (e) {}
        };
        (function pump() {
          if (done) return;
          if (idle) clearTimeout(idle);
          idle = setTimeout(failIdle, opts.segmentIdleMs);
          reader.read().then(function (r) {
            if (done) return;
            if (r.done) {
              cleanup();
              const out = new Uint8Array(size);
              let o = 0;
              for (const c of chunks) { out.set(c, o); o += c.length; }
              resolve(out);
              return;
            }
            chunks.push(r.value); size += r.value.length;
            if (size >= 512 * 1024 * 1024) { cleanup(); reject(new Error('mse_too_big')); return; }
            pump();
          }, function (err) { if (!done) { cleanup(); reject(err); } });
        })();
      });
    }

    // ---------- fase 1: headers (ftyp + moov) ----------
    async function loadHeader() {
      const PROLOGUE = 64 * 1024;
      const first = await fetchRange(0, PROLOGUE - 1, opts.headerTimeoutMs);
      const boxes = walkBoxes(first, 0, first.length);
      const ftyp = boxes.find(function (b) { return b.type === 'ftyp' && !b.truncated; });
      const ftypBytes = ftyp ? first.subarray(ftyp.start, ftyp.end) : null;

      // Caso 1: moov completo no prologue (faststart)
      const moovBox = boxes.find(function (b) { return b.type === 'moov'; });
      if (moovBox && !moovBox.truncated) {
        return { parsed: parseMp4(first.subarray(moovBox.start, moovBox.end), 0), ftypBytes: ftypBytes };
      }

      // Caso 2: moov cortado no fim do prologue (moov grande antes do mdat)
      const truncatedMoov = boxes.find(function (b) { return b.type === 'moov' && b.truncated; });
      if (truncatedMoov) {
        const moovSize = truncatedMoov.size;
        if (moovSize > 64 * 1024 * 1024) throw new Error('mse_moov_huge');
        if (truncatedMoov.start < 65536 && moovSize > 2 * 1024 * 1024) {
          throw new Error('mse_moov_faststart_native');
        }
        const buf = await fetchRange(truncatedMoov.start, truncatedMoov.start + moovSize - 1, opts.headerTimeoutMs);
        return { parsed: parseMp4(buf.subarray(0, moovSize), truncatedMoov.start), ftypBytes: ftypBytes };
      }

      // Caso 3: box grande (mdat/free) cortado → moov vem depois dele
      const bigBox = boxes.find(function (b) { return b.truncated && b.size > 0; });
      if (bigBox) {
        const after = bigBox.start + bigBox.size;
        const probe = await fetchRange(after, after + 64 * 1023, opts.headerTimeoutMs);
        const afterBoxes = walkBoxes(probe, 0, probe.length);
        for (const b of afterBoxes) {
          if (b.type === 'moov') {
            const moovStartAbs = after + b.start;
            const moovBytes = b.truncated
              ? await fetchRange(moovStartAbs, moovStartAbs + b.size - 1, opts.headerTimeoutMs)
              : probe.subarray(b.start, b.end);
            return { parsed: parseMp4(moovBytes.subarray(0, b.size), moovStartAbs), ftypBytes: ftypBytes };
          }
        }
      }

      // Caso 4: moov no FIM do arquivo (sem faststart)
      const total = await fileSize();
      if (!total) throw new Error('mse_no_total');
      let tailSize = 1024 * 1024;
      while (tailSize <= 64 * 1024 * 1024) {
        const tail = await fetchRange(Math.max(0, total - tailSize), total - 1, opts.headerTimeoutMs);
        for (let i = 0; i + 8 <= tail.length; i++) {
          if (type4(tail, i + 4) === 'moov') {
            const moovSize = u32(tail, i);
            if (moovSize < 8 || i + moovSize > tail.length) continue;
            const moovStartAbs = (total - tailSize) + i;
            return { parsed: parseMp4(tail.subarray(i, i + moovSize), moovStartAbs), ftypBytes: ftypBytes };
          }
        }
        tailSize *= 4;
      }
      throw new Error('mse_moov_not_found');
    }

    async function fileSize() {
      const response = await fetch(url, { headers: { Range: 'bytes=0-0' }, cache: 'no-store' });
      const cr = response.headers.get('content-range');
      try { if (response.body) await response.body.cancel(); } catch (e) {}
      if (cr) {
        const m = cr.match(/\/(\d+)\s*$/);
        if (m) return Number(m[1]);
      }
      const cl = response.headers.get('content-length');
      return cl ? Number(cl) : null;
    }

    // ---------- fase 2: MSE ----------
    let schedulerStarted = false;
    let resetPending = null;   // { startAt, preFetch } — reset/initialTime com janela pré-carregada
    let pendingRestore = null; // currentTime a aplicar após o append da janela alvo

    function computeSpan(t0, t1) {
      // mesma janela GOP-alinhada do buildFragment — o span cobre exatamente
      // as samples que vão pro fragmento
      const plan = planWindow(parsed, t0, t1);
      if (!plan) return null;
      const video = parsed.tracks.find(function (tr) { return tr.handler === 'vide'; });
      const audio = parsed.tracks.find(function (tr) { return tr.handler === 'soun'; });
      let spanStart = Infinity, spanEnd = -1;
      if (video && plan.videoStartIdx >= 0) {
        for (let i = plan.videoStartIdx; i < video.samples.length; i++) {
          const s = video.samples[i];
          if (s.dts >= plan.videoEndDts) break;
          if (s.offset < spanStart) spanStart = s.offset;
          if (s.offset + s.size > spanEnd) spanEnd = s.offset + s.size;
        }
      }
      if (audio) {
        const lo = plan.audioLo * audio.timescale, hi = plan.audioHi * audio.timescale;
        const idx = firstSampleAtOrAfter(audio.samples, lo);
        for (let i = idx; i < audio.samples.length; i++) {
          const s = audio.samples[i];
          if (s.dts >= hi) break;
          if (s.offset < spanStart) spanStart = s.offset;
          if (s.offset + s.size > spanEnd) spanEnd = s.offset + s.size;
        }
      }
      return spanEnd < 0 ? null : { spanStart: spanStart, spanEnd: spanEnd };
    }

    function setupMse() {
      ms = new global.MediaSource();
      objectUrl = URL.createObjectURL(ms);
      engine.usingMse = true;
      log('novo MediaSource ' + objectUrl.slice(-8) + (resetPending ? ' (reset p/ ' + resetPending.startAt.toFixed(1) + 's)' : ''));
      ms.addEventListener('sourceopen', onSourceOpen);
      video.src = objectUrl;
    }

    function onSourceOpen() {
      if (engine.destroyed) return;
      ms.removeEventListener('sourceopen', onSourceOpen);
      log('sourceopen (ms.readyState=' + ms.readyState + ')');
      try {
        sb = ms.addSourceBuffer(mime);
      } catch (e) {
        if (opts.onFallback) opts.onFallback('add_source_buffer');
        return;
      }
      try { sb.mode = 'segments'; } catch (e) {}
      sb.addEventListener('updateend', onSbUpdateEnd);
      sb.addEventListener('error', function () { if (opts.onFatal) opts.onFatal('mse_sourcebuffer'); });
      if (Number.isFinite(durationSec) && durationSec > 0) {
        try { ms.duration = durationSec; } catch (e) {}
      }
      appendQueue.push(initSegmentBytes);
      if (resetPending) {
        // Consome o reset: a janela alvo foi pré-buscada em paralelo — anexa-a
        // e restaura o currentTime SÓ DEPOIS (o browser reverte seeks pra
        // regiões sem dados, então a posição volta antes do buffer existir).
        const rp = resetPending;
        resetPending = null;
        rp.preFetch.then(function (result) {
          if (engine.destroyed || !sb) return;
          if (result) {
            try {
              const frag = buildFragment(parsed, result.bytes, result.spanStart, rp.startAt, rp.startAt + opts.segmentSeconds, seqNum++);
              if (frag) {
                engine.stats.windows++;
                appendQueue.push(frag.data);
                nextWindowStart = frag.windowEndSec;
                lastAppendedEndSec = Math.max(lastAppendedEndSec, frag.windowEndSec);
                pendingRestore = rp.restoreTime; // início real (keyframe) da janela
                log('janela-reset [' + rp.restoreTime.toFixed(1) + ',' + frag.windowEndSec.toFixed(1) + ')');
              }
            } catch (e) { /* janela inválida: scheduler cobre a partir de startAt */ }
          }
          // sem janela pré-buscada: libera o guard (escape de 6s cobre o pior)
          if (!result || !pendingRestore) restoring = false;
          pump();
        });
      }
      pump();
      startScheduler();
    }

    function onSbUpdateEnd() {
      log('updateend buffered=[' + rangesStr() + '] restoring=' + restoring + ' pendingRestore=' + pendingRestore);
      if (pendingRestore !== null && !sb.updating && appendQueue.length === 0) {
        const target = pendingRestore;
        pendingRestore = null;
        restoring = false; // só agora o guard libera: o buffer já cobre o alvo
        log('restore: currentTime → ' + target.toFixed(1) + ' (com buffer pronto)');
        try { video.currentTime = target; } catch (e) {}
        // play() é ESSENCIAL: num vídeo ended (paused=true), o Chromium não
        // engata o pipeline do novo MSE sem playback ativo — o buffered nunca
        // populava e o seek ficava em loop de resets.
        if ((!video.paused || video.ended) && video.play) {
          const p = video.play();
          if (p && p.catch) p.catch(function () {});
        }
        return;
      }
      pump();
      maybeEos();
    }

    function pump() {
      if (!sb || sb.updating || !appendQueue.length || engine.destroyed) return;
      const bytes = appendQueue.shift();
      log('append ' + bytes.length + 'B (queue ' + appendQueue.length + ')');
      try {
        const ab = bytes.buffer
          ? bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)
          : bytes;
        sb.appendBuffer(ab);
      } catch (e) {
        log('append THROW: ' + e.message);
        if (opts.onFatal) opts.onFatal('mse_append_failed');
      }
    }

    function maybeEos() {
      if (eosQueued || !ms || ms.readyState !== 'open' || sb.updating) return;
      if (durationSec && nextWindowStart >= durationSec - 0.25 && appendQueue.length === 0 && !fetchingWindow) {
        eosQueued = true;
        try { ms.endOfStream(); } catch (e) {}
      }
    }

    // ---------- fase 3: scheduler ----------
    function startScheduler() {
      if (schedulerStarted) return;
      schedulerStarted = true;
      timers.push(setInterval(tick, 350));
      timers.push(setInterval(evictAndWatchdog, 1000));
      on('seeking', onSeeking);
    }

    function bufferedAhead() {
      if (!sb || !sb.buffered.length) return 0;
      const t = video.currentTime;
      for (let i = 0; i < sb.buffered.length; i++) {
        if (t >= sb.buffered.start(i) - 0.1 && t <= sb.buffered.end(i) + 0.1) {
          return Math.max(0, sb.buffered.end(i) - t);
        }
      }
      return Math.max(0, sb.buffered.end(sb.buffered.length - 1) - t);
    }

    function inBuffered(t) {
      if (!sb || !sb.buffered.length) return false;
      // margem de 250ms: o primeiro PTS do buffer pode estar à frente do alvo
      // (priming do elst) — o MSE clampa o seek pro próximo keyframe de todo jeito.
      for (let i = 0; i < sb.buffered.length; i++) {
        if (t >= sb.buffered.start(i) - 0.25 && t <= sb.buffered.end(i) + 0.25) return true;
      }
      return false;
    }

    function tick() {
      if (engine.destroyed || !sb || fetchingWindow || eosQueued) return;
      if (durationSec && nextWindowStart >= durationSec - 0.05) { maybeEos(); return; }
      if (bufferedAhead() < opts.bufferAhead) {
        loadNextWindow();
      }
    }

    async function loadNextWindow() {
      if (fetchingWindow || engine.destroyed || !sb) return;
      fetchingWindow = true;
      const t0 = nextWindowStart;
      const t1 = t0 + opts.segmentSeconds;
      try {
        const span = computeSpan(t0, t1);
        if (!span) { eosQueued = true; maybeEos(); return; }
        const bytes = await fetchRange(span.spanStart, span.spanEnd - 1, opts.segmentTimeoutMs);
        const fragment = buildFragment(parsed, bytes, span.spanStart, t0, t1, seqNum++);
        if (!fragment) { eosQueued = true; maybeEos(); return; }
        engine.stats.windows++;
        engine.stats.lastAction = 'win[' + t0.toFixed(1) + ',' + fragment.windowEndSec.toFixed(1) + ')';
        appendQueue.push(fragment.data);
        nextWindowStart = fragment.windowEndSec;
        lastAppendedEndSec = Math.max(lastAppendedEndSec, fragment.windowEndSec);
        retryCount = 0;
        pump();
        log('janela [' + t0.toFixed(1) + ',' + fragment.windowEndSec.toFixed(1) + ') v:' + fragment.samplesVideo + ' a:' + fragment.samplesAudio);
      } catch (err) {
        if (engine.destroyed) return;
        retryCount++;
        if (retryCount <= opts.maxRetries) {
          const delay = 500 * Math.pow(2, retryCount - 1);
          log('retry ' + t0.toFixed(1) + 's em ' + delay + 'ms: ' + (err && err.message));
          fetchingWindow = false;
          setTimeout(function () { if (!engine.destroyed) tick(); }, delay);
          return;
        }
        if (opts.onFatal) opts.onFatal('mse_window_failed:' + (err && err.message));
      } finally {
        if (!engine.destroyed) fetchingWindow = false;
      }
    }

    function rangesStr() {
      if (!sb || !sb.buffered.length) return '';
      const parts = [];
      for (let i = 0; i < sb.buffered.length; i++) parts.push(sb.buffered.start(i).toFixed(2) + '-' + sb.buffered.end(i).toFixed(2));
      return parts.join(',');
    }

    function onSeeking() {
      if (engine.destroyed || !sb) return;
      engine.stats.seekEvents++;
      log('SEEKING t=' + video.currentTime.toFixed(2) + ' buf=[' + rangesStr() + '] restoring=' + restoring);
      // Seeks internos do restore pós-reset: o próprio reset já programou a
      // janela do alvo — reagir aqui criaria um ciclo infinito de resets.
      if (restoring) {
        if (inBuffered(video.currentTime)) restoring = false;
        return;
      }
      // captura o alvo IMEDIATAMENTE: o browser pode reverter o currentTime
      // (seek pra região sem dados em MSE 'ended') antes do debounce rodar.
      const t = video.currentTime;
      engine.stats.lastAction = 'seek@' + t.toFixed(1);
      if (inBuffered(t)) { engine.stats.lastAction += '/buffered'; return; }
      if (t <= 0.2 && nextWindowStart === 0 && fetchingWindow) return;
      if (seekDebounce) clearTimeout(seekDebounce);
      seekDebounce = setTimeout(function () {
        if (engine.destroyed || !sb) return;
        if (inBuffered(t)) return;
        if (fetchingWindow && t >= nextWindowStart - 0.2 && t <= nextWindowStart + opts.segmentSeconds) return;
        if (fetchController) { try { fetchController.abort(); } catch (e) {} fetchingWindow = false; }
        if (t >= lastAppendedEndSec - 0.5) {
          nextWindowStart = Math.max(t, 0);
          eosQueued = false;
          engine.stats.lastAction = 'seek-fwd ' + t.toFixed(1);
          log('seek fwd ' + t.toFixed(1) + 's');
        } else {
          engine.stats.lastAction = 'seek-back-reset ' + t.toFixed(1);
          log('seek back ' + t.toFixed(1) + 's → reset');
          resetMse(t);
        }
      }, 120);
    }

    function resetMse(startAt) {
      // circuit breaker: se os resets entram em loop sem o vídeo progredir
      // (edge: seek pós-ended com pipeline lazy do Chromium), cai pro nativo
      // em vez de girar pra sempre — o caller faz video.src = url e segue.
      resetLoopCount++;
      if (resetLoopCount > 4) {
        log('reset loop detectado — fatal');
        if (opts.onFatal) opts.onFatal('mse_reset_loop');
        return;
      }
      engine.stats.resets++;
      restoring = true;
      // escape: se algo travar, libera o handler de seek depois de um tempo
      setTimeout(function () { restoring = false; }, 6000);
      try { if (sb) sb.abort(); } catch (e) {}
      appendQueue.length = 0;
      eosQueued = false;
      lastAppendedEndSec = 0;
      const t0 = Math.max(0, startAt || 0);
      nextWindowStart = t0;
      try { if (ms && ms.readyState === 'open') ms.close(); } catch (e) {}
      if (objectUrl) { try { URL.revokeObjectURL(objectUrl); } catch (e) {} objectUrl = null; }
      beginReset(t0);
      setupMse();
    }

    /** Programa um reset/initialTime: pré-busca a janela alvo (GOP-alinhada,
     *  começa no próximo keyframe ≥ t0) em paralelo à montagem do MSE — o
     *  currentTime é restaurado pro INÍCIO REAL do buffer (o keyframe), não pro
     *  alvo cru, porque o browser reverte seeks pra regiões sem dados. */
    function beginReset(t0) {
      const plan = planWindow(parsed, t0, t0 + opts.segmentSeconds);
      const restoreTime = plan ? plan.startSec : t0;
      const preFetch = (async function () {
        try {
          if (!plan) return null;
          const span = computeSpan(t0, t0 + opts.segmentSeconds);
          if (!span) return null;
          const bytes = await fetchRange(span.spanStart, span.spanEnd - 1, opts.segmentTimeoutMs);
          return { bytes: bytes, spanStart: span.spanStart };
        } catch (e) { return null; }
      })();
      resetPending = { startAt: t0, restoreTime: restoreTime, preFetch: preFetch };
    }

    function evictAndWatchdog() {
      if (engine.destroyed || !sb) return;
      const now = Date.now();
      if (now - lastEvict > 5000 && sb.buffered.length && !sb.updating) {
        const start = sb.buffered.start(0);
        if (video.currentTime - start > opts.keepBehind) {
          try {
            sb.remove(start, Math.max(start, video.currentTime - opts.keepBehind + 10));
            lastEvict = now;
          } catch (e) {}
        }
      }
      const cur = video.currentTime || 0;
      // progresso de playback zera o circuit breaker de resets
      if (Math.abs(cur - lastLoopMarkTime) > 0.5) { resetLoopCount = 0; lastLoopMarkTime = cur; }
      if (!video.paused && !video.seeking && sb.buffered.length) {
        if (Math.abs(cur - lastCurrentTime) < 0.01 && bufferedAhead() < 0.3 && !fetchingWindow && !sb.updating && !appendQueue.length) {
          if (!stallSince) stallSince = now;
          else if (now - stallSince > opts.stallTimeoutMs) {
            stallSince = 0;
            log('stall → reset em ' + cur.toFixed(1) + 's');
            resetMse(cur);
            return;
          }
        } else stallSince = 0;
      } else stallSince = 0;
      lastCurrentTime = cur;
    }

    function destroy() {
      if (engine.destroyed) return;
      engine.destroyed = true;
      for (const t of timers) clearInterval(t);
      timers = [];
      if (seekDebounce) clearTimeout(seekDebounce);
      if (fetchController) { try { fetchController.abort(); } catch (e) {} }
      off();
      try { if (sb) sb.abort(); } catch (e) {}
      try { if (ms && ms.readyState === 'open') ms.close(); } catch (e) {}
      if (objectUrl) { try { URL.revokeObjectURL(objectUrl); } catch (e) {} }
    }

    // ---------- boot ----------
    (async function boot() {
      try {
        const header = await loadHeader();
        parsed = header.parsed;
        mime = buildMime(parsed);
        if (!mime || !global.MediaSource.isTypeSupported(mime)) {
          engine.destroyed = true;
          if (opts.onFallback) opts.onFallback('codec_unsupported:' + (mime || 'none'));
          return;
        }
        durationSec = parsed.mvhd.duration / parsed.mvhd.timescale;
        initSegmentBytes = buildInitSegment(parsed, header.ftypBytes);
        const initT = Math.max(0, Number(opts.initialTime) || 0);
        if (initT > 1) {
          // mesmo mecanismo do reset: janela alvo pré-carregada + restore com buffer
          restoring = true;
          setTimeout(function () { restoring = false; }, 6000);
          nextWindowStart = initT;
          beginReset(initT);
        }
        setupMse();
      } catch (err) {
        engine.destroyed = true;
        if (opts.onFallback) opts.onFallback('header_failed:' + (err && err.message));
      }
    })();

    return engine;
  }

  /* ================================================================
   * EXPORTS
   * ================================================================ */

  const api = {
    attach: attach,
    parseMp4: parseMp4,
    buildInitSegment: buildInitSegment,
    buildFragment: buildFragment,
    buildMime: buildMime,
    walkBoxes: walkBoxes,
    firstSampleAtOrAfter: firstSampleAtOrAfter,
    planWindow: planWindow,
    syncsOf: syncsOf,
    _BoxWriter: BoxWriter,
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api; // testes Node
  global.PlayInfinityMp4Mse = api;

})(typeof window !== 'undefined' ? window : globalThis);
