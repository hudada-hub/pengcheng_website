# 区块管理批量翻译功能实施计划

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 在区块管理列表页新增批量翻译功能，允许用户勾选多条配置一键翻译到指定目标语言。

**Architecture:** 复用现有翻译弹窗组件，后端新增批量翻译 API，循环调用现有的单条翻译逻辑。参考项目中已有的菜单和产品分类批量翻译实现。

**Tech Stack:** NestJS, TypeORM, Handlebars, Vanilla JS, DeepSeek API

---

## Task 1: 后端 Service 层新增批量翻译方法

**Files:**
- Modify: `src/modules/config-custom/config-custom.service.ts`

**Step 1: 在 ConfigCustomService 新增 translateConfigBatch 方法**

在 `translateConfig` 方法后添加：

```typescript
/** 批量翻译：将多条配置（按 id）翻译到多个目标语言 */
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

  return {
    translatedCount: sourceIds.length,
    created,
    updated,
  };
}
```

**Step 2: 验证代码语法正确**

运行: `npm run build`
预期: 编译成功，无错误

**Step 3: Commit**

```bash
git add src/modules/config-custom/config-custom.service.ts
git commit -m "feat(config): add translateConfigBatch method"
```

---

## Task 2: 后端 Controller 层新增批量翻译 API

**Files:**
- Modify: `src/modules/config-custom/config-custom.controller.ts`

**Step 1: 新增批量翻译接口**

在现有 `POST translate` 接口后添加：

```typescript
@Post('translate-batch')
async translateBatch(@Body() body: { sourceIds: number[]; targetLangIds: number[] }) {
  try {
    const { sourceIds, targetLangIds } = body;
    if (!sourceIds?.length || !targetLangIds?.length) {
      return { ok: false, message: '请勾选要翻译的配置并至少选择一种目标语言' };
    }
    const result = await this.configService.translateConfigBatch(sourceIds, targetLangIds);
    return {
      ok: true,
      ...result,
      message: `已翻译 ${result.translatedCount} 条配置，新建 ${result.created} 条，更新 ${result.updated} 条`,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : '翻译失败';
    return { ok: false, message: msg };
  }
}
```

**Step 2: 验证编译**

运行: `npm run build`
预期: 编译成功，无错误

**Step 3: Commit**

```bash
git add src/modules/config-custom/config-custom.controller.ts
git commit -m "feat(config): add translate-batch API endpoint"
```

---

## Task 3: 前端新增批量翻译按钮

**Files:**
- Modify: `views/admin/config-list.hbs`

**Step 1: 在工具栏添加批量翻译按钮**

找到批量删除按钮所在位置（约第 39 行），在其后添加：

```html
<button type="button" class="btn btn-secondary" id="btnConfigBatchTranslate"><iconify-icon icon="mdi:translate"></iconify-icon> 批量翻译</button>
```

**Step 2: Commit**

```bash
git add views/admin/config-list.hbs
git commit -m "feat(config): add batch translate button"
```

---

## Task 4: 前端实现批量翻译弹窗逻辑

**Files:**
- Modify: `views/admin/config-list.hbs` (script 部分)

**Step 1: 添加批量翻译按钮点击事件**

在 `btnConfigBatchDelete` 的 onclick 处理后添加：

```javascript
document.getElementById('btnConfigBatchTranslate').onclick = function () {
  var checked = document.querySelectorAll('.config-row-cb:checked');
  var ids = [];
  checked.forEach(function (cb) { ids.push(parseInt(cb.value, 10)); });
  if (!ids.length) { alert('请先勾选要翻译的配置'); return; }
  openBatchTranslateModal(ids);
};
```

**Step 2: 添加批量翻译弹窗函数**

在 `openTranslateModal` 函数后添加：

```javascript
var batchTranslateIds = [];
function openBatchTranslateModal(ids) {
  batchTranslateIds = ids;
  if (!translateOverlay || !translateBody) return;
  var retranslateCb = document.getElementById('adminTranslateRetranslateCb');
  if (retranslateCb) retranslateCb.checked = false;
  translateBody.innerHTML = '<p class="admin-text-muted">加载中...</p>';
  translateOverlay.classList.add('open');
  translateOverlay.setAttribute('aria-hidden', 'false');
  document.getElementById('adminTranslateModalTitle').textContent = '批量翻译（已选 ' + ids.length + ' 条）';
  loadBatchTranslateLangs();
}

function loadBatchTranslateLangs() {
  if (!translateBody) return;
  var retranslateEl = document.getElementById('adminTranslateRetranslateCb');
  var retranslate = retranslateEl ? retranslateEl.checked : false;
  translateBody.innerHTML = '<p class="admin-text-muted">加载中...</p>';

  fetch('/admin/api/lang', { credentials: 'same-origin' })
    .then(function (r) { return r.json(); })
    .then(function (langs) {
      if (!langs || !langs.length) {
        translateBody.innerHTML = '<p class="admin-text-muted">暂无可用的目标语言。</p>';
        return;
      }
      var html = '<p style="margin-bottom:0.5rem;">已选中 ' + batchTranslateIds.length + ' 条配置，将翻译到所选语言：</p>' +
        '<button type="button" class="btn btn-secondary btn-sm" id="adminBatchTranslateSelectAll">全选所有语言</button>' +
        '<div class="admin-translate-langs" style="margin-top:0.75rem;max-height:200px;overflow:auto;">';
      langs.forEach(function (l) {
        html += '<label style="display:block;margin-bottom:0.25rem;"><input type="checkbox" class="admin-translate-lang-cb" value="' + escapeHtml(String(l.id)) + '"> ' + escapeHtml(l.name) + ' (' + escapeHtml(l.code) + ')</label>';
      });
      html += '</div>';
      translateBody.innerHTML = html;
      document.getElementById('adminBatchTranslateSelectAll').onclick = function () {
        translateBody.querySelectorAll('.admin-translate-lang-cb').forEach(function (cb) { cb.checked = true; });
      };
    })
    .catch(function () { translateBody.innerHTML = '<p style="color:var(--admin-danger);">加载失败</p>'; });
}
```

**Step 3: 修改翻译提交按钮逻辑以支持批量模式**

找到 `adminTranslateModalSubmit` 的 onclick 处理，修改为：

```javascript
document.getElementById('adminTranslateModalSubmit').onclick = function () {
  var cbs = document.querySelectorAll('#adminTranslateModalBody .admin-translate-lang-cb:checked');
  var langIds = [];
  cbs.forEach(function (cb) { langIds.push(parseInt(cb.value, 10)); });
  if (!langIds.length) { alert('请至少选择一种语言'); return; }
  var btn = document.getElementById('adminTranslateModalSubmit');
  var oldText = btn.textContent;
  btn.disabled = true;
  btn.textContent = '翻译中...';

  // 判断是单条还是批量
  var url, body;
  if (batchTranslateIds && batchTranslateIds.length > 0) {
    url = '/admin/api/config/translate-batch';
    body = JSON.stringify({ _csrf: csrfToken, sourceIds: batchTranslateIds, targetLangIds: langIds });
  } else {
    url = '/admin/api/config/translate';
    body = JSON.stringify({ _csrf: csrfToken, sourceConfigId: translateSourceId, targetLangIds: langIds });
  }

  fetch(url, {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json', 'csrf-token': csrfToken },
    body: body
  })
    .then(function (r) { return r.json(); })
    .then(function (d) {
      btn.disabled = false;
      btn.textContent = oldText;
      if (d && d.ok) { alert(d.message || '翻译完成'); closeTranslateModal(); batchTranslateIds = []; loadConfigs(); }
      else { alert(d && d.message ? d.message : '翻译失败'); }
    })
    .catch(function () { btn.disabled = false; btn.textContent = oldText; alert('请求失败'); });
};
```

**Step 4: 关闭弹窗时清空批量选中状态**

修改 `closeTranslateModal` 函数：

```javascript
function closeTranslateModal() {
  if (translateOverlay) { translateOverlay.classList.remove('open'); translateOverlay.setAttribute('aria-hidden', 'true'); }
  batchTranslateIds = [];
  document.getElementById('adminTranslateModalTitle').textContent = '一键翻译';
}
```

**Step 5: Commit**

```bash
git add views/admin/config-list.hbs
git commit -m "feat(config): implement batch translate modal logic"
```

---

## Task 5: 测试验证

**Step 1: 启动开发服务器**

运行: `npm run start:dev`

**Step 2: 功能测试**

1. 登录后台，进入区块管理页面
2. 勾选多条配置（使用 checkbox）
3. 点击「批量翻译」按钮
4. 弹窗显示「批量翻译（已选 N 条）」
5. 勾选目标语言
6. 点击「确定翻译」
7. 验证翻译成功提示，列表刷新

**Step 3: 最终 Commit**

```bash
git add -A
git commit -m "feat(config): complete batch translate feature"
```

---

## 参考实现

- 菜单批量翻译: `src/modules/admin/menu-translate.service.ts` 的 `translateMenuBatch` 方法
- 产品分类批量翻译: `src/modules/admin/product-category-translate.service.ts` 的 `translateProductCategoryBatch` 方法
- API 控制器: `src/modules/admin/admin-api.controller.ts` 的 `menu/translate-batch` 和 `product-category/translate-batch`