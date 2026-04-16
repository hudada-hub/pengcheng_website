# 国外前台 · 解决方案列表页 — 设计说明

**状态**：已定稿（2025-03-22）  
**范围**：数据模型 + 后台 + 新前台控制器与模板 + Redis 缓存策略；与 `ProductsController` 行为对齐。

---

## 1. 背景与目标

- 新增**解决方案列表页**：左侧为解决方案分类，右侧为方案卡片列表；支持 `?categoryId=` 筛选。
- **列表页 Banner** 来自 **菜单表** `menu`：在当语言菜单树中定位「解决方案」菜单项，使用其 `bannerUrl`（及可选 `bannerTitle` / `bannerDesc`）。
- 使用**新的前台控制器**，实现风格参考 `src/modules/website/products.controller.ts`。

---

## 2. 数据模型

### 2.1 `solution` 表

- 新增可空列 **`category_id`**（`int`，nullable）。
- 语义与产品一致：指向 **`solution_category.id`**（当前语言下分类行的主键），非 `solution_category_id` 业务字段。
- 历史数据：`NULL` 表示未选分类。

### 2.2 实体 `Solution`

- 增加 `categoryId: number | null`。
- 可选 `@ManyToOne(() => SolutionCategory)` + `@JoinColumn({ name: 'category_id' })`。

### 2.3 列表筛选规则

- 查询参数 **`categoryId`**：与产品列表一致，允许传入分类行的 `id` 或业务 `solution_category_id`（`solutionCategoryId`）；解析为「允许的分类行 id 集合」后筛选 `solution.categoryId`。
- **未分类**（`categoryId` 为 `NULL`）的方案：**仅在未带 `categoryId` 或等价「全部」时展示**；侧栏首版不单独提供「未分类」入口（可后续扩展）。

### 2.4 迁移

- 提供 SQL 脚本（例如 `sql/add_solution_category_id.sql`），便于生产执行。

---

## 3. 后台管理

- **`views/admin/solution-edit-form.hbs`**：增加「解决方案分类」下拉框，选项为当前表单 `langId` 下、`status=正常` 的 `solution_category`，按 `sort` 排序。
- **`AdminSolutionController`**：`solutions/save` 读写 `categoryId`。
- **缓存失效**：项目内产品/方案保存已使用 `redis.delPattern('pengcheng:*')` 时，新加的 `solution:{code}` 等 key 需落在同一前缀下，或保存后显式删除方案/分类相关 key；实现阶段与现有 `admin-solution.controller` 中 Redis 用法对齐。

---

## 4. 前台架构

### 4.1 推荐方案（已定稿）

- 新建 **`SolutionsController`**（建议路径 `src/modules/website/solutions.controller.ts`），继承 `BaseWebsiteController`。
- 新建 **`SolutionsModule`**：`imports` 包含 `I18nModule`、`WebsiteModule`、`SolutionModule`；在 `AppModule` 注册，与 `ProductsModule` 并列。
- **不扩展** `WebsiteLayoutService` / `LayoutCachePayload` 的通用结构；在组装列表上下文时：
  1. 调用 `websiteLayoutService.getLayoutData(langId, { configKeys: 与产品列表相同的 LAYOUT_CONFIG_KEYS })`；
  2. 并行调用 `SolutionService` 的 **`getCategoriesFromCache(langId)`**、**`getSolutionsFromCache(langId)`**。

### 4.2 `SolutionService` 扩展

- `listCategories(langId)`：与现有 `ProductService.listCategories` 类似，`status=正常`，按 `sort`。
- `getCategoriesFromCache` / `getSolutionsFromCache`：在 `CACHE_KEYS` 中新增 key（如 `solutionCategory:{code}`、`solution:{code}`），TTL 使用 `redis.layoutTtlSeconds`（与产品一致）。

### 4.3 路由

- `GET /solutions`
- `GET /:locale/solutions`  
- 语言校验与 `ProductsController` 一致：非法 `locale` → 404。

---

## 5. Banner（菜单表）

- 在 `layoutData.menus` 树中查找节点，使其 **`linkUrl`** 与当前语言下列表 URL 一致（需与 `basePath` 规则一致，例如默认英文 ` /solutions`，`jp` 为 ` /jp/solutions`）。
- 使用命中节点的 **`bannerUrl`** 作为列表主 Banner 图；文案可用 `bannerTitle` / `bannerDesc`（与模板约定一致）。
- 未命中或 `bannerUrl` 为空：列表 Banner 可为空或占位，与产品列表「无分类 Banner」体验一致。

---

## 6. 视图与样式

- 主模板：例如 `views/website/global/solutions.hbs`。
- Partials：banner、breadcrumb、左侧分类侧栏、右侧卡片区；结构参考 `website/global/products` 与 UI 稿（卡片边框 `#eee`、圆角 `8px`、间距 `16px` 等与现网规范一致）。
- 样式：新建 `public/css/global/solutions-global.css`（或合理复用 `products-global.css` 中的类名，减少重复）。
- **卡片配图**：优先 `solution.bannerBgUrl`，否则使用统一占位图（与产品列表占位策略一致）。
- **卡片链接**：`{basePath}/solutions/{solutionId}`，其中 `solutionId` 为业务 **`solution_id`**。  
  **说明**：当前仓库前台可能尚无解决方案详情页路由；列表可先输出 URL，详情页可作为同期或二期任务（实现计划中单列）。

---

## 7. 多语言与「国外前台」

- 默认：**所有已配置语言**均可访问列表（含 `cn`），与产品列表路由策略一致。
- 若仅需国外可见：单独需求（如 `cn` 404 或跳转），不在本设计默认范围内。

---

## 8. SEO 与 Sitemap

- 页面 `title` / `description` / `keywords`：首版与产品列表同级处理（站点配置 + 简单拼接）；可选后续用分类 SEO 字段增强。
- `home.controller` 中 sitemap 已包含各语言 `.../solutions`：实现时核对与真实路由一致（含默认语言无前缀路径）。

---

## 9. 验收要点

- 后台为某语言方案选择分类并保存后，该语言前台侧栏与 `?categoryId=` 筛选结果正确。
- 修改菜单中解决方案项的 `bannerUrl` 后，列表 Banner 更新（注意菜单 Redis 缓存 TTL 或清除后台缓存）。

---

## 10. 备选方案（未采用）

- **每次请求直查 DB**：实现简单，但与全站布局缓存策略不一致，不作为首版。
- **在 `getLayoutData` 内统一注入方案数据**：增大 `WebsiteLayoutService` 与 `LayoutCachePayload` 耦合，不作为首版。

---

## 11. 后续步骤（流程）

1. 你审阅本 spec 文件，确认无补充或修改。  
2. 使用 **writing-plans** 技能生成实现计划（任务拆分、文件清单、顺序）。  
3. 按实现计划开发与联调。
