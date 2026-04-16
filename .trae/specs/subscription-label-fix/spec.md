# 订阅表单标签在产品列表页不显示 - 产品需求文档

## 概述
- **Summary**: 修复订阅表单（subscription.hbs）在产品列表页点击头部后弹窗中的 label 没有从配置表获取，显示空白的问题
- **Purpose**: 确保产品列表页的订阅弹窗能正确显示配置表中的 label 文字
- **Target Users**: 前台用户

## Goals
- 确认 buildCommonPageData 返回的 contactUsLabels 和 contactUsFormLabels 正确传递到模板
- 确认 subscription.hbs 能正确读取这些数据

## Non-Goals (Out of Scope)
- 不修改模板结构

## Background & Context
- 已在 buildCommonPageData 中添加 contactUsLabels 和 contactUsFormLabels 的获取和返回
- subscription.hbs 模板优先使用 contactUsLabels（数组），备用 contactUsFormLabels（对象）
- 产品列表页调用 buildCommonPageData 获取公共数据

## 问题分析
- **可能的缓存问题**: 开发服务器可能有缓存
- **可能的配置问题**: 数据库中可能没有 contact-us-labels 配置

## 解决方案
1. 重启开发服务器清除缓存
2. 检查数据库配置表

## Acceptance Criteria

### AC-1: 产品列表页订阅弹窗显示 label
- **Given**: 访问产品列表页，点击头部订阅按钮
- **Then**: 弹窗中的 label 从配置表获取或使用默认值
- **Verification**: `human-judgment`

### AC-2: 代码传递正确
- **Given**: buildCommonPageData 返回 contactUsLabels
- **When**: 页面渲染
- **Then**: 模板能读取到 contactUsLabels
- **Verification**: `programmatic`