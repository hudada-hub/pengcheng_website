-- 将 contact_message 与前台「联系我们」表单字段对齐，并删除 title。
-- 在已有表结构上执行一次（备份后执行）。

ALTER TABLE `contact_message`
  DROP COLUMN `title`,
  CHANGE COLUMN `name` `full_name` varchar(128) NULL,
  CHANGE COLUMN `country` `nation` varchar(128) NULL,
  CHANGE COLUMN `company` `location_city` varchar(255) NULL,
  CHANGE COLUMN `phone` `phone_number` varchar(64) NULL;
