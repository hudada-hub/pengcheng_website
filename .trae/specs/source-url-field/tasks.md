# 联系表单与询价表单添加来源URL字段 - 实现计划

## [x] Task 1: 修改 ContactMessage 实体添加 source_url 字段
- **Priority**: P0
- **Depends On**: None
- **Description**:
  - 在 contact-message.entity.ts 中添加 sourceUrl 字段
  - 类型: VARCHAR(512), nullable
- **Acceptance Criteria Addressed**: AC-1
- **Test Requirements**:
  - `programmatic` TR-1.1: 实体文件编译无错误
- **Notes**: 需要手动执行数据库 ALTER TABLE

## [x] Task 2: 修改 MemberCartInquiry 实体添加 source_url 字段
- **Priority**: P0
- **Depends On**: None
- **Description**:
  - 在 member-cart-inquiry.entity.ts 中添加 sourceUrl 字段
  - 类型: VARCHAR(512), nullable
- **Acceptance Criteria Addressed**: AC-2
- **Test Requirements**:
  - `programmatic` TR-2.1: 实体文件编译无错误
- **Notes**: 需要手动执行数据库 ALTER TABLE

## [x] Task 3: 修改联系表单提交接口支持 source_url
- **Priority**: P0
- **Depends On**: Task 1
- **Description**:
  - 修改 home.controller.ts 的 handleContactFormPost 方法
  - 从请求 body 中读取 source_url 参数
  - 保存到 ContactMessage 实体
- **Acceptance Criteria Addressed**: AC-3
- **Test Requirements**:
  - `programmatic` TR-3.1: TypeScript 编译无错误
- **Notes**: None

## [x] Task 4: 修改询价表单提交接口支持 source_url
- **Priority**: P0
- **Depends On**: Task 2
- **Description**:
  - 修改 member-api.controller.ts 的 postCartInquirySubmit 方法
  - 从请求 body 中读取 source_url 参数
  - 传递给 member-cart.service.ts 的 submitCartInquiry 方法
  - 修改 submitCartInquiry 方法保存 source_url
- **Acceptance Criteria Addressed**: AC-4
- **Test Requirements**:
  - `programmatic` TR-4.1: TypeScript 编译无错误
- **Notes**: None

## [x] Task 5: 后台询价表单列表添加来源列
- **Priority**: P0
- **Depends On**: Task 2, Task 4
- **Description**:
  - 修改 admin-cart-inquiry.controller.ts 的返回数据
  - 添加 sourceUrl 字段到列表项
  - 修改后台模板 cart-inquiries-list.hbs 添加列
- **Acceptance Criteria Addressed**: AC-5
- **Test Requirements**:
  - `programmatic` TR-5.1: TypeScript 编译无错误
  - `human-judgement` TR-5.2: 后台页面 /admin/cart-inquiries 显示来源列
- **Notes**: None

## [x] Task 6: 后台联系消息列表添加来源列
- **Priority**: P0
- **Depends On**: Task 1, Task 3
- **Description**:
  - 修改 admin.controller.ts 的 contactMessagesPage 方法
  - 添加 sourceUrl 字段到列表项
  - 修改后台模板 contact-messages-list.hbs 添加列
- **Acceptance Criteria Addressed**: AC-6
- **Test Requirements**:
  - `programmatic` TR-6.1: TypeScript 编译无错误
  - `human-judgement` TR-6.2: 后台页面 /admin/contact-messages 显示来源列
- **Notes**: None