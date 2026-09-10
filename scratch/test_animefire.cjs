const https = require('https');

function testDomain(host, path = '/') {
  return new Promise((resolve) => {
    const req = https.get({
      hostname: host,
      path: path,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'pt-BR,pt;q=0.9'
      },
      timeout: 6000
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve({ host, status: res.statusCode, location: res.headers.location, title: data.match(/<title>([^<]+)<\/title>/i)?.[1], len: data.length }));
    });
    req.on('error', e => resolve({ host, error: e.message }));
    req.on('timeout', () => { req.destroy(); resolve({ host, error: 'timeout' }); });
  });
}

async function main() {
  const domains = [
    'animefire.plus',
    'animefire.vip',
    'animefire.net',
    'animesonlinecc.to',
    'anroll.net',
    'betteranime.net'
  ];
  for (const d of domains) {
    const r = await testDomain(d);
    console.log(d, "->", r.status, r.location || '', r.title || r.error || '');
  }
}

main().catch(console.error);
