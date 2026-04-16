# 联系表单标签配置到公共数据 - 产品需求文档

## 概述
- **Summary**: 将 `contact-us-labels` 和 `submit` 配置从各页面独立获取改为在 `base-website.controller.ts` 的 `buildCommonPageData` 中统一获取，使所有页面都能使用联系表单的 label 配置
- **Purpose**: 修复订阅表单在部分页面无法显示配置的问题，确保所有页面都能从配置表获取表单标签
- **Target Users**: 前台用户可见表单标签文字

## Goals
- 在 `buildCommonPageData` 中获取 `contact-us-labels` 配置
- 在 `buildCommonPageData` 中获取 `submit` 配置（提交按钮文字）
- 移除各页面独立获取这两个配置的重复代码

## Non-Goals (Out of Scope)
- 不修改前端表单界面
- 不修改配置表结构

## Background & Context
- 现有 subscription.hbs 模板使用 `contactUsLabels`（配置数组）和 `contactUsFormLabels`（对象）两种数据
- `contactUsLabels` 目前仅在部分页面（home, products, about-us）获取，其他页面无法使用
- `buildCommonPageData` 是所有页面都会调用的公共数据构建方法

## Functional Requirements
- **FR-1**: `buildCommonPageData` 返回 `contactUsLabels` 和 `contactUsFormLabels`
- **FR-2**: `buildCommonPageData` 返回 `contactUsSubmitLabel`
- **FR-3**: 各页面移除重复获取这两个配置的代码

## Non-Functional Requirements
- **NFR-1**: 不影响现有页面功能
- **NFR-2**: 使用 config key `contact-us-labels` 和 `submit`

## Constraints
- **Technical**: NestJS + Handlebars
- **依赖已有方法**: `getContactUsFormLabels()` 已在 base-website.controller.ts 中实现

## Assumptions
- 配置 key `contact-us-labels` 已在数据库中存在
- 配置 key `submit` 已在数据库中存在

## Acceptance Criteria

### AC-1: buildCommonPageData 返回 contactUsFormLabels
- **Given**: 任意页面调用 buildCommonPageData
- **When**: 页面渲染
- **Then**: 返回数据包含 contactUsFormLabels
- **Verification**: `programmatic`

### AC-2: buildCommonPageData 返回 contactUsSubmitLabel
- **Given**: 任意页面调用 buildCommonPageData
- **When**: 页面渲染
- **Then**: 返回数据包含 contactUsSubmitLabel
- **Verification**: `programmatic`

### AC-3: 各页面代码简洁
- **Given**: 修改后
- **When**: 代码审查
- **Then**: 各页面不再有重复的获取 contactUsLabels 代码
- **Verification**: `human-judgment`

## Open Questions
- [ ] 无