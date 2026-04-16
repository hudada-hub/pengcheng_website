-- 单独补齐 `admin` 表（生产环境 synchronize=false 且未导入全库时使用）
-- 用法示例：mysql -u用户 -p 库名 < scripts/mysql-admin-table.sql
-- 完整业务仍需导入 storage/db-backups 下全量备份。

CREATE TABLE IF NOT EXISTS `admin` (
  `id` int NOT NULL AUTO_INCREMENT,
  `status` tinyint NOT NULL DEFAULT '1',
  `created_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  `username` varchar(64) NOT NULL,
  `password` varchar(255) NOT NULL,
  `is_system` tinyint NOT NULL DEFAULT '0',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_admin_username` (`username`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
