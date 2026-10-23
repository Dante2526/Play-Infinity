const fs = require('node:fs');
const path = require('node:path');
const current = path.join(__dirname, 'current');
// Resolve the symlink once. Old workers keep their own immutable working dir.
const releaseDir = fs.realpathSync(process.env.PLAY_INFINITY_RELEASE_DIR ||
  (fs.existsSync(current) ? current : __dirname));
const configuredDrain = Number(process.env.APP_DRAIN_TIMEOUT_MS);
const drainTimeout = Number.isSafeInteger(configuredDrain) && configuredDrain > 0
  ? configuredDrain : 2 * 60 * 60 * 1000;

module.exports = {
  apps: [
    {
      name: "play-infinity-app",
      cwd: releaseDir,
      script: path.join(releaseDir, "dist/server.cjs"),
      instances: 2,
      exec_mode: "cluster",
      wait_ready: true,
      listen_timeout: 30000,
      kill_timeout: drainTimeout + 30000,
      max_memory_restart: "1G",
      env: {
        NODE_ENV: "production",
        PORT: Number(process.env.PLAY_INFINITY_PORT || 3000),
        APP_DRAIN_TIMEOUT_MS: String(drainTimeout),
        APP_RELEASE_ID: fs.existsSync(current) || process.env.PLAY_INFINITY_RELEASE_DIR
          ? path.basename(releaseDir) : 'legacy',
        APP_ASSET_DIR: path.join(__dirname, 'shared-assets')
      }
    }
  ]
};
