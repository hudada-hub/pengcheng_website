# 页面访问统计（明细 + 聚合）— 设计说明

**状态**：已定稿（待实现）  
**日期**：2026-03-24  
**前置结论**：采用 **方案 B** — 保留 `page_stats` 聚合表，新增访问明细表；同步双写。

---

## 1. 背景与目标

- 提供公开接口统计页面访问：**语言**、**页面 URL**、**浏览器（UA）**、服务端解析的 **IP**。
- 前台 `views/website/global`（及复用 global 的页面）通过 **Ajax 统一封装** 上报。
- 后台 **`/admin/page-stats`** 展示**访问记录列表**（分页），替代占位页。
- **Redis**：同一 IP 对该接口 **每秒最多 1 次**；自然日内该 IP 请求超过 **1000 次**则 **封禁 7 天**。
- 与项目约定一致：**短时间同 IP 同 URL 去重**，多次刷新计为一次有效访问（明细与聚合均不重复写入）。

---

## 2. 数据模型

### 2.1 `page_stats`（现有实体 `PageStats`）

- **语义不变**：`lang_id` + `page_type` 唯一逻辑维度，`view_count`、`last_view_at` 聚合字段。
- **实现说明**：可不修改 `page-stats.entity.ts` 字段；若需与代码注释/README 对齐，仅做文档级说明，**不把明细字段并入此表**。

### 2.2 `page_visit_log`（新实体，例如 `PageVisitLog`）

| 字段 | 说明 |
|------|------|
| `id` | 自增主键 |
| `lang_id` | 语言表 id |
| `page_url` | 建议 `varchar(512)`，过长截断；含 pathname，query 按产品截断策略 |
| `page_type` | `varchar(64)`，与 `page_stats.page_type` 同一套取值，供聚合更新 |
| `client_ip` | 服务端解析，**禁止**信任请求体中的 IP |
| `user_agent` | 来自请求头 `User-Agent`；可选额外 `browser_hint`（varchar）存前端简短描述，**非必填** |
| `status` | `1` 正常（兼容表惯例 `0` 隐藏等） |
| `created_at` / `updated_at` | 与项目通用约定一致 |

表名建议：`page_visit_log`。

---

## 3. 公开上报 API

- **方法/路径**：`POST /api/page-view`（与现有路径统一；扩展 body，避免并存两套接口）。
- **Body（JSON）**：
  - `langId`（number，必填）
  - `pageUrl`（string，必填）
  - `pageType`（string，**必填**；与现有 README 中页面类型一致。若缺失或空字符串，返回 `ok: false`、`reason: 'bad_request'`，**不写库、不计数**）
  - `browser`（string，可选，仅作 `browser_hint` 或忽略，以 UA 为准）
- **HTTP 状态码**：**始终返回 200**（含封禁、限流、去重、参数错误），通过 body 中 `ok` / `reason` 区分；避免对外暴露过多攻击面分类信息，且便于前端 `fetch` 统一处理。
- **请求体大小**：与全局 Fastify body limit 一致；实现时若需收紧，对单一路由单独限制并写入代码注释。
- **IP**：仅服务端从 `FastifyRequest` 解析（与现有 `page-stats.controller` 一致，含 `x-forwarded-for` 处理）。
- **CSRF**：保持 **不** 对公开上报使用 `CsrfGuard`（与当前 `api/page-view` 一致）。
- **响应示例**：`{ ok: true, counted: true }` / `{ ok: true, counted: false }` / `{ ok: false, reason: 'banned' | 'rate_limited' | 'deduped' | 'redis_down' }`（`reason` 枚举实现时定稿）。

### 3.1 处理顺序（必须按序）

1. **参数校验**：`langId`、`pageUrl`、`pageType` 合法（非空、类型正确）；失败则 `ok: false`、`reason: 'bad_request'`，不写库。
2. 若 Redis 不可用：**拒绝写库**，返回 `ok: false`（`reason: 'redis_down'`），打日志；**绝不**在 Redis 故障时回写 MySQL。
3. 若存在封禁键：直接拒绝，**不写库**，`reason: 'banned'`。
4. **每秒 1 次**（按 IP + 本接口）：失败则拒绝，不写库，`reason: 'rate_limited'`。
5. **日计数** `INCR`，自然日按 **服务器时区 Asia/Shanghai**：键 `yyyyMMdd` 以该时区为准；TTL 至 **该时区次日 00:05**；若计数 **> 1000**，写入封禁键 **TTL 7 天**（604800 秒），并拒绝当前及后续请求，`reason: 'banned'`。
6. **去重**：`dedupe` 键（IP + `langId` + **规范化后** `pageUrl` 的哈希），TTL **120 秒**（固定值）；命中则 `ok: true, counted: false, reason: 'deduped'`，不写明细、不更新聚合。
7. 通过门禁后：**插入** `page_visit_log`，并调用现有逻辑 **更新** `page_stats`（`recordView(langId, pageType)` 或等价）。

### 3.2 URL 规范化（用于去重哈希，实现须一致）

- 输入为客户端上报的 `pageUrl` 字符串（通常为 pathname + query）。
- 步骤：`decodeURIComponent` 各段（失败则保持原串）、去掉 **fragment**（`#` 及之后）、**pathname 转小写**、去掉 pathname **末尾 `/`**（若为根路径则保留 `/`）、query 按 **参数名升序**重排后拼接（无 query 则省略 `?`）。
- 总长度超过 DB 字段上限时：**哈希前完整规范化**，入库字段 **截断**至 `varchar(512)`（或表定义长度），截断规则与实现代码一致并写注释。

### 3.3 可选加固（实现阶段择一或组合）

- **不强制**：若刷量明显，可增加 `Origin`/`Referer` 须为同源或空的校验；本 spec 默认 **不** 强制，以免错误 CDN/代理配置导致误杀。

---

## 4. Redis Key 约定

统一前缀与 session 等区分，例如：`pengcheng:pageview:`

| 用途 | Key 模式 | TTL / 说明 |
|------|-----------|------------|
| 封禁 | `pengcheng:pageview:ban:<ip>` | 7 天 |
| 秒级限流 | `pengcheng:pageview:rl:<ip>` | 1 秒 |
| 日计数 | `pengcheng:pageview:day:<yyyyMMdd>:<ip>` | `yyyyMMdd` 为 **Asia/Shanghai**；TTL 至该时区 **次日 00:05** |
| 去重 | `pengcheng:pageview:dedupe:<ip>:<langId>:<urlHash>` | **120 秒**（固定） |

门禁逻辑放在 **`PageStatsService`（或专用 `PageViewGateService`）** 中，由 Controller 薄层调用；可选用 **Lua 脚本** 合并多步以保证原子性；若分步执行，需在实现 PR 中注明竞态边界。

---

## 5. 前台集成

- 新增 partial：`views/website/global/partials/common/page-view-tracker.hbs`（或等价路径）。
- 在 **`views/website/global/partials/common/footer.hbs` 末尾** 引入一次，使所有引用 global footer 的页面自动上报。
- SSR 向页面注入 `langId`、`pageType`（由各页 controller 传入 layout/footer 上下文；可在 layout 层统一注入减少重复）。
- 脚本：`fetch` POST JSON，`pageUrl` 使用 `location.pathname + location.search`（按长度截断）；可选 `keepalive: true`。
- **国内 `cn` 模板**：若复用 global footer，一并生效；若独立 footer，需同样引入 tracker partial。

---

## 6. 后台 `/admin/page-stats`

- 替换 `renderPlaceholder`：新建列表模板（如 `views/admin/page-stats-list.hbs`），风格对齐现有后台（表格、分页、空状态）。
- 列：时间、`lang`、`page_url`、`page_type`、`client_ip`、`user_agent`（表格内截断）。
- 数据：SSR 首屏 + 分页或 AJAX，**模式与 `news-list` 等现有列表一致**；路由需 `AdminAuthGuard`，变更类接口保留 `CsrfGuard`（只读列表若纯 GET 可不 CSRF）。
- **`GET /api/page-stats`**：**保留**（现有行为），供汇总列表；后台可在同页增加汇总区块或链出，不删除该路由。

---

## 7. 模块与依赖

- `PageStatsModule`：`TypeOrmModule.forFeature([PageStats, PageVisitLog])`，注入 `RedisService`（或 ioredis 客户端）实现门禁逻辑。
- `database.module.ts` 注册新实体；提供 MySQL 迁移/SQL 建表脚本或 README 说明。
- 移除或替换 `PageStatsController` 内 **进程内 `Map`** 去重，改为 Redis，避免多实例不一致。

---

## 8. 安全与合规

- 不信任客户端上报 IP。
- 封禁与限流仅针对统计接口，不影响整站（除非后续扩展中间件，**本 spec 不要求**）。
- 日志表可能含个人信息（IP、UA）；后台仅管理员可访问，与现有后台权限一致。

---

## 9. 测试建议

- 手工：
  - **秒级限流**：1 秒内连发 2 次 → 第二次 `counted: false`，`reason: 'rate_limited'`。
  - **去重**：间隔 **>1s** 且在 **120s 内** 对**同一规范化 URL** 再请求 → `counted: false`，`reason: 'deduped'`，数据库无第二条明细。
  - **日计数与封禁**：单日同一 IP 第 1001 次成功通过秒级与去重后的请求触发封禁；随后请求 `reason: 'banned'`。
- 自动化：可选对解析 IP、URL 规范化、Redis 失败分支做单测。

---

## 10. 与先前讨论的差异记录

- 无。已采纳：方案 B、同步双写、footer 单点引入、Redis 顺序、日 1000 / 封禁 7 天、短时间去重。
