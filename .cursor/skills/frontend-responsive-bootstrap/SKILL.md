---
name: frontend-responsive-bootstrap
description: Guides website (前台) layout to be responsive across mobile, tablet, and desktop using Bootstrap 5 grid and breakpoints. Use when adding or modifying website pages, sections, or components that need to adapt to different screen sizes, or when the user asks for responsive layout or Bootstrap media queries.
---

# 前台响应式样式（Bootstrap）

## 原则

- **优先用 Bootstrap 网格**：用 `container` / `row` / `col-*` 做自适应，尽量不手写 `@media` 做布局。
- **断点统一**：手机、平板、台式机适配都走 Bootstrap 5 断点，避免自定义一套不一致的 breakpoint。
- **适用范围**：仅前台官网（`views/website/`、`public/css/global/`、`public/css/cn/`）；后台用现有 admin 样式，不强制 Bootstrap。

## Bootstrap 5 断点（媒体查询尺寸）

| 断点 | 类前缀 | 最小宽度 | 典型设备 |
|------|--------|----------|----------|
| 默认 | (无) | &lt;576px | 手机 |
| sm | `col-sm-*` | ≥576px | 大屏手机/小平板 |
| md | `col-md-*` | ≥768px | 平板 |
| lg | `col-lg-*` | ≥992px | 小台式 |
| xl | `col-xl-*` | ≥1200px | 台式 |
| xxl | `col-xxl-*` | ≥1400px | 大屏 |

列总数为 12，例如 `col-6` = 半宽，`col-4` = 1/3 宽。

## 引入 Bootstrap

前台页面需在 `<head>` 中引入 Bootstrap CSS（在项目自有 CSS 之前）：

```html
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap-grid.css" ...>
```

已引入的模板：`views/website/global/home.hbs`、`views/website/cn/home.hbs`。

## 布局模式

### 外层容器

- 区块内容用 **`container`**（Bootstrap 会限制 max-width 并做左右 padding，随断点变化）。
- 需要全宽时用 **`container-fluid`**。

### 行与列

- 一行多列：父级 **`row`**，子级 **`col-*`**。
- 行间距：`row` 上使用 **`g-3`**、**`g-4`**、**`g-md-4`** 等（gutter），避免自己写 margin。

### 常见列组合（手机 → 平板 → 台式）

| 需求 | 推荐 class | 效果 |
|------|------------|------|
| 始终 1 列 | `col-12` | 全宽 |
| 手机 1 列，平板起 2 列 | `col-12 col-md-6` | 小屏堆叠，md 以上并排 |
| 手机 1 列，平板 2 列，台式 3 列 | `col-12 col-sm-6 col-lg-4` | 卡片/统计等 |
| 手机 1 列，台式 2 列（如 8+4） | `col-12 col-lg-8` / `col-12 col-lg-4` | 主栏+侧栏 |
| 四栏（如 footer） | `col-12 col-sm-6 col-lg-3` | 小屏 2×2，大屏 4 列 |

### 示例（与本项目一致）

```html
<section class="g-section">
  <div class="container">
    <h2 class="g-section-title">标题</h2>
    <div class="row g-3 g-md-4">
      <div class="col-12 col-sm-6 col-lg-4">
        <div class="g-stats__card">...</div>
      </div>
      <!-- 更多 col -->
    </div>
  </div>
</section>
```

## 何时写自定义 @media

- **布局**：用 Bootstrap 的 `col-*` 解决，不写 `@media` 改 grid/flex 列数。
- **字体、间距、显隐**：若 Bootstrap 工具类不够，可在 `common-global.css` / `home-global.css` 等里用 `@media (max-width: 768px)` 等，**数值尽量与 Bootstrap 断点一致**（576、768、992、1200、1400），便于统一“手机/平板/台式”的认知。

## 检查清单

- [ ] 新区块是否用 `container` + `row` + `col-*`？
- [ ] 列是否按「手机 1 列、平板/台式多列」设了 `col-12 col-sm-*` 等？
- [ ] 是否用 `g-*` 做行间距而非手写 margin？
- [ ] 自定义媒体查询是否与 Bootstrap 断点（576/768/992/1200）对齐？
