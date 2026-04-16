-- 产品文件类型表（多语言）+ 资源下载 lang_id / download_file_type_id，移除 language 文本列
-- 执行前请确认默认 lang_id（示例用 1）。

CREATE TABLE IF NOT EXISTS `download_file_type` (
  `id` int NOT NULL AUTO_INCREMENT,
  `status` tinyint NOT NULL DEFAULT '1',
  `created_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  `download_file_type_id` int DEFAULT NULL COMMENT '同类型多语言分组',
  `lang_id` int NOT NULL,
  `name` varchar(128) NOT NULL,
  `sort` int NOT NULL DEFAULT '0',
  PRIMARY KEY (`id`),
  KEY `FK_download_file_type_lang` (`lang_id`),
  CONSTRAINT `FK_download_file_type_lang` FOREIGN KEY (`lang_id`) REFERENCES `lang` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE `download`
  ADD COLUMN `lang_id` int NOT NULL DEFAULT 1 AFTER `series_id`,
  ADD COLUMN `download_file_type_id` int NULL AFTER `lang_id`;

UPDATE `download` d
  INNER JOIN `download_category` c ON c.id = d.resource_type_id
  SET d.lang_id = c.lang_id;

ALTER TABLE `download`
  ADD KEY `FK_download_lang` (`lang_id`),
  ADD KEY `FK_download_file_type` (`download_file_type_id`),
  ADD CONSTRAINT `FK_download_lang` FOREIGN KEY (`lang_id`) REFERENCES `lang` (`id`) ON DELETE CASCADE,
  ADD CONSTRAINT `FK_download_file_type` FOREIGN KEY (`download_file_type_id`) REFERENCES `download_file_type` (`id`) ON DELETE SET NULL;

ALTER TABLE `download` DROP COLUMN `language`;
