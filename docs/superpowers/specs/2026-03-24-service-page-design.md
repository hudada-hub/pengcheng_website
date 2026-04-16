# 国外前台 · 服务说明页（服务宗旨 + 服务内容）— 设计说明

**状态**：已定稿（待实现）  
**日期**：2026-03-24  
**依赖**：`config` 表 key `service-philosophy`（type 10）、`service-content`（type 12）；`BaseWebsiteController`、`WebsiteLayoutService`。

---

## 1. 背景与目标

新增**服务说明**静态内容页，数据全部来自配置表两条记录，版式对齐运营提供的设计稿（浅灰统计区、橙强调色、深浅交替双栏卡片）。

---

## 2. 产品决策（已确认）

| 项 | 决策 |
|----|------|
| URL | **`/service`**（根路径，默认英文数据）与 **`/:locale/service`**（如 `/cn/service`） |
| 首版模板范围 | **仅海外 `website/global`**；国内 `cn` 是否单独模板后续需求再定 |
| 实现策略 | **方案 A**：控制器将 Config 解析为视图模型，Handlebars + 专用 CSS（SSR） |

---

## 3. 路由与模块

- 新建独立 Nest 模块（与 `DownloadModule`、`WebsiteEventsModule` 一致）：注册 `ServiceController`（或等价命名），`imports` 含 `WebsiteModule`、`I18nModule`、`ConfigCustomModule`（若需）、`RedisModule`（随现有 Website 子模块惯例）。
- 路由：
  - `@Get('service')` → 与活动页根路径一致，内部 `pathLocale` 按默认语言解析。
  - `@Get(':locale/service')` → `locale` 为小写语言码。
- `app.module.ts` 注册该模块。

---

## 4. 布局数据与缓存

- `getLayoutData` 在通用 key（`logo`、`website-title`、`website-description`、`website-keywords`、`footer-*`、`followus`、`contact-us`）之外，增加：
  - **`service-philosophy`**
  - **`service-content`**
- 若某 key 缺失或配置非正常状态：对应**整块不渲染**或安全降级为空，避免整页 500（实现时选一种并写清）。

---

## 5. 区块一：`service-philosophy`（type 10）

| 元素 | 数据源 |
|------|--------|
| 主标题 | 配置行 `title` |
| 引言段落 | 配置行 `description`；正文区域 **max-width** 约 **66%** 容器（大屏），提升可读性 |
| 统计行 | `content` 数组：每项 **`description` 原样**为大号数字（可含 `+`、`GWh` 等，由后台填写）；**`title`** 为下方标签 |
| 区段背景 | 约 `#f9f9f9` |
| 数字颜色 | 橙/金色强调（约 `#f6a828`，实现时可与现有 global 主题变量对齐） |
| 分隔 | 统计项之间 **竖线**（首尾无竖线）；小屏 **换行或横向滚动**，避免挤压 |

---

## 6. 区块二：`service-content`（type 12）

| 元素 | 数据源 |
|------|--------|
| 页内总标题 | 配置行 `title`（如 *Service Content*） |
| 卡片列表 | `content` 数组，每项一张 **圆角双栏**卡片（约 `border-radius: 10px–15px`），卡片间留白 |

### 6.1 交替版式（下标从 0 起）

- **偶数下标（0, 2, …）**：**左图右文**；文字区 **深色底**（约 `#3b4151` / `#3c3f4d`）；`bigTitle` **橙色**；`title`、`subtitle` **白色加粗**；`description`、`subDescription` **白色正文**；深色区内 **短橙色装饰条**（一角，与设计稿一致）。
- **奇数下标（1, 3, …）**：**左文右图**；文字区 **浅底**（约 `#f5f5f5`）；`bigTitle` 橙色；`title`、`subtitle` 深色粗体；正文深色；浅色区内短橙条装饰。

### 6.2 同一卡片内文案形态

- 若存在非空的 **`subtitle` 或 `subDescription`**：按 **双小节** 展示（先 `title` + `description`，再 `subtitle` + `subDescription`）。
- 若 **`subtitle`、`subDescription`、`description` 均为空**，且 **`title` 为长文**：视为 **单段正文**（对应备件、培训两条数据）；仅展示 `bigTitle` + 该段 `title` 正文，不渲染空小标题。

### 6.3 图片

- 使用每项的 **`pic1Url`**；`img` 使用 **`loading="lazy"`**；路径为站内相对路径 `/uploads/...`。

---

## 7. SEO

- **`<title>`**：优先使用 **`service-content.title`** 作为页面主标题，并与全站 `website-title` 的拼接方式与其它内页保持一致（若项目已有 helper，复用）。
- **meta description**：首版可使用 **`service-philosophy.description`**（有则输出）；keywords 沿用全站或留空，不新增表字段（YAGNI）。

---

## 8. 导航与站点地图

- **顶部菜单**：不在代码写死；后台菜单链接指向 **`/service`** 或 **`/{locale}/service`**（与 `basePath` 规则一致）。
- **sitemap**：若项目存在自动生成逻辑，评估是否加入 `service` 路径（实现阶段与现有 sitemap 模块对齐）。

---

## 9. 文案与数据质量

- 配置内错别字（如 `Prodcution`、`Spart`）在 **后台人工修正**，实现不依赖特定拼写。

---

## 10. 非本次范围

- 国内 `cn` 独立视觉模板（除非与 global 完全复用同一 `.hbs`）。
- 修改 Config 表结构或 type 10/12 后台表单（除非渲染时发现字段不足）。

---

## 11. 实现清单（供后续 plan 拆解）

- [ ] 新建 `ServiceModule` + `ServiceController`：`service` / `:locale/service`
- [ ] 解析两条 Config → 视图模型（含交替主题、单段/双段分支）
- [ ] `views/website/global/service.hbs` + partials（可选）
- [ ] `public/css/global/service-global.css`
- [ ] `app.module.ts` 注册模块
- [ ] 手动验证：en 根路径与带 locale 路径、缺配置降级、移动端统计区与卡片布局
