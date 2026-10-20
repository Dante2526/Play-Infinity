module.exports = {
  apps: [
    {
      name: "play-infinity-app",
      script: "dist/server.cjs",
      instances: 2,
      exec_mode: "cluster",
      wait_ready: true,
      listen_timeout: 10000,
      kill_timeout: 8000,
      max_memory_restart: "1G",
      env: {
        NODE_ENV: "production",
        PORT: 3000
      }
    }
  ]
};
