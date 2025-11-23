// PM2 Ecosystem Configuration
// For production deployment with multiple processes

module.exports = {
  apps: [
    // Main API Server - Clustered
    {
      name: 'pythoughts-api',
      script: 'dist/index.js',
      instances: 'max', // Use all available CPUs
      exec_mode: 'cluster',
      autorestart: true,
      watch: false,
      max_memory_restart: '512M',
      env: {
        NODE_ENV: 'production',
        PORT: 3000,
      },
      // Graceful shutdown
      kill_timeout: 5000,
      wait_ready: true,
      listen_timeout: 10000,
      // Health monitoring
      max_restarts: 10,
      min_uptime: '10s',
      // Logging
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      error_file: 'logs/api-error.log',
      out_file: 'logs/api-out.log',
      merge_logs: true,
      // Performance
      node_args: '--max-old-space-size=384',
    },

    // Background Worker - Email, Notifications
    {
      name: 'pythoughts-worker',
      script: 'dist/worker.js',
      instances: 2,
      exec_mode: 'cluster',
      autorestart: true,
      watch: false,
      max_memory_restart: '256M',
      env: {
        NODE_ENV: 'production',
        WORKER_TYPE: 'all',
        WORKER_PORT: 3001,
        WORKER_CONCURRENCY: 5,
      },
      // Graceful shutdown
      kill_timeout: 10000,
      wait_ready: true,
      // Health monitoring
      max_restarts: 10,
      min_uptime: '10s',
      // Logging
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      error_file: 'logs/worker-error.log',
      out_file: 'logs/worker-out.log',
      merge_logs: true,
    },

    // Scheduler - Single instance for scheduled publishing
    {
      name: 'pythoughts-scheduler',
      script: 'dist/worker.js',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      max_memory_restart: '128M',
      env: {
        NODE_ENV: 'production',
        WORKER_TYPE: 'scheduler',
        WORKER_PORT: 3002,
      },
      // Cron restart daily at 3am for memory cleanup
      cron_restart: '0 3 * * *',
      // Health monitoring
      max_restarts: 10,
      min_uptime: '10s',
      // Logging
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      error_file: 'logs/scheduler-error.log',
      out_file: 'logs/scheduler-out.log',
    },
  ],

  // Deployment configuration
  deploy: {
    production: {
      user: 'deploy',
      host: ['server1.pythoughts.com', 'server2.pythoughts.com'],
      ref: 'origin/main',
      repo: 'git@github.com:yourusername/pythoughts.git',
      path: '/var/www/pythoughts',
      'pre-deploy-local': '',
      'post-deploy':
        'npm ci && npm run build && pm2 reload ecosystem.config.cjs --env production',
      'pre-setup': '',
      env: {
        NODE_ENV: 'production',
      },
    },
    staging: {
      user: 'deploy',
      host: 'staging.pythoughts.com',
      ref: 'origin/develop',
      repo: 'git@github.com:yourusername/pythoughts.git',
      path: '/var/www/pythoughts-staging',
      'post-deploy':
        'npm ci && npm run build && pm2 reload ecosystem.config.cjs --env staging',
      env: {
        NODE_ENV: 'staging',
      },
    },
  },
};
