-- 访问量汇总 user_id、访问明细 user_id、下载记录 user_agent（已建表环境请执行 ALTER）
ALTER TABLE `page_stats`
  ADD COLUMN `user_id` int DEFAULT NULL COMMENT '最近一笔已计数访问的用户 website_user.id' AFTER `last_view_at`;

ALTER TABLE `page_visit_log`
  ADD COLUMN `user_id` int DEFAULT NULL AFTER `browser_hint`;

ALTER TABLE `download_file_record`
  ADD COLUMN `user_agent` text DEFAULT NULL AFTER `user_id`;
