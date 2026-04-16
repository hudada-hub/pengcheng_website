-- 文件下载记录：文件行 id、来源页 URL、用户 user_id；下载时间用 created_at
CREATE TABLE IF NOT EXISTS `download_file_record` (
  `id` int NOT NULL AUTO_INCREMENT,
  `status` tinyint NOT NULL DEFAULT '1',
  `created_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  `file_id` int DEFAULT NULL,
  `from_page_url` varchar(1024) DEFAULT NULL,
  `user_id` int DEFAULT NULL,
  `user_agent` text DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_download_file_record_file_id` (`file_id`),
  KEY `idx_download_file_record_user_id` (`user_id`),
  CONSTRAINT `FK_download_file_record_file` FOREIGN KEY (`file_id`) REFERENCES `download` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
