-- 前台用户与关联字段（生产环境 synchronize=false 时请手动执行；开发环境可由 TypeORM 自动同步）
-- charset 与项目一致 utf8mb4

CREATE TABLE IF NOT EXISTS `website_user` (
  `id` int NOT NULL AUTO_INCREMENT,
  `status` tinyint NOT NULL DEFAULT '1',
  `created_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  `email` varchar(255) NOT NULL,
  `password` varchar(255) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `IDX_website_user_email` (`email`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 若列已存在会报错，可忽略后手工核对
ALTER TABLE `cart` ADD COLUMN `user_id` int NULL;

ALTER TABLE `contact_message` ADD COLUMN `user_id` int NULL;
ALTER TABLE `contact_message` ADD COLUMN `admin_reply` text NULL;
ALTER TABLE `contact_message` ADD COLUMN `replied_at` datetime NULL;
