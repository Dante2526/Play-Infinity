import fs from "fs";
import path from "path";

// Blacklisted domains / patterns
const BLACKLISTED_HOSTS = [
  "vaiagora.vip",
  "vivlar.me",
  "s13-s1001604.lat",
  "s25-cloudfront-net.lat",
  "dadinhodetapioca.fun",
  "pomfy",
  "videasy",
  "starflix",
  "startflix",
  "superflix",
  "embedplay",
  "vidlink",
  "autoembed"
];

function isHostBlacklisted(urlStr) {
  try {
    const u = new URL(urlStr);
    const host = u.hostname.toLowerCase();
    if (host.endsWith(".invalid") || host === "localhost" || host === "127.0.0.1") return true;
    for (const b of BLACKLISTED_HOSTS) {
      if (host === b || host.endsWith("." + b)) return true;
    }
    const pathname = u.pathname.toLowerCase();
    if (pathname.endsWith(".html") || pathname.endsWith(".php") || pathname.endsWith(".txt")) return true;
    // Sem path ou porta suspeita sem m3u8
    if (!u.pathname || u.pathname === "/" || u.pathname === "") {
      if (!u.search.includes(".m3u8")) return true;
    }
  } catch {
    return true;
  }
  return false;
}

function parseExternalChannels(text) {
  const channels = [];
  let current = null;
  let currentFonte = null;

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;

    const sep = line.indexOf(":");
    if (sep < 0) continue;
    const key = line.slice(0, sep).trim().toLowerCase();
    const value = line.slice(sep + 1).trim();
    if (!value) continue;

    switch (key) {
      case "canal":
        current = { name: value, category: "", logo: "", fontes: [] };
        channels.push(current);
        currentFonte = null;
        break;
      case "categoria":
        if (current) current.category = value;
        break;
      case "logo":
        if (current) current.logo = value;
        break;
      case "fonte":
        if (current) {
          currentFonte = { raw: value, url: /^https?:\/\//i.test(value) ? value : null };
          current.fontes.push(currentFonte);
        }
        break;
      case "qualidade":
        if (currentFonte) currentFonte.qualidade = value;
        break;
      case "referer":
        if (currentFonte) currentFonte.referer = value;
        break;
      case "agente":
        if (currentFonte) currentFonte.agente = value;
        break;
      case "chave":
        if (currentFonte) currentFonte.chave = value;
        break;
      default:
        break;
    }
  }

  return channels.filter((c) => c.fontes.length > 0);
}

function parseExternalBases(text) {
  const bases = new Map();
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const m = line.match(/^base:\s*(\d+)\s+(\S+)/i);
    if (m) {
      bases.set(Number(m[1]), m[2].endsWith("/") ? m[2] : m[2] + "/");
    }
  }
  return bases;
}

function buildFonteUrl(fonte, bases) {
  if (fonte.url) return fonte.url;
  const m = fonte.raw.match(/^(\d+):(.+)$/);
  if (!m) return null;
  const base = bases.get(Number(m[1]));
  if (!base) return null;
  return base + m[2].replace(/^\/+/, "");
}

function checkMagicBytes(buf) {
  if (!buf || buf.length < 4) return false;
  // MPEG-TS sync byte 0x47
  if (buf[0] === 0x47 || (buf.length > 188 && buf[188] === 0x47) || (buf.length > 376 && buf[376] === 0x47)) {
    return true;
  }
  // AAC ADTS: 0xFFF (12 bits syncword)
  if (buf[0] === 0xff && (buf[1] & 0xf0) === 0xf0) return true;
  // ID3 header
  if (buf[0] === 0x49 && buf[1] === 0x44 && buf[2] === 0x33) return true;
  // MP4 container / fMP4 box atoms: ftyp, moof, styp, mdat
  const str = Buffer.from(buf.slice(0, 64)).toString("binary");
  if (str.includes("ftyp") || str.includes("moof") || str.includes("styp") || str.includes("mdat")) {
    return true;
  }
  return false;
}

/**
 * Fetch com timeout garantido cobrindo TANTO os headers QUANTO o body text!
 */
async function fetchTextWithTimeout(url, options = {}, timeoutMs = 3500) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      ...options,
      signal: controller.signal,
      redirect: "follow",
    });
    if (!res.ok) {
      return { ok: false, status: res.status };
    }
    const text = await res.text();
    return { ok: true, status: res.status, text, url: res.url || url };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Fetch com timeout garantido cobrindo TANTO os headers QUANTO o body buffer!
 */
async function fetchBufferWithTimeout(url, options = {}, timeoutMs = 3500) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      ...options,
      signal: controller.signal,
      redirect: "follow",
    });
    if (!res.ok && res.status !== 206) {
      return { ok: false, status: res.status };
    }
    const buf = new Uint8Array(await res.arrayBuffer());
    return { ok: true, status: res.status, buf, url: res.url || url };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Bateria profunda de estabilidade em 4 Fases:
 * 1. Manifesto HLS válido (> 40 bytes, #EXTM3U, sem HTML).
 * 2. Resolução de Master Playlist (se houver) para Variant Playlist.
 * 3. 1º Segmento: validação de conectividade, status 200/206 e magic bytes reais.
 * 4. 2º Segmento Consecutivo (Proteção Anti-Queda): validação após 1.0s de intervalo.
 * Timeout geral de 8.5s por fonte para nunca travar.
 */
async function probeFonteStability(targetUrl, headers = {}) {
  const startTime = Date.now();
  const runProbe = async () => {
    const ua = headers.agente || "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126.0";
    const ref = headers.referer || undefined;

    // Fase 1: Manifesto
    const manifestResult = await fetchTextWithTimeout(targetUrl, {
      headers: { "User-Agent": ua, ...(ref ? { Referer: ref } : {}) }
    }, 3500);

    if (!manifestResult.ok) {
      return { ok: false, reason: `manifest_http_${manifestResult.status}` };
    }

    const manifestText = manifestResult.text;
    if (!manifestText || manifestText.length < 30) {
      return { ok: false, reason: "manifest_empty" };
    }
    if (/<(!doctype|html|head|body)/i.test(manifestText)) {
      return { ok: false, reason: "manifest_is_html" };
    }
    if (!manifestText.includes("#EXTM3U") && !manifestText.includes("#EXT-X-")) {
      return { ok: false, reason: "manifest_missing_extm3u" };
    }

    // Fase 2: Master vs Media Playlist
    let finalPlaylistUrl = manifestResult.url;
    let playlistText = manifestText;

    if (manifestText.includes("#EXT-X-STREAM-INF")) {
      const lines = manifestText.split(/\r?\n/);
      let variantUri = null;
      for (let i = 0; i < lines.length; i++) {
        if (lines[i].includes("#EXT-X-STREAM-INF")) {
          for (let j = i + 1; j < lines.length; j++) {
            const candidate = lines[j].trim();
            if (candidate && !candidate.startsWith("#")) {
              variantUri = candidate;
              break;
            }
          }
          if (variantUri) break;
        }
      }

      if (!variantUri) {
        return { ok: false, reason: "master_playlist_no_variant" };
      }

      finalPlaylistUrl = new URL(variantUri, finalPlaylistUrl).href;
      const variantResult = await fetchTextWithTimeout(finalPlaylistUrl, {
        headers: { "User-Agent": ua, ...(ref ? { Referer: ref } : {}) }
      }, 3500);

      if (!variantResult.ok) {
        return { ok: false, reason: `variant_http_${variantResult.status}` };
      }

      playlistText = variantResult.text;
      finalPlaylistUrl = variantResult.url;
      if (!playlistText.includes("#EXTM3U") && !playlistText.includes("#EXT-X-")) {
        return { ok: false, reason: "variant_missing_extm3u" };
      }
    }

    // Extrai URLs de segmentos
    const segUris = [];
    for (const rawLine of playlistText.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (line && !line.startsWith("#")) {
        segUris.push(line);
      }
    }

    if (segUris.length === 0) {
      return { ok: false, reason: "playlist_has_no_segments" };
    }

    // Fase 3: 1º Segmento
    const seg1Url = new URL(segUris[0], finalPlaylistUrl).href;
    const seg1Result = await fetchBufferWithTimeout(seg1Url, {
      headers: {
        "User-Agent": ua,
        Range: "bytes=0-65535",
        Referer: finalPlaylistUrl
      }
    }, 3500);

    if (!seg1Result.ok) {
      return { ok: false, reason: `seg1_http_${seg1Result.status}` };
    }

    const seg1Buf = seg1Result.buf;
    if (seg1Buf.length < 500) {
      return { ok: false, reason: `seg1_too_small_${seg1Buf.length}` };
    }

    if (!checkMagicBytes(seg1Buf)) {
      return { ok: false, reason: "seg1_invalid_magic_bytes" };
    }

    // Fase 4: 2º Segmento Consecutivo (Verificação de não-queda / Anti-Queda)
    await new Promise((resolve) => setTimeout(resolve, 800));

    const seg2Target = segUris.length > 1 ? segUris[1] : segUris[0];
    const seg2Url = new URL(seg2Target, finalPlaylistUrl).href;
    const seg2Result = await fetchBufferWithTimeout(seg2Url, {
      headers: {
        "User-Agent": ua,
        Range: "bytes=0-65535",
        Referer: finalPlaylistUrl
      }
    }, 3500);

    if (!seg2Result.ok) {
      return { ok: false, reason: `seg2_dropped_http_${seg2Result.status}` };
    }

    const seg2Buf = seg2Result.buf;
    if (seg2Buf.length < 500) {
      return { ok: false, reason: `seg2_dropped_too_small_${seg2Buf.length}` };
    }

    if (!checkMagicBytes(seg2Buf)) {
      return { ok: false, reason: "seg2_dropped_invalid_magic_bytes" };
    }

    const latencyMs = Date.now() - startTime;
    return { ok: true, latencyMs, bytesTested: seg1Buf.length + seg2Buf.length };
  };

  // Trava rígida: nunca gasta mais de 8.5s em uma única fonte
  return Promise.race([
    runProbe(),
    new Promise((resolve) =>
      setTimeout(() => resolve({ ok: false, reason: "hard_timeout_8500ms" }), 8500)
    )
  ]).catch((err) => ({ ok: false, reason: `exception_${err.name || err.message}` }));
}

// ---------------------------------------------------------------------------
// Worker Pool Concorrente
// ---------------------------------------------------------------------------
async function processChannelsConcurrently(channels, bases, concurrency = 6, onProgress) {
  const results = [];
  let index = 0;
  let activeWorkers = 0;

  return new Promise((resolve) => {
    function startNext() {
      if (index >= channels.length && activeWorkers === 0) {
        return resolve(results);
      }

      while (activeWorkers < concurrency && index < channels.length) {
        const currentIndex = index++;
        const channel = channels[currentIndex];
        activeWorkers++;

        (async () => {
          const auditedFontes = [];
          for (let fi = 0; fi < channel.fontes.length; fi++) {
            const fonte = channel.fontes[fi];
            if (fonte.chave) {
              auditedFontes.push({ index: fi, ok: false, reason: "dash_unsupported" });
              continue;
            }

            const url = buildFonteUrl(fonte, bases);
            if (!url || isHostBlacklisted(url)) {
              auditedFontes.push({ index: fi, ok: false, reason: "blacklisted_or_invalid" });
              continue;
            }

            const probeResult = await probeFonteStability(url, {
              referer: fonte.referer,
              agente: fonte.agente
            });

            auditedFontes.push({
              index: fi,
              url,
              fonte,
              ...probeResult
            });

            // Se encontrou até 2 fontes estáveis, encerra o canal para economizar tempo
            const stableCount = auditedFontes.filter((f) => f.ok).length;
            if (stableCount >= 2) break;
          }

          const stableFontes = auditedFontes.filter((f) => f.ok);
          // Ordena fontes estáveis: fontes corruptx ou com menor latência no topo
          stableFontes.sort((a, b) => {
            const aIsCorruptx = (a.url || "").includes("corruptx.org") ? -1 : 0;
            const bIsCorruptx = (b.url || "").includes("corruptx.org") ? -1 : 0;
            if (aIsCorruptx !== bIsCorruptx) return aIsCorruptx - bIsCorruptx;
            return (a.latencyMs || 9999) - (b.latencyMs || 9999);
          });

          results[currentIndex] = {
            channel,
            stableFontes,
            allTested: auditedFontes
          };

          activeWorkers--;
          if (onProgress) {
            onProgress(currentIndex + 1, channels.length, channel.name, stableFontes.length);
          }
          startNext();
        })().catch((err) => {
          console.error(`Erro ao processar ${channel.name}:`, err);
          results[currentIndex] = { channel, stableFontes: [], error: String(err) };
          activeWorkers--;
          startNext();
        });
      }
    }

    startNext();
  });
}

// ---------------------------------------------------------------------------
// Execução Principal
// ---------------------------------------------------------------------------
async function main() {
  const channelsPath = process.argv[2] || "data/external-channels.txt";
  const basesPath = process.argv[3] || "data/external-bases.txt";
  const outputPath = process.argv[4] || "data/external-channels-clean.txt";
  const jsonReportPath = process.argv[5] || "data/audit-channels-result.json";
  const progressPath = "data/audit-progress.json";

  console.log(`[Auditoria de Estabilidade] Lendo canais de: ${channelsPath}`);
  const channelsText = fs.readFileSync(channelsPath, "utf8");
  const basesText = fs.existsSync(basesPath) ? fs.readFileSync(basesPath, "utf8") : "";

  const channels = parseExternalChannels(channelsText);
  const bases = parseExternalBases(basesText);

  console.log(`[Auditoria] Total de canais carregados: ${channels.length}`);
  console.log(`[Auditoria] Iniciando bateria profunda de testes (concorrência = 6)...`);

  const startTime = Date.now();
  let stableChannelsCount = 0;
  let droppedChannelsCount = 0;

  const results = await processChannelsConcurrently(channels, bases, 6, (curr, total, name, stableCount) => {
    if (stableCount > 0) {
      stableChannelsCount++;
    } else {
      droppedChannelsCount++;
    }

    const percent = ((curr / total) * 100).toFixed(1);
    const tag = stableCount > 0 ? `✅ ${stableCount} estável(eis)` : `❌ descartado`;
    console.log(`[${percent}%] [${curr}/${total}] ${name} -> ${tag}`);

    // Grava progresso em arquivo para consulta
    try {
      fs.writeFileSync(
        progressPath,
        JSON.stringify({
          current: curr,
          total,
          percent: Number(percent),
          stableChannelsCount,
          droppedChannelsCount,
          lastChannel: name,
          updatedAt: new Date().toISOString()
        }),
        "utf8"
      );
    } catch {}
  });

  const durationMin = ((Date.now() - startTime) / 60000).toFixed(1);
  console.log(`\n======================================================`);
  console.log(`[Auditoria Concluída em ${durationMin} min]`);
  console.log(`Total de canais analisados: ${channels.length}`);
  console.log(`Canais 100% ESTÁVEIS mantidos: ${stableChannelsCount}`);
  console.log(`Canais instáveis/mortos descartados: ${droppedChannelsCount}`);
  console.log(`======================================================\n`);

  // Gera novo arquivo external-channels.txt com apenas canais e fontes estáveis
  const outputLines = [
    `# PLAY INFINITY — LISTA DE CANAIS ESTÁVEIS AUDITADOS`,
    `# Data: ${new Date().toISOString()}`,
    `# Total de canais estáveis comprovados: ${stableChannelsCount}`,
    `#`,
    ``
  ];

  for (const item of results) {
    if (!item || item.stableFontes.length === 0) continue;
    const { channel, stableFontes } = item;

    outputLines.push(`canal: ${channel.name}`);
    if (channel.category) outputLines.push(`categoria: ${channel.category}`);
    if (channel.logo) outputLines.push(`logo: ${channel.logo}`);
    outputLines.push(``);

    for (const sf of stableFontes) {
      outputLines.push(`fonte: ${sf.url}`);
      if (sf.fonte.qualidade) outputLines.push(`qualidade: ${sf.fonte.qualidade}`);
      if (sf.fonte.referer) outputLines.push(`referer: ${sf.fonte.referer}`);
      if (sf.fonte.agente) outputLines.push(`agente: ${sf.fonte.agente}`);
    }
    outputLines.push(``);
  }

  // Grava o arquivo de canais limpo
  fs.writeFileSync(outputPath, outputLines.join("\n"), "utf8");
  console.log(`[Sucesso] Novo arquivo de canais estáveis salvo em: ${outputPath}`);

  // Grava o relatório JSON detalhado
  const reportData = {
    auditedAt: new Date().toISOString(),
    durationMin,
    totalChannels: channels.length,
    stableChannelsCount,
    droppedChannelsCount,
    channels: results.map((r) => ({
      name: r.channel.name,
      category: r.channel.category,
      stable: r.stableFontes.length > 0,
      stableFontesCount: r.stableFontes.length,
      details: r.allTested.map((f) => ({
        url: f.url,
        ok: f.ok,
        reason: f.reason,
        latencyMs: f.latencyMs
      }))
    }))
  };

  fs.writeFileSync(jsonReportPath, JSON.stringify(reportData, null, 2), "utf8");
  console.log(`[Sucesso] Relatório de auditoria salvo em: ${jsonReportPath}`);
}

main().catch((err) => {
  console.error("Erro fatal na auditoria:", err);
  process.exit(1);
});
