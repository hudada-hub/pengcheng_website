# 后台 · 资源下载管理（多语言列表、一键/批量翻译、批量删除）— 设计说明

**状态**：已定稿（2026-03-23）  
**方案**：**A** — 与 `news-list` / `NewsTranslateService` / `admin-api` 新闻接口 **完整对齐**。  
**依赖**：`download` 表 `download_id` 分组、`download_category.category_id`、`download_series.download_series_id`、`download_file_type.download_file_type_id`、DeepSeek 翻译服务、现有 CSRF 与 Admin 鉴权。

---

## 1. 背景与目标

- 每条下载记录已有 `lang_id`，且 `download_id` 在新建后会回填为行 `id`，用于多语言分组（与 `news.news_id` 同模式）。
- 列表当前缺少 **语言筛选**、**批量删除**、**一键翻译 / 批量翻译**。
- 目标：运营可在列表按语言管理，批量删除；从中文（或任意源语言）一键生成其它语言行，并映射到目标语言下的资源类型 / 系列 / 文件类型。

---

## 2. 产品决策（已确认）

| 项 | 决策 |
|----|------|
| 总体方案 | **A**：交互与技术分层对齐新闻模块 |
| `download_url` 翻译策略 | 生成目标语言行时 **复制源行 `download_url`**；各语言仍可在编辑表单中 **单独修改**（与新闻缩略图「先复制、可改」一致） |
| 新语言行 `download_count` | **0**（按语言独立统计） |
| 删除 | **软删** `status = Deleted`，与单条删除一致 |

---

## 3. 列表与筛选

**路由**：`GET /admin/downloads`（`AdminDownloadController.downloadsPage`）。

- 增加查询参数 **`langId`**：`all` / 空表示「全部语言」；否则为具体语言 id（与 `news` 列表约定一致）。
- 在现有 `categoryId`、`seriesId` 过滤之后，再按 `langId` 过滤（非「全部」时）。
- 模板传入 **`langs`**、`**selectedLangId**`（与 news 一致）。
- **UI**：工具栏「语言」下拉；选「全部」时表格显示 **语言列**，选定单一语言时可隐藏语言列（与 `news-list` 行为一致）。
- 分页 `baseUrl` 需保留 `langId`、`categoryId`、`seriesId`、`pageSize`。

---

## 4. 批量删除

- **模板**：参考 `views/admin/news-list.hbs`：首列复选、表头全选、隐藏表单 `POST /admin/downloads/batch-delete`，`_csrf` + 由 JS 注入 `ids`（或等价字段名与新闻一致）。
- **控制器**：`POST /admin/downloads/batch-delete`，`AdminAuthGuard` + `CsrfGuard`；`body.ids: number[]`；`downloadRepo.update({ id: In(ids) }, { status: Status.Deleted })`；`redis.delPattern('pengcheng:*')`；**redirect referer**（与 `newsBatchDelete` 一致）。

---

## 5. 翻译服务：`DownloadTranslateService`

新建 `src/modules/admin/download-translate.service.ts`（命名与 `NewsTranslateService` 对称）。

### 5.1 `getMissingLangs(idOrSourceId, retranslate?)`

- 加载源行（`status` 正常或隐藏）。
- `retranslate === true`：返回除源语言外 **全部** 站点启用语言。
- 否则：计算 **同组** 已有 `lang_id`，返回尚未存在的语言（同组判定与新闻一致：`download_id = effectiveId` **或** `id = effectiveId` 的并集）。
- `effectiveId = source.downloadId`（若历史数据异常可兼容 `source.id`，与新闻对 `newsId` 的处理方式一致）。

### 5.2 `translateDownload(sourceId, targetLangIds[])`

对每个 `targetLangId`（跳过与源相同）：

1. **资源类型**：由 `source.resourceTypeId` 查 `download_category`；分组键 `groupId = category.categoryId ?? category.id`；在目标语言下查找 `langId` 匹配且 **`categoryId === groupId`**（且状态可用）的记录 → `targetResourceTypeId`；找不到则 **抛错**（中文提示：请先在目标语言维护对应资源类型）。
2. **产品系列**：若 `source.seriesId` 为空 → 目标 `seriesId = null`。否则查源系列行，分组键 `downloadSeriesId ?? id`，在目标语言下找同组 → `targetSeriesId`；找不到则 **抛错**（提示先维护目标语言系列）。
3. **产品文件类型**：若 `source.downloadFileTypeId` 为空 → 目标为 `null`。否则同系列逻辑，用 `downloadFileTypeId` 分组；找不到则 **抛错**。
4. **`fileName`**：`translateText`（DeepSeek）。
5. **`downloadUrl`**：**复制** `source.downloadUrl`（不调用翻译模型）。
6. **`status`**：与源行一致。
7. 若已存在 `download_id === effectiveId` 且 `langId === 目标` 的行 → **update**（文件名、关联 id、url、status 等）；否则 **insert**，且 **`download_id = effectiveId`**，**禁止**把新行的 `download_id` 再更新为自身 `id`（仅首条创建逻辑在 `downloadSave` 里回填，与新闻一致）。

### 5.3 `translateDownloadBatch(sourceIds[], targetLangIds[])`

- 对每个 `sourceId` 调用 `translateDownload`；汇总 `created` / `updated`；最后统一清 Redis（或每行内已清，与 `NewsTranslateService` 保持一致即可）。

---

## 6. Admin API

在 `AdminApiController` 注册（与 `news` 并列）：

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/admin/api/download/missing-langs` | Query：`id`、`retranslate` |
| POST | `/admin/api/download/translate` | Body：`sourceId`, `targetLangIds` |
| POST | `/admin/api/download/translate-batch` | Body：`sourceIds`, `targetLangIds` |

- 鉴权：与现有 `news/translate` 相同（登录 + CSRF）。
- 成功/失败 JSON 形态对齐新闻同类接口。

`AdminModule`：`DownloadTranslateService` 注入所需 `Repository`（Download、DownloadCategory、DownloadSeries、DownloadFileType、Lang）+ `DeepseekTranslateService` + `RedisService`。

---

## 7. 前端（`download-list.hbs` + 脚本）

- 引入 **`{{> admin/translate-modal idPrefix="downloadTranslate"}}`**（或选定不与新闻冲突的 id 前缀）。
- 行内 **「一键翻译」**：`data-id` 为行 `id`；打开 modal，请求 `missing-langs`，提交 `translate`（复制 `news-list` 中 `news-translate-link` 与 modal 的 JS 模式）。
- **「批量翻译」** 按钮：勾选行后启用；弹窗多选目标语言；`POST translate-batch`。
- **批量删除** 按钮：收集勾选 id，写入隐藏表单提交 `batch-delete`（与 news 相同防重复与确认策略：可按新闻使用 Popconfirm 或二次确认，实现阶段与新闻对齐）。

---

## 8. 非本次范围

- 前台下载页展示与 SEO（若需按 `download_id` 聚合多语言，另起需求）。
- 物理删除、`file_type` / `product_type` 列清理。
- 删除「整组多语言」：当前仅支持按勾选 **行 id** 删除（与新闻批量删一致）。

---

## 9. 实现清单（供后续 plan 拆解）

- [ ] `DownloadTranslateService` + 单元/手工用例说明
- [ ] `AdminApiController` 三个端点 + `AdminModule` 注册
- [ ] `AdminDownloadController`：`downloadsPage` 增加 `langId` 与 `langs`；`downloadBatchDelete`
- [ ] `views/admin/download-list.hbs`：语言筛选、多选、批量删、翻译 modal、批量翻译弹窗、脚本（参考 `news-list.hbs`）
- [ ] 验证：筛选 + 分页 URL；批量删；单条翻译、批量翻译；缺目标语言分类/系列/文件类型时的错误提示
