const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const digest = value => createHash('sha256').update(value).digest('hex');
const dist = path.join(process.argv[2], 'dist');
const html = fs.readFileSync(path.join(dist, 'index.html'));
const expected = digest(html);
const assets = [...new Set([...html.toString().matchAll(/(?:src|href)=["'](\/assets\/[^"']+)["']/g)].map(m => m[1]))];
const url = new URL(process.argv[3]);
url.searchParams.set('deploy-check', path.basename(process.argv[2]));
(async () => {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const response = await fetch(url, { headers: { 'Cache-Control': 'no-cache' }, signal: AbortSignal.timeout(10000) });
      if (response.ok && digest(Buffer.from(await response.arrayBuffer())) === expected) {
        await Promise.all(assets.map(async asset => {
          const remote = await fetch(new URL(asset, url), { signal: AbortSignal.timeout(10000) });
          if (!remote.ok || digest(Buffer.from(await remote.arrayBuffer())) !== digest(fs.readFileSync(path.join(dist, asset)))) {
            throw new Error('Asset público difere da versão.');
          }
        }));
        console.log('HTML público corresponde à versão implantada.'); return;
      }
    } catch { /* Report only the final bounded failure, no URLs or HTML. */ }
    if (attempt < 2) await new Promise(resolve => setTimeout(resolve, 1000));
  }
  throw new Error('Backend atualizado, mas o HTML público difere da versão. Verifique o root/cache do Nginx antes de declarar deploy completo.');
})().catch(error => { console.error(error.message); process.exitCode = 1; });
