const [url, expected] = process.argv.slice(2);
(async () => {
  const response = await fetch(url, { signal: AbortSignal.timeout(5000) });
  if (!response.ok) throw new Error(`Healthcheck HTTP ${response.status}`);
  const body = await response.json();
  if (body.status !== 'ok' || body.release !== expected || body.codeRelease !== expected) throw new Error('Versão do código executado incorreta no healthcheck');
})().catch(error => { console.error(error.message); process.exitCode = 1; });
