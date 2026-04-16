# 设计说明：后台与全站删除改为物理删除（硬删除）

**日期**: 2026-03-24  
**状态**: 需求与方案已由负责人确认；技术实施以本 spec + 实现计划 + 代码评审为准。

## 1. 目标

- 所有业务上的「删除」改为 **物理删除**（从数据库删除行），**不再**将 `status` 更新为 `-1`。
- 范围：**后台全部删除入口** + **各业务模块 REST 等价的 `remove` 路径**（用户选项 B：全项目一致）。
- **不在范围**：数据库备份文件删除、纯缓存键清理等非 `status` 语义操作。

## 2. 非目标

- 不实现回收站、恢复、审计日志（除非后续单独立项）。
- **默认不**自动清理历史已存在 `status = -1` 的脏数据；若需清理，单独执行维护 SQL 或工具，上线前评估（可与「数据治理」子任务交叉引用）。

## 3. 当前实现摘要

- `Status.Deleted = -1` 定义于 `src/common/entities/base.entity.ts`。
- 后台：`admin-*.controller.ts`、`admin.controller.ts`、`admin-api.controller.ts`、`config-custom.service.ts` 等大量使用 `update(..., { status: Status.Deleted })`。
- REST：`product.service`、`news.service`、`solution.service`、`menu.service`、`file-material.service`、`config-custom.service` 的 `remove` 同样为软删。

## 4. 行为约定

### 4.1 删除粒度

- 与现网一致：列表/接口多数按 **表主键 `id`** 删除 **单行**（例如某一语言下的 `product` / `news` 行）。
- **不**在未明确要求的情况下，将「删一条产品行」扩展为「删除同一 `product_id` 下所有语言」；若某业务需要「删整实体多语言」，须在对应接口内显式实现并列清单。

### 4.1b 配置与 `configId`

- **配置表**：删除行为与现网一致——按 **当前操作的行主键 `id`** 删除（通常为某一语言下的一条 `config` 行）；**不**在未明确要求时因同一 `configId` 而自动删除其它语言行。若后台某按钮语义为「删掉整条配置（所有语言）」，须在对应接口中显式 `delete` 所有 `configId` 匹配行并单列实现。

### 4.2 关联与子表

- 对无 DB 外键但业务从属的数据，在删父记录前按业务字段 **显式删除子行**，避免孤儿数据。
- 若 `DELETE` 触发数据库外键错误：返回明确错误（业务消息或合适 HTTP 状态），禁止静默忽略。
- 删除成功后：**保持**现有 Redis 等缓存失效策略（如 `delPattern('pengcheng:*')`）。
- **事务**：凡涉及「父记录 + 多子表」或需保证原子性的删除，须在 **同一 TypeORM 事务**中完成（`DataSource.transaction` 或 `QueryRunner`，与项目现有用法一致）；**按外键依赖排序**（先子后父或符合 DB 约束的顺序），失败整笔回滚。

### 4.2b 媒体与附件（首期）

- **首期**：删除以 **数据库行** 为主；**不**自动删除磁盘/`public/uploads` 上的文件，避免多记录共用同一 URL 时误删。
- 若后续需要「删行同时删独占文件」，单独立项并定义引用计数或独占判定规则。

### 4.3 查询与遗留 `status = -1`

- 列表与前台继续以 `status = Normal`（或含 `Hidden`）过滤。
- 在新删除路径不再写入 `-1` 的前提下，**历史软删行可能长期仍存在**；在单独清理前，查询逻辑 **仍保留** 对 `status` 的过滤（不把「非 Normal」等同于「应展示」），勿误删仅依赖 `status` 条件的统计条件。
- 物理删除后行不存在，自然不再出现在列表中。

### 4.4 枚举与文档

- `Status.Deleted` 可保留以兼容历史数据与脚本，新业务路径 **不得再写入 -1**。
- 更新 `README.md` 与 `.cursor/rules/pengcheng-project.mdc` 中关于「-1 删除 / 回收站」的描述，改为物理删除、无回收站；并检视后台模板/文案中「回收站 / 恢复」类字符串。

## 5. 实现策略（已选）

- **主策略**：就地替换——将软删 `update` 改为 `repository.delete` / `remove`，必要时在同一事务内先删子表。
- **不推荐**全库一次性加 `ON DELETE CASCADE` 大迁移，除非某表审查后证明必须；实体与真实库约束需逐表核对。
- **补充检索**：除 `Status.Deleted` 外，检索手写 `UPDATE ... status`、QueryBuilder、报表/定时任务、EntitySubscriber 中与 `-1` 或删除语义相关的逻辑；批量删除注意 `In()` 参数长度与 SQL 限制。

## 6. 主要代码触及面（实现时 checklist）

- **以全仓检索为准**（`rg Status\.Deleted`、`status:\s*-1` 等），下列仅为已知高密度区域，**不得**仅改列举文件：
  - `src/modules/admin/admin-product.controller.ts`（含产品参数等子资源）、`admin-news.controller.ts`、`admin-solution.controller.ts`、`admin-download.controller.ts`、`admin-menu.controller.ts`、`admin-industry-case.controller.ts`、`admin-activity-calendar.controller.ts`、`admin-product-category.controller.ts`、`admin.controller.ts`、`admin-api.controller.ts`
  - `src/modules/config-custom/config-custom.service.ts`
  - `src/modules/product/product.service.ts`、`news/news.service.ts`、`solution/solution.service.ts`、`menu/menu.service.ts`、`file-material/file-material.service.ts`
- 统计或报表若依赖「已删」计数，改为不依赖 `-1`。

## 7. 测试要点

- **P0（必测）**：外键链深或多子表的资源、删语言、删分类、配置批量删、下载多维度分类。
- **抽样**：其余模块可按资源类型抽样单删 + 批量删 + 列表/前台/缓存。
- 共性：删后列表不可见、重复删除/越权 id 的响应与现网策略一致、无孤儿行、无外键错误泄漏。

## 8. 风险

- **不可恢复**：误删只能靠备份恢复；需依赖现有确认弹窗（Popconfirm）与权限控制。
- **外键/孤儿**：遗漏子表删除会导致垃圾数据或删除失败。

## 9. 补充检查清单（NestJS + TypeORM）

- `repository.delete` vs `remove` 的选择；批量 `delete` + `In()` 的参数化。
- 实体上 `onDelete`、`cascade` 与「不大规模改 DB CASCADE」策略一致，避免双重行为。
- 权限与幂等：重复删除、404/410 或业务错误文案与现网一致。
- 种子数据、迁移脚本、E2E/集成测试是否仍假设「软删后行仍在」。

---

**下一步**：根据本 spec 编写实现计划（`writing-plans`），再按任务清单改代码与文档。
