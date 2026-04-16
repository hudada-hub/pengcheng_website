# 国外前台 · 解决方案详情页（Hero + 上浮卡片 + 应用案例）— 设计说明

**状态**：已定稿（2026-03-22）  
**范围**：解决方案详情页视觉与布局（参考设计稿）、数据迁移（移除 `solution.content`）、应用案例展示与前台路由、`industry_case` 规格字段。

---

## 1. 背景与目标

- 将 **`/solutions/:id`**（及带语言前缀路径）的解决方案详情页，改为与设计稿一致的：**全屏 Hero**（左文右图氛围）、**上浮白色圆角主卡片**（顶图 + 三列优势）、可选的 **APPLICATION CASES** 区块。
- **不再使用**解决方案的富文本正文；**通过迁移从数据库删除 `solution.content` 列**，并清理代码中所有读写。
- **应用案例区块**：仅当 `related_industry_case_ids` 解析后存在至少一条当前语言下的有效案例时渲染；否则**整块不出现**（含标题、副标题、卡片、「More Cases」）。

---

## 2. 已确认需求（产品决策）

| 项 | 决策 |
|----|------|
| 富文本 `content` | **迁移删除列**，前台与后台均不再使用 |
| 无关联案例时 | **A**：APPLICATION CASES **整块不渲染** |
| 实现深度 | **方案 2**：详情页改版 + 控制器组装数据 + 前台应用案例 **列表/详情** 路由（使「View details」「More Cases」可用） |

---

## 3. 页面结构（信息架构）

### 3.1 Hero

- 背景：`banner_bg_url`（全宽，`object-fit: cover`）。
- 左侧叠层文案（白字）：`banner_title` → 短分割线 → `banner_desc`。
- 不重复展示页面内大标题于 Hero 内（避免与卡片内信息重复）；SEO 标题仍用现有 `meta_title` / `title` 逻辑。

### 3.2 主内容白卡片（相对 Hero 上移重叠）

- 容器：白底、圆角、轻阴影（与项目无大阴影约定协调：可用极轻阴影或边框二选一，实现阶段与 `product-detail` 对齐）。
- 顶图：`kehu_banner_url`，宽满卡片，顶角与卡片圆角一致。
- 三列优势：来源 `kehu` JSON（`[{ title, content }, ...]`）。每列：**标题**、**橙色粗分割线**、**正文**。响应式：桌面 3 列，窄屏递减为 2/1 列（Bootstrap 栅格 + 现有断点）。

### 3.3 富文本区

- **删除**原 `solution-detail` 中 `{{{solution.content}}}` 整块。

### 3.4 APPLICATION CASES（条件渲染）

- **条件**：`related_industry_case_ids` 非空，且解析出的业务 id 能在当前 `langId` 下解析为 `industry_case` 行；**若最终列表为空，不输出该 section**。
- **区块标题 / 副标题**：首版采用模板内 **按语言/国内外观** 的固定文案（与 `isDomestic`、`locale` 分支一致）；不新增配置表字段（若后续要后台可配，单独迭代）。
- **卡片**：缩略图 `thumbnail`、标题 `title`、规格行（见 §4.2）、**View details** → 案例详情 URL。
- **More Cases**：指向**应用案例列表页**（与 §5 路由一致；同语言 `basePath` 前缀）。

---

## 4. 数据模型变更

### 4.1 `solution` 表：删除 `content`

- **迁移**：`ALTER TABLE solution DROP COLUMN content;`（或等价 TypeORM migration）。
- **实体 `Solution`**：移除 `content` 字段。
- **影响面**（需逐项改）：
  - `views/admin/solution-edit-form.hbs`：移除 wangeditor 区块与隐藏 textarea `content`。
  - `public/js` 中若存在仅服务方案编辑器的初始化脚本（`solution-list.hbs` 内联），删除与 editor 相关的逻辑。
  - `admin-solution.controller.ts`：保存逻辑不再读取 `body.content`。
  - `solution-translate.service.ts`：移除对 `source.content` 的翻译与目标行 `content` 写入。

### 4.2 `industry_case` 表：新增规格行（推荐）

- 新增可空列 **`spec_line`**，`VARCHAR(128)`（或项目约定长度），用于卡片上 **如 `600kW/1290kWh`** 展示。
- **实体 `IndustryCase`**：增加 `specLine: string | null`。
- **后台** `industry-case-edit-form`：增加输入框；翻译服务若存在对 `industry_case` 的翻译，需同步翻译 `spec_line`（若当前为纯数字/规格字符串，可按文本翻译或原样复制，实现阶段按现有翻译服务风格处理）。

---

## 5. 前台路由与控制器（应用案例）

- 当前仓库仅存在后台 `industry_case` 管理，**需新增**官网前台模块（命名建议与 `ProductsController` / `SolutionsController` 并列）：
  - **列表**：例如 `GET /cases` 与 `GET /:locale/cases`（具体路径以实现阶段与 `README`、菜单链接为准，本文档锁定「存在可访问的列表页」）。
  - **详情**：例如 `GET /cases/:industryCaseId` 与带 `locale` 变体；详情页使用 `industry_case_id` 业务字段与 `langId` 解析，与 `solution` 详情一致模式。
- `SolutionsController.getSolutionDetailViewContext`（或抽取的私有方法）：
  - 解析 `related_industry_case_ids` → 查询当前语言案例行 → 映射为模板所需 DTO（`id`、`title`、`thumbnail`、`specLine`、`detailUrl`）。
  - 若数组为空，**不注入**案例区块相关变量，模板用 `{{#if}}` 包一层。

---

## 6. 样式与资源

- 新增或扩展 **`public/css/global/solutions-global.css`**（或专用 `solution-detail-global.css`，与产品详情拆分方式对齐）：Hero 左对齐、卡片负 margin、三列橙色分割线、案例区块标题/卡片/More Cases 按钮样式。
- 图标：`View details`、箭头、闪电图标使用 **Iconify**（与项目约定一致）。
- 响应式：遵循 `.cursor/skills/frontend-responsive-bootstrap` 与现有 `grid.css` / `container` 用法。

---

## 7. 缓存与 Redis

- 解决方案列表/详情若经 `SolutionService` 缓存，在保存/删除/翻译方案后已有 `delPattern`；删除 `content` 不改变缓存键语义，但**实体字段变更后需确认缓存序列化无 `content`**。
- 应用案例查询若新增独立缓存，需定义失效点（本方案首版可直接查库，避免过度设计）。

---

## 8. 迁移与回滚

- **迁移前**：备份 `solution` 表；若需保留历史正文，可导出 `content` 到 CSV（一次性运维步骤，非代码必需）。
- **回滚**：从备份恢复列与数据，或重新 `ADD COLUMN content LONGTEXT` 并回滚代码版本（不推荐在无备份时执行 DROP）。

---

## 9. 测试要点

- 无 `related_industry_case_ids`：无 APPLICATION CASES DOM。
- 有关联 id 但语言下无行：无 APPLICATION CASES DOM。
- `kehu` 为空 / 少于 3 条：布局不崩（空列隐藏或合并为单列，实现阶段明确一种行为）。
- 多语言 `basePath` 下链接正确。
- 后台保存方案不再出现富文本；一键翻译不再报错且不再写 `content`。

---

## 10. 后续迭代（非本次范围）

- APPLICATION CASES 标题/副标题改为配置表。
- `kehu` 超过 3 条时的展示策略（轮播 / 多行 / 截断）。

---

## 11. 实现清单（供开发勾选）

- [ ] SQL：`drop_solution_content.sql` + `add_industry_case_spec_line.sql`（或合并迁移）
- [ ] 实体：`Solution` 去掉 `content`；`IndustryCase` 增加 `specLine`
- [ ] 后台：方案编辑表单与保存、翻译服务
- [ ] 后台：案例编辑表单与保存、翻译（如有）
- [ ] 前台：`SolutionsController` 详情上下文 + 新 partials
- [ ] 前台：新建 `IndustryCase`（或 `Cases`）列表/详情控制器与模板
- [ ] CSS：详情页 + 案例区块
- [ ] 验证：上述测试要点
