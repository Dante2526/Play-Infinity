/**
 * Regressão dos bugs corrigidos na auditoria multi-fase:
 *  1. Anti-SSRF e allowlist em redirecionamentos (httpSecurity, anidigitalRoutes, nixplayRoutes, saimoRoutes)
 *  2. Teto de 2MB em readTextWithCap e resposta oversized no proxy HLS
 *  3. Default audio="dub" em /api/anidigital-lookup e /api/anidigital-proxy-iframe
 *  4. VidSrc: reescrita de URI="..." em #EXT-X-KEY/#EXT-X-MAP e remoção de node-fetch
 *  5. VideoScrapers / MyEmbed / LivePlayerModal / PlaybackStartup: contratos estáticos e comportamentais
 */
const { test, describe } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const Module = require("node:module");
const crypto = require("node:crypto");
const esbuild = require("esbuild");
const express = require("express");

const ROOT = path.resolve(__dirname, "..");

function signTestUrl(url) {
  return crypto.createHmac("sha256", "audit-test-secret").update(String(url)).digest("hex");
}
function verifyTestUrl(url, sig) {
  if (!url || !sig) return false;
  try {
    return crypto.timingSafeEqual(Buffer.from(signTestUrl(url)), Buffer.from(String(sig)));
  } catch {
    return false;
  }
}

async function bundleCjs(entryCode, virtualName, sharedMocks = {}) {
  const sharedKeys = Object.keys(sharedMocks);
  globalThis.__AUDIT_MOCKS__ = globalThis.__AUDIT_MOCKS__ || {};
  Object.assign(globalThis.__AUDIT_MOCKS__, sharedMocks);

  const plugins = sharedKeys.length
    ? [
        {
          name: "audit-mocks",
          setup(build) {
            const escaped = sharedKeys.map((k) => k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
            const filter = new RegExp(`^(${escaped.join("|")})$`);
            build.onResolve({ filter }, (args) => ({ path: args.path, namespace: "audit-mocks" }));
            build.onLoad({ filter: /.*/, namespace: "audit-mocks" }, (args) => ({
              contents: `module.exports = globalThis.__AUDIT_MOCKS__[${JSON.stringify(args.path)}];`,
              loader: "js",
            }));
          },
        },
      ]
    : [];

  const out = await esbuild.build({
    stdin: { contents: entryCode, resolveDir: ROOT, loader: "ts" },
    bundle: true,
    platform: "node",
    format: "cjs",
    packages: "external",
    write: false,
    plugins,
  });

  const filename = path.join(ROOT, "tests", virtualName);
  const mod = new Module(filename, module);
  mod.filename = filename;
  mod.paths = module.paths;
  mod._compile(out.outputFiles[0].text, filename);
  return mod.exports;
}

describe("httpSecurity — Redirects Anti-SSRF e teto de leitura", () => {
  test("bloqueia 302 para IP privado e para domínio fora da allowlist antes de chamar fetch", async () => {
    const { fetchWithValidatedRedirects, RedirectBlockedError } = await bundleCjs(
      `export { fetchWithValidatedRedirects, RedirectBlockedError, readTextWithCap } from './server/utils/httpSecurity';`,
      "virtual-http-security-1.cjs"
    );

    const nativeFetch = global.fetch;
    const seen = [];
    try {
      global.fetch = async (url) => {
        seen.push(String(url));
        return new Response(null, { status: 302, headers: { location: "http://127.0.0.1:8080/internal" } });
      };
      await assert.rejects(
        () =>
          fetchWithValidatedRedirects("https://cdn.example.com/start.m3u8", {
            checkPrivateHost: async (h) => h === "127.0.0.1",
            validateUrl: () => true,
          }),
        (err) => err instanceof RedirectBlockedError && err.statusCode === 403
      );
      assert.deepEqual(seen, ["https://cdn.example.com/start.m3u8"]);

      seen.length = 0;
      global.fetch = async (url) => {
        seen.push(String(url));
        return new Response(null, { status: 302, headers: { location: "https://evil.example/payload" } });
      };
      await assert.rejects(
        () =>
          fetchWithValidatedRedirects("https://cdn.example.com/start.m3u8", {
            checkPrivateHost: async () => false,
            validateUrl: (u) => u.hostname === "cdn.example.com",
          }),
        (err) => err instanceof RedirectBlockedError && err.statusCode === 403
      );
      assert.deepEqual(seen, ["https://cdn.example.com/start.m3u8"]);
    } finally {
      global.fetch = nativeFetch;
    }
  });

  test("resolve Location relativo em domínio permitido e aborta loop > maxRedirects", async () => {
    const { fetchWithValidatedRedirects, RedirectBlockedError } = await bundleCjs(
      `export { fetchWithValidatedRedirects, RedirectBlockedError } from './server/utils/httpSecurity';`,
      "virtual-http-security-2.cjs"
    );

    const nativeFetch = global.fetch;
    const seen = [];
    try {
      global.fetch = async (url) => {
        seen.push(String(url));
        if (seen.length === 1) {
          return new Response(null, { status: 302, headers: { location: "/edge/master.m3u8" } });
        }
        return new Response("#EXTM3U\n", { status: 200 });
      };
      const res = await fetchWithValidatedRedirects("https://cdn.example.com/root/play.m3u8", {
        maxRedirects: 4,
        checkPrivateHost: async () => false,
        validateUrl: (u) => u.hostname === "cdn.example.com",
      });
      assert.equal(res.status, 200);
      assert.deepEqual(seen, [
        "https://cdn.example.com/root/play.m3u8",
        "https://cdn.example.com/edge/master.m3u8",
      ]);

      global.fetch = async () => new Response(null, { status: 302, headers: { location: "/loop" } });
      await assert.rejects(
        () =>
          fetchWithValidatedRedirects("https://cdn.example.com/loop", {
            maxRedirects: 3,
            checkPrivateHost: async () => false,
            validateUrl: () => true,
          }),
        (err) => err instanceof RedirectBlockedError && err.statusCode === 502
      );
    } finally {
      global.fetch = nativeFetch;
    }
  });

  test("readTextWithCap rejeita payload acima do limite por Content-Length ou stream", async () => {
    const { readTextWithCap } = await bundleCjs(
      `export { readTextWithCap } from './server/utils/httpSecurity';`,
      "virtual-http-security-3.cjs"
    );

    const bigHeaderRes = new Response("ok", { status: 200, headers: { "content-length": "5000000" } });
    const h = await readTextWithCap(bigHeaderRes, 1024);
    assert.equal(h.exceeded, true);

    const streamBody = new ReadableStream({
      start(controller) {
        controller.enqueue(new Uint8Array(600));
        controller.enqueue(new Uint8Array(600));
        controller.close();
      },
    });
    const bigStreamRes = new Response(streamBody, { status: 200 });
    const s = await readTextWithCap(bigStreamRes, 1000);
    assert.equal(s.exceeded, true);

    const okRes = new Response("#EXTM3U\n#EXTINF:5,\nseg.ts", { status: 200 });
    const o = await readTextWithCap(okRes, 1024);
    assert.equal(o.exceeded, false);
    assert.match(o.text, /^#EXTM3U/);
  });
});

describe("AnimesDigital Router — redirect SSRF e áudio padrão dublado", () => {
  test("bloqueia redirect para host não permitido, respeita 2MB e usa dub como padrão", async () => {
    const lookupCalls = [];
    const { anidigitalRouter } = await bundleCjs(
      `export { anidigitalRouter } from './server/routes/anidigitalRoutes';`,
      "virtual-anidigital-routes.cjs",
      {
        "../utils/helpers": {
          isPrivateOrLocalHost: async (h) => h === "127.0.0.1",
          signProxyUrl: signTestUrl,
          verifyProxySignature: verifyTestUrl,
        },
        "../services/anidigitalResolver": {
          ANIDIGITAL_BASE: "https://animesdigital.org",
          isAnidigitalCdnUrl: (u) => /cdn-s\d+\.mywallpaper-4k-image\.net/i.test(u),
          rewriteAnidigitalPlaylist: (t) => t,
          buildAnidigitalWrapperHtml: (u) => `<video src="${u}"></video>`,
          resolveAnidigitalStream: async (opts) => {
            lookupCalls.push(opts);
            return {
              m3u8: "https://cdn-s1.mywallpaper-4k-image.net/stream.m3u8",
              dub: true,
              leg: false,
              title: "Anime Test",
            };
          },
        },
      }
    );

    const app = express();
    app.use(anidigitalRouter);
    let server;
    const nativeFetch = global.fetch;
    try {
      await new Promise((r) => {
        server = app.listen(0, "127.0.0.1", r);
      });
      const base = `http://127.0.0.1:${server.address().port}`;

      const rLookup = await nativeFetch(`${base}/api/anidigital-lookup?tmdb_id=1234&type=tv&s=2&e=1`);
      assert.equal(rLookup.status, 200);
      assert.equal(lookupCalls.at(-1).audio, "dub");

      const rIframe = await nativeFetch(`${base}/api/anidigital-proxy-iframe?tmdb_id=1234&type=tv&s=2&e=1`);
      assert.equal(rIframe.status, 200);
      assert.equal(lookupCalls.at(-1).audio, "dub");

      const cdnUrl = "https://cdn-s1.mywallpaper-4k-image.net/ep1/playlist.m3u8";
      const sig = signTestUrl(cdnUrl);
      global.fetch = async () => new Response(null, { status: 302, headers: { location: "http://127.0.0.1/secret" } });
      const rSsrf = await nativeFetch(
        `${base}/api/anidigital-stream?u=${encodeURIComponent(cdnUrl)}&sig=${encodeURIComponent(sig)}`
      );
      assert.equal(rSsrf.status, 403);

      global.fetch = async () =>
        new Response("#EXTM3U", { status: 200, headers: { "content-length": "5000000" } });
      const rBig = await nativeFetch(
        `${base}/api/anidigital-stream?u=${encodeURIComponent(cdnUrl)}&sig=${encodeURIComponent(sig)}`
      );
      assert.equal(rBig.status, 502);
    } finally {
      global.fetch = nativeFetch;
      if (server) {
        server.closeAllConnections?.();
        await new Promise((r) => server.close(r));
      }
    }
  });
});

describe("Nixplay Proxy — bloqueio de 302 para IP privado e host não autorizado", () => {
  test("bloqueia redirect 302 para metadata OCI e domínio externo sem 2o fetch", async () => {
    const { default: nixplayRouter } = await bundleCjs(
      `export { default } from './server/routes/nixplayRoutes';`,
      "virtual-nixplay-redirect.cjs",
      {
        "../utils/helpers": {
          isPrivateOrLocalHost: async (h) => h === "169.254.169.254" || h === "127.0.0.1",
        },
      }
    );

    const app = express();
    app.use(nixplayRouter);
    let server;
    const nativeFetch = global.fetch;
    const seen = [];
    try {
      await new Promise((r) => {
        server = app.listen(0, "127.0.0.1", r);
      });
      const base = `http://127.0.0.1:${server.address().port}`;
      const startUrl = "https://pub-abc123.r2.dev/video.mp4";

      global.fetch = async (url) => {
        seen.push(String(url));
        return new Response(null, { status: 302, headers: { location: "http://169.254.169.254/latest/meta-data" } });
      };
      const rMeta = await nativeFetch(`${base}/api/nixplay-proxy?url=${encodeURIComponent(startUrl)}`);
      assert.equal(rMeta.status, 403);
      assert.deepEqual(seen, [startUrl]);

      seen.length = 0;
      global.fetch = async (url) => {
        seen.push(String(url));
        return new Response(null, { status: 302, headers: { location: "https://evil.example/payload.mp4" } });
      };
      const rExt = await nativeFetch(`${base}/api/nixplay-proxy?url=${encodeURIComponent(startUrl)}`);
      assert.equal(rExt.status, 403);
      assert.deepEqual(seen, [startUrl]);
    } finally {
      global.fetch = nativeFetch;
      if (server) {
        server.closeAllConnections?.();
        await new Promise((r) => server.close(r));
      }
    }
  });
});

describe("Regressões de Contratos Estáticos (VidSrc, VideoScrapers, Server, LivePlayerModal)", () => {
  test("vidsrcRoutes reescreve URI= em tags #EXT-X-* e não usa node-fetch", () => {
    const src = fs.readFileSync(path.join(ROOT, "server/routes/vidsrcRoutes.ts"), "utf-8");
    assert.ok(!src.includes('require("node-fetch")'), "node-fetch deve ser substituído por fetch nativo");
    assert.match(src, /URI="\(\[\^"\]\+\)"/i, "rewriteM3u8 deve reescrever URI=\"...\" em tags");
    assert.match(src, /\/api\/vidsrc-proxy\?url=/);
  });

  test("videoScrapers aplica &sig= no MyEmbed, readTextWithCap em HLS e não sombreia SEEK_RELATIVE", () => {
    const src = fs.readFileSync(path.join(ROOT, "server/routes/videoScrapers.ts"), "utf-8");
    assert.ok(
      !/case\s+"SEEK_ABSOLUTE":\s*case\s+"SEEK_RELATIVE":/m.test(src),
      "SEEK_RELATIVE não pode cair no handler de SEEK_ABSOLUTE"
    );
    assert.ok(src.includes("&sig=${signProxyUrl(m3u8Source)}"), "MyEmbed precisa assinar a URL do proxy");
    const liveProxySlice = src.slice(src.indexOf('"/api/live-stream-proxy"'), src.indexOf('"/api/myembed-stream"'));
    assert.ok(liveProxySlice.length > 100);
    assert.ok(!liveProxySlice.includes("await upstreamRes.text()"), "live-stream-proxy não pode chamar upstreamRes.text() sem teto");
  });

  test("server.ts aplica rate-limit nos proxies de segmento e isServerBlacklisted no PlayerFlix", () => {
    const src = fs.readFileSync(path.join(ROOT, "server.ts"), "utf-8");
    assert.ok(src.includes("/saimo-hls-segment"));
    assert.ok(src.includes("/nixplay-proxy"));
    assert.ok(src.includes("/anidigital-stream"));
    assert.ok(src.includes("!isServerBlacklisted(embedUrl)"));
  });

  test("LivePlayerModal.tsx preserva proxyBase nativo no bolodechocolate, cleanup DASH e cache-buster", () => {
    const src = fs.readFileSync(path.join(ROOT, "src/components/LivePlayerModal.tsx"), "utf-8");
    assert.ok(src.includes("${proxyBase}/api/bolodechocolate?canal="));
    assert.ok(src.includes("video.removeEventListener('waiting', handleDashWaiting)"));
    assert.ok(src.includes("triggerDashError"));
    assert.ok(src.includes("_cb=${reloadNonce}"));
  });
});
