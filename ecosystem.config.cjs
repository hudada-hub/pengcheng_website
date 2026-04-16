/** PM2 配置 - 用于 1Panel 或本地部署 */
module.exports = {
  apps: [
    {
      name: 'pengcheng',
      script: 'dist/src/main.js',
      cwd: __dirname,
      instances: 1,
      exec_mode: 'fork',
      env: { NODE_ENV: 'development' },
      env_production: { NODE_ENV: 'production' },
      max_memory_restart: '500M',
      watch: false,
    },
  ],
};
