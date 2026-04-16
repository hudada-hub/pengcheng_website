# 订阅表单标签在产品列表页不显示 - 任务列表

## [x] Task 1: 确认 buildCommonPageData 代码正确
- **Priority**: P0
- **Depends On**: None
- **Description**:
  - 检查 buildCommonPageData 中 contactUsLabels 和 contactUsFormLabels 的返回
- **Acceptance Criteria Addressed**: AC-2
- **Test Requirements**:
  - `programmatic` TR-1.1: 代码编译通过
- **Notes**: 代码已确认正确

## [x] Task 2: 检查 subscription.hbs 模板
- **Priority**: P0
- **Depends On**: None
- **Description**:
  - 确认模板使用 contactUsLabels 和 contactUsFormLabels 的方式正确
- **Acceptance Criteria Addressed**: AC-1
- **Test Requirements**:
  - `programmatic` TR-2.1: 模板正确读取数据
- **Notes**: 模板已确认正确

## [ ] Task 3: 用户操作 - 重启服务器
- **Priority**: P0
- **Depends On**: None
- **Description**:
  - 用户需要重启开发服务器来清除缓存
- **Acceptance Criteria Addressed**: AC-1
- **Test Requirements**:
  - `human-judgement` TR-3.1: 重启后标签显示正确