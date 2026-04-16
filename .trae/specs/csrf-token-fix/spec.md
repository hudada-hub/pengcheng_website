# 修复 CSRF Token 为空问题 Spec

## Why
subscription-modal.hbs 和 subscription.hbs 中的 _csrf hidden input 值为空，导致用户提交表单时返回 403 Invalid csrf token 错误。

## What Changes
- 在 subscription-modal.hbs 中添加 contactFormCsrfToken 获取逻辑
- 确保所有使用 subscription-modal 的页面都能获取到有效的 CSRF token
- 修复 subscription.hbs 中的 _csrf input 值为空的问题

## Impact
- Affected specs: contact-us-labels, subscription-label-fix
- Affected code: 
  - views/website/partials/common/subscription-modal.hbs
  - views/website/partials/common/subscription.hbs
  - src/modules/website/* (所有包含 subscription-modal 的页面)

## ADDED Requirements
### Requirement: subscription-modal 获取 CSRF Token
subscription-modal 弹窗打开时需要获取有效的 CSRF token。

#### Scenario: Modal 打开时获取 token
- **WHEN** 用户打开 subscription-modal 弹窗
- **THEN** 弹窗中的 _csrf hidden input 应该有有效的 token 值

### Requirement: 所有页面表单提交
所有包含 subscription 或 subscription-modal 的页面，表单提交时应该携带有效的 CSRF token。

#### Scenario: 表单提交成功
- **WHEN** 用户填写表单并点击提交按钮
- **THEN** 服务器返回 200，不返回 403 CSRF 错误

## MODIFIED Requirements
### Requirement: subscription.hbs _csrf 字段
修改 subscription.hbs 中 _csrf input 的值获取逻辑。

#### Scenario: 页面渲染时
- **WHEN** 页面加载 subscription partial
- **THEN** _csrf hidden input 的 value 应该是有效的 CSRF token

## REMOVED Requirements
- 无

## Technical Approach
1. 在 subscription-modal.hbs 中通过 AJAX 调用 /contact-form-meta 获取 CSRF token
2. 将获取的 token 填充到 modal 中的 _csrf input
3. 确保所有使用 subscription-modal 的页面传递 contactFormCsrfToken