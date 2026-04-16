# 区块管理批量翻译功能设计

## 概述

在区块管理（Config）列表页新增批量翻译功能，允许用户勾选多条配置，一键翻译到指定的目标语言。

## 需求

- 复用现有的 checkbox 勾选机制（类似批量删除）
- 所有被选中的配置翻译到相同的目标语言
- 任意语言的配置都可以作为翻译源
- 使用简单模式：点击翻译后显示 loading，全部完成后统一提示

## 方案

复用现有翻译弹窗（translate-modal），后端新增批量翻译 API。

参考实现：
- 菜单批量翻译：`menu/translate-batch`
- 产品分类批量翻译：`product-category/translate-batch`

## 前端设计

### 1. 工具栏新增按钮

位置：批量删除按钮旁

```html
<button type="button" class="btn btn-secondary" id="btnConfigBatchTranslate">
  <iconify-icon icon="mdi:translate"></iconify-icon> 批量翻译
</button>
```

### 2. 点击逻辑

1. 检查是否有勾选 checkbox（`.config-row-cb:checked`）
2. 无勾选：提示「请先勾选要翻译的配置」
3. 有勾选：打开翻译弹窗，标题改为「批量翻译（已选 N 条）」

### 3. 弹窗内容

- 提示文案：「已选中 N 条配置，将翻译到所选语言」
- 「重新翻译」checkbox（复用现有）
- 语言选择列表（复用现有）
- 「一键补充缺失的所有语言」按钮（复用现有）

### 4. 提交流程

1. 禁用按钮 + 显示「翻译中...」
2. 调用 API `/admin/api/config/translate-batch`
3. 完成后提示「已翻译 N 条配置，新建 X 条，更新 Y 条」
4. 关闭弹窗并刷新列表

## 后端设计

### 1. 新增 API

**路由**：`POST /admin/api/config/translate-batch`

**请求体**：

```json
{
  "sourceIds": [1, 2, 3],
  "targetLangIds": [2, 3, 4]
}
```

**响应**：

```json
{
  "ok": true,
  "translatedCount": 3,
  "created": 5,
  "updated": 2,
  "message": "已翻译 3 条配置，新建 5 条，更新 2 条"
}
```

### 2. Service 方法

在 `ConfigCustomService` 新增：

```typescript
async translateConfigBatch(
  sourceIds: number[],
  targetLangIds: number[],
): Promise<{ translatedCount: number; created: number; updated: number }> {
  if (!sourceIds.length || !targetLangIds.length) {
    return { translatedCount: 0, created: 0, updated: 0 };
  }

  let created = 0;
  let updated = 0;

  for (const sourceId of sourceIds) {
    const result = await this.translateConfig(sourceId, targetLangIds);
    created += result.created;
    updated += result.updated;
  }

  return { translatedCount: sourceIds.length, created, updated };
}
```

### 3. 错误处理

- 单条翻译失败不中断整体流程
- 记录错误日志，继续翻译下一条

## 涉及文件

| 文件 | 修改内容 |
|------|----------|
| `views/admin/config-list.hbs` | 新增「批量翻译」按钮和 JS 逻辑 |
| `src/modules/config-custom/config-custom.controller.ts` | 新增批量翻译 API |
| `src/modules/config-custom/config-custom.service.ts` | 新增 `translateConfigBatch` 方法 |

## 用户操作流程

```
1. 用户在区块管理列表勾选多条配置
2. 点击「批量翻译」按钮
3. 弹窗显示「批量翻译（已选 N 条）」
4. 勾选目标语言
5. 点击「确定翻译」
6. 按钮显示「翻译中...」
7. 翻译完成后提示结果，刷新列表
```