# 国外前台 · 应用案例详情页（上一条/下一条、分享、返回列表）— 设计说明

**状态**：已定稿（2026-03-22）  
**依赖**：`website/global/case-detail`、`IndustryCasesController` 现有列表与详情逻辑。

---

## 1. 背景与目标

在应用案例详情页增加：

- **上一条 / 下一条**：在同一语言、公开案例集合内切换；
- **社交分享**：微信（Web 可复制链接）、LinkedIn 等，无重第三方 SDK；
- **返回案例列表**：与面包屑中「应用案例」使用同一列表 URL，侧栏提供快捷入口。

---

## 2. 产品决策（已确认）

| 项 | 决策 |
|----|------|
| 相邻案例顺序 | **与案例列表页完全一致**（`buildCasesListContext` 与列表查询同一条件与排序） |

### 2.1 列表与排序（实现时必须对齐）

与 `IndustryCasesController.buildCasesListContext` 中查询一致：

- **条件**：`langId` = 当前语言，`status` = 正常（`Status.Normal`）。
- **排序**：`isTop` **DESC** → `sort` **ASC** → `id` **DESC**。

上一条 / 下一条在该有序序列中，按当前案例的 **业务 id** `industry_case_id` 定位前后项（以行数据解析出的顺序为准，与列表渲染顺序一致）。

---

## 3. 分享策略

- **复制链接**：当前页完整 URL（考虑 `SITE_URL` / 反代后的 canonical，实现阶段与现有 SEO 约定一致）。
- **LinkedIn**：`https://www.linkedin.com/sharing/share-offsite/?url={encoded}`。
- **微信（Web）**：无官方一键 URL；提供 **复制链接** + 简短提示（如「在微信中粘贴分享」）。不引入微信 JSSDK（首版）。
- **可选扩展**：`navigator.share` 作为移动端增强，需降级到复制链接。

---

## 4. UI/交互

- **桌面**：主内容右侧 **`position: sticky`** 竖向工具条：上一条、下一条、分享、返回列表（图标 + `aria-label`）。
- **移动端**：改为底栏或折叠菜单，避免遮挡正文（实现阶段二选一，与现有响应式规范一致）。
- **边界**：首篇无上一条、末篇无下一条：按钮 **禁用** 或 **隐藏**（实现阶段统一一种）。

---

## 5. 数据与控制器

在 `buildCaseDetailContext`（或抽取的私有方法）中，在取得当前 `industryCase` 后：

1. 使用与列表 **相同** 的 `find` + `order` 拉取当前语言下全部公开案例（或优化为仅查询 id 序列后取邻接，避免 N+1）。
2. 在有序数组中定位当前 `industryCaseId` 的索引，得到 `prev` / `next` 的 `title`、`url`（`basePath` + `/cases/{industryCaseId}`）。
3. 注入模板：`casePrev`、`caseNext`（可为 `null`）、`sharePageUrl`（或 `canonicalUrl`）。

---

## 6. 非本次范围

- 新增「发布时间」字段（若需与 `created_at` 区分，另起需求）。
- 微信 JSSDK、公众号分享。

---

## 7. 实现清单

- [ ] `IndustryCasesController`：计算 prev/next + share URL
- [ ] `case-detail.hbs`：侧栏/底栏 markup + Iconify
- [ ] `public/css/global/cases-global.css`（或专用片段）：sticky 侧栏与移动端样式
- [ ] `public/js`：复制链接、打开 LinkedIn、可选 `navigator.share`
- [ ] 验证：顺序与 `/cases` 列表一致；首尾边界；多语言 `basePath`
