export default () => ({
  port: parseInt(process.env.PORT || '3000', 10),
  database: {
    host: process.env.DB_HOST || '47.116.106.247',
    port: parseInt(process.env.DB_PORT || '3306', 10),
    username: process.env.DB_USERNAME || 'pengcheng',
    password: process.env.DB_PASSWORD || 'KJYMhnMxiX4QjHaG',
    database: process.env.DB_DATABASE || 'pengcheng',
  },
  backup: {
    dir: process.env.DB_BACKUP_DIR || 'storage/db-backups',
    keepDays: parseInt(process.env.DB_BACKUP_KEEP_DAYS || '30', 10),
    mode: process.env.DB_BACKUP_MODE || 'auto', // auto | cli | docker
    dockerContainer: process.env.DB_BACKUP_DOCKER_CONTAINER || 'mysql',
  },
  redis: {
    host: process.env.REDIS_HOST || '47.116.106.247',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
    password: process.env.REDIS_PASSWORD || 'ZiFbtpcpc4eC5sPy',
    db: parseInt(process.env.REDIS_DB || '0', 10),
    ttlSeconds: parseInt(process.env.REDIS_TTL_DAYS || '7', 10) * 24 * 60 * 60,
    /** 前台页面公共数据（layout）缓存 TTL，默认 5 分钟 */
    layoutTtlSeconds: parseInt(
      process.env.REDIS_LAYOUT_TTL_SECONDS || '300',
      10,
    ),
  },
  session: {
    secret:
      process.env.SESSION_SECRET || 'pengcheng-session-secret-change-in-prod',
    /**
     * Session Cookie 的 Secure 标志。
     * 未设置时：production 为 true（仅 HTTPS 会带上 cookie），否则 false。
     * 若线上暂时只有 HTTP（如直连 IP:端口），需设 SESSION_COOKIE_SECURE=false，否则无法建立 session，CSRF 会报 Missing csrf secret。
     */
    cookieSecure: (() => {
      const v = (process.env.SESSION_COOKIE_SECURE || '').toLowerCase();
      if (v === 'false' || v === '0' || v === 'off') return false;
      if (v === 'true' || v === '1' || v === 'on') return true;
      return process.env.NODE_ENV === 'production';
    })(),
    // 支持用毫秒或天数配置（毫秒优先）
    maxAge:
      (process.env.SESSION_MAX_AGE_MS
        ? parseInt(process.env.SESSION_MAX_AGE_MS, 10)
        : undefined) ??
      (process.env.SESSION_MAX_AGE_DAYS
        ? parseInt(process.env.SESSION_MAX_AGE_DAYS, 10) * 24 * 60 * 60 * 1000
        : undefined) ??
      24 * 60 * 60 * 1000, // default: 1 day
  },
  auth: {
    adminUser: process.env.ADMIN_USER || 'admin',
    adminPassword: process.env.ADMIN_PASSWORD || 'admin123',
  },
  crm: {
    apiKey: process.env.CRM_API_KEY || '',
  },
});
