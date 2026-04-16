-- 购物车询价订单、行绑定 UUID、询价表单；联系留言关联询价订单。
-- 部署后手动执行（synchronize=false）。

CREATE TABLE IF NOT EXISTS `member_cart_inquiry_order` (
  `id` int NOT NULL AUTO_INCREMENT,
  `status` tinyint NOT NULL DEFAULT 1,
  `created_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  `order_uuid` char(36) NOT NULL,
  `user_id` int NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_member_cart_inquiry_order_uuid` (`order_uuid`),
  KEY `idx_member_cart_inquiry_order_user` (`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `member_cart_inquiry` (
  `id` int NOT NULL AUTO_INCREMENT,
  `status` tinyint NOT NULL DEFAULT 1,
  `created_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  `user_id` int NOT NULL,
  `inquiry_order_uuid` char(36) NOT NULL,
  `full_name` varchar(128) DEFAULT NULL,
  `email` varchar(128) DEFAULT NULL,
  `nation` varchar(128) DEFAULT NULL,
  `location_city` varchar(255) DEFAULT NULL,
  `phone_number` varchar(64) DEFAULT NULL,
  `message` text,
  PRIMARY KEY (`id`),
  KEY `idx_member_cart_inquiry_user` (`user_id`),
  KEY `idx_member_cart_inquiry_order` (`inquiry_order_uuid`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

ALTER TABLE `member_cart_item`
  ADD COLUMN `inquiry_order_uuid` char(36) DEFAULT NULL AFTER `qty`,
  ADD KEY `idx_member_cart_item_inquiry_order` (`inquiry_order_uuid`);

-- 解除「同车同 product 唯一」：询价绑定 UUID 后仍占一行，用户需能再次加入同款产品到当前车。
-- MySQL 会把子表外键挂在 (cart_id, product_id) 唯一索引上，直接 DROP INDEX 会报：
-- Cannot drop index 'uq_member_cart_item_cart_product': needed in a foreign key constraint
-- 因此必须先删外键，再删唯一索引，再按 cart_id 上的普通索引重建外键（与 2026-04-01 DDL 中 IDX_member_cart_item_cart_id 一致）。
ALTER TABLE `member_cart_item` DROP FOREIGN KEY `FK_member_cart_item_cart_id`;

ALTER TABLE `member_cart_item` DROP INDEX `uq_member_cart_item_cart_product`;

ALTER TABLE `member_cart_item`
  ADD CONSTRAINT `FK_member_cart_item_cart_id` FOREIGN KEY (`cart_id`) REFERENCES `member_cart` (`id`) ON DELETE CASCADE;

ALTER TABLE `contact_message`
  ADD COLUMN `inquiry_order_uuid` varchar(36) DEFAULT NULL AFTER `user_id`,
  ADD KEY `idx_contact_message_inquiry_order` (`inquiry_order_uuid`);
