async function test() {
  const r = await fetch('https://vidlink.pro/tv/30984/1/1', { headers: { 'User-Agent': 'Mozilla/5.0' } });
  const html = await r.text();
  const scriptRegex = /<script[^>]+src="([^">]+)"/g;
  const scripts = [...html.matchAll(scriptRegex)].map(m => m[1]);

  for (let s of scripts) {
    const url = s.startsWith('http') ? s : 'https://vidlink.pro' + s;
    const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    if (res.ok) {
      const text = await res.text();
      if (text.includes('addEventListener("message"') || text.includes("addEventListener('message'")) {
        console.log('Vidlink listens to message in:', url);
      }
    }
  }
  console.log('Done checking message listeners.');
}
test();
