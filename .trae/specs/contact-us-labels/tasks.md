# 联系表单标签配置到公共数据 - 实现计划

## [x] Task 1: 修改 buildCommonPageData 添加 contactUsFormLabels
- **Priority**: P0
- **Depends On**: None
- **Description**:
  - 在 buildCommonPageData 中获取 contactUsLabelsCfg 和 submitCfg
  - 调用 getContactUsFormLabels 获取 contactUsFormLabels
  - 调用 getTextFromConfig 获取 contactUsSubmitLabel
  - 返回 contactUsFormLabels 和 contactUsSubmitLabel
- **Acceptance Criteria Addressed**: AC-1, AC-2
- **Test Requirements**:
  - `programmatic` TR-1.1: TypeScript 编译无错误
- **Notes**: None

## [x] Task 2: 移除各页面重复获取代码
- **Priority**: P1
- **Depends On**: Task 1
- **Description**:
  - 检查 home.controller.ts, products.controller.ts, about-us.controller.ts
  - 移除获取 contactUsLabelsCfg、submitCfg、contactUsFormLabels、contactUsSubmitLabel 的代码
  - 保留模板中使用的变量引用（从 commonData 获取）
- **Acceptance Criteria Addressed**: AC-3
- **Test Requirements**:
  - `programmatic` TR-2.1: TypeScript 编译无错误
- **Notes**: 谨慎操作，确保不破坏现有功能

## [x] Task 3: 验证
- **Priority**: P0
- **Depends On**: Task 1, Task 2
- **Description**:
  - 在非 home/products/about-us 页面测试表单标签是否正常显示
- **Acceptance Criteria Addressed**: AC-1, AC-2
- **Test Requirements**:
  - `human-judgement` TR-3.1: 打开任意页面，联系表单标签正确显示
- **Notes**: None