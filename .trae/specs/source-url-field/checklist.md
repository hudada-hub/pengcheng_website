# 联系表单与询价表单添加来源URL字段 - 验证清单

## 数据库变更
- [x] Checkpoint 1: contact_message 表添加 source_url 字段 (VARCHAR(512))
- [x] Checkpoint 2: member_cart_inquiry 表添加 source_url 字段 (VARCHAR(512))

## 实体类变更
- [x] Checkpoint 3: ContactMessage 实体包含 sourceUrl 属性
- [x] Checkpoint 4: MemberCartInquiry 实体包含 sourceUrl 属性

## 前端接口变更
- [x] Checkpoint 5: 联系表单提交接口支持 source_url 参数
- [x] Checkpoint 6: 询价表单提交接口支持 source_url 参数

## 后台列表变更
- [x] Checkpoint 7: /admin/cart-inquiries 列表显示来源列
- [x] Checkpoint 8: /admin/contact-messages 列表显示来源列

## 编译验证
- [x] Checkpoint 9: TypeScript 编译无错误