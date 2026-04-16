# 联系表单与询价表单添加来源URL字段 - 产品需求文档

## 概述
- **Summary**: 在联系表单和询价表单的实体表中添加 `source_url` 字段，用于标识用户是在哪个页面提交的信息，并在后台管理系统的表格中展示该字段
- **Purpose**: 帮助后台运营人员了解用户是从哪个页面提交的联系/询价表单，便于分析页面转化率和用户行为
- **Target Users**: 后台运营人员

## Goals
- 在 `contact_message` 实体表中添加 `source_url` 字段
- 在 `member_cart_inquiry` 实体表中添加 `source_url` 字段
- 修改联系表单提交接口，传递 `source_url` 字段
- 修改询价表单提交接口，传递 `source_url` 字段
- 在后台询价表单列表页面添加"来源"列展示
- 在后台联系消息列表页面添加"来源"列展示

## Non-Goals (Out of Scope)
- 不修改前端页面的表单界面
- 不添加统计分析功能
- 不修改数据库迁移脚本（手动执行 ALTER TABLE）

## Background & Context
- 现有系统中联系表单和询价表单只保存用户填写的信息，但没有记录用户是在哪个页面提交的
- 后台已有两个列表页面：
  - /admin/cart-inquiries (询价表单列表)
  - /admin/contact-messages (联系消息列表)
- 需要在前端提交时传入来源页面 URL

## Functional Requirements
- **FR-1**: `contact_message` 实体添加 `source_url` 字段，VARCHAR(512)，可为空
- **FR-2**: `member_cart_inquiry` 实体添加 `source_url` 字段，VARCHAR(512)，可为空
- **FR-3**: 联系表单 POST /contact 接口支持接收 `source_url` 参数
- **FR-4**: 询价表单 POST /api/cart/inquiry-submit 接口支持接收 `source_url` 参数
- **FR-5**: 后台询价表单列表显示 `source_url` 字段
- **FR-6**: 后台联系消息列表显示 `source_url` 字段

## Non-Functional Requirements
- **NFR-1**: 字段长度合理（512字符足以保存大多数 URL）
- **NFR-2**: 不影响现有功能，未传入 `source_url` 时可为空

## Constraints
- **Technical**: NestJS + TypeORM + MySQL
- **Database**: 需要手动执行 ALTER TABLE 添加字段
- **前端**: 前端表单需在提交时传递 source_url

## Assumptions
- 前端已有机制获取当前页面 URL
- 后台模板使用 Handlebars

## Acceptance Criteria

### AC-1: 联系表单实体添加 source_url 字段
- **Given**: 数据库已有 contact_message 表
- **When**: 执行 ALTER TABLE 添加 source_url 字段
- **Then**: 实体类包含 sourceUrl 属性，类型为 string | null
- **Verification**: `programmatic`

### AC-2: 询价表单实体添加 source_url 字段
- **Given**: 数据库已有 member_cart_inquiry 表
- **When**: 执行 ALTER TABLE 添加 source_url 字段
- **Then**: 实体类包含 sourceUrl 属性，类型为 string | null
- **Verification**: `programmatic`

### AC-3: 联系表单提交接口支持 source_url
- **Given**: 前端在联系表单页面
- **When**: 提交表单时传入 source_url
- **Then**: 数据保存时包含 source_url 值
- **Verification**: `programmatic`

### AC-4: 询价表单提交接口支持 source_url
- **Given**: 前端在询价表单页面
- **When**: 提交询价时传入 source_url
- **Then**: 数据保存时包含 source_url 值
- **Verification**: `programmatic`

### AC-5: 后台询价列表显示来源列
- **Given**: 后台访问 /admin/cart-inquiries
- **When**: 页面加载
- **Then**: 表格包含"来源"列，显示 source_url
- **Verification**: `human-judgment`

### AC-6: 后台联系消息列表显示来源列
- **Given**: 后台访问 /admin/contact-messages
- **When**: 页面加载
- **Then**: 表格包含"来源"列，显示 source_url
- **Verification**: `human-judgment`

## Open Questions
- [ ] 前端如何获取当前页面 URL？是否有现成的方法？
- [ ] source_url 是否需要去除域名只用路径部分？