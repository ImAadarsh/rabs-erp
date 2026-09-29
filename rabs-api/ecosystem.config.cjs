module.exports = {
  apps: [
    {
      name: 'rabs-api',
      script: 'dist/server.js',
      cwd: '/var/www/rabs-api',
      instances: 1,
      exec_mode: 'fork',
      watch: false,
      max_memory_restart: '500M',
      env: {
        NODE_ENV: 'production',
        PORT: 4015
      },
      error_file: '/var/log/pm2/rabs-api-error.log',
      out_file: '/var/log/pm2/rabs-api-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
      autorestart: true,
      max_restarts: 10,
      min_uptime: '10s'
    }
  ]
};
