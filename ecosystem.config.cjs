module.exports = {
  apps: [
    {
      name: "gtubeversor",
      script: "server.js",
      cwd: __dirname,
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: "900M",
      env: {
        NODE_ENV: "production",
        PORT: 3020,
        RECENT_LIMIT: 60,
        RECENT_RETENTION_DAYS: 30,
        RECENT_RESPONSE_DEFAULT: 12,
      },
    },
  ],
};

