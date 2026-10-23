// Read PM2 JSON from stdin; never print environment variables or credentials.
let input = '';
process.stdin.on('data', chunk => { input += chunk; });
process.stdin.on('end', () => {
  let processes;
  try {
    processes = JSON.parse(input);
    if (!Array.isArray(processes)) throw new Error();
  } catch {
    // A parser error can quote raw PM2 input, including environment secrets.
    console.error('Não foi possível ler a lista JSON de processos do PM2.');
    process.exit(1);
  }
  try {
    const apps = processes.filter(app => app.name === 'play-infinity-app');
    const expectedRelease = process.argv[2];
    const allowAbsent = process.argv.includes('--allow-absent');
    if (apps.length === 0 && allowAbsent) process.exit(3);
    if (!expectedRelease && process.argv.includes('--allow-legacy-fork') &&
        apps.length === 1 && apps[0].pm2_env?.exec_mode === 'fork_mode' && apps[0].pm2_env?.status === 'online') {
      console.error('Instalação legada com uma instância fork: migração de manutenção solicitada.');
      process.exit(4);
    }
    if (apps.length !== 2 || apps.some(app =>
      app.pm2_env?.exec_mode !== 'cluster_mode' || app.pm2_env?.status !== 'online' ||
      (expectedRelease && app.pm2_env?.APP_RELEASE_ID !== expectedRelease))) {
      const summary = apps.map(app => ({
        id: app.pm_id,
        mode: app.pm2_env?.exec_mode || 'desconhecido',
        status: app.pm2_env?.status || 'desconhecido',
        ...(expectedRelease ? { expectedRelease: app.pm2_env?.APP_RELEASE_ID === expectedRelease } : {}),
      }));
      console.error(`PM2 da aplicação: ${JSON.stringify(summary)}`);
      throw new Error(`Encontradas ${apps.length} instâncias; são necessárias duas online em cluster${expectedRelease ? ' da versão solicitada' : ''}.`);
    }
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
});
