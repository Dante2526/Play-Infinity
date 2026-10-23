// Read PM2 JSON from stdin; never print environment variables or credentials.
let input = '';
process.stdin.on('data', chunk => { input += chunk; });
process.stdin.on('end', () => {
  try {
    const apps = JSON.parse(input).filter(app => app.name === 'play-infinity-app');
    const expectedRelease = process.argv[2];
    const allowAbsent = process.argv.includes('--allow-absent');
    if (apps.length === 0 && allowAbsent) process.exit(3);
    if (apps.length !== 2 || apps.some(app =>
      app.pm2_env?.exec_mode !== 'cluster_mode' || app.pm2_env?.status !== 'online' ||
      (expectedRelease && app.pm2_env?.APP_RELEASE_ID !== expectedRelease))) {
      throw new Error('Esperadas duas instâncias online em cluster da versão solicitada.');
    }
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
});
