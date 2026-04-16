# 全站删除改为物理删除（硬删除）实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将所有业务删除从 `status = -1` 软删改为数据库物理删除，覆盖后台全部删除入口与 REST `remove` 路径，并同步文档；不自动删除磁盘上传文件（见 spec §4.2b）。

**Architecture:** 在各处将 `repository.update(..., { status: Status.Deleted })` 替换为 `repository.delete(...)`（或等价 `delete` criteria）；若存在子表或外键依赖，在同一 `DataSource.transaction` 内按依赖顺序先删子后删父；删除后保留现有 `redis.delPattern('pengcheng:*')` 等缓存失效。实现前用全仓 `rg` 确认无遗漏。

**约束（对齐 spec）：**（1）**仅改删除写入路径**，不得因硬删而删除或弱化列表/前台既有 `status = Normal` / `Hidden` 等查询条件（除非单独评审）。（2）若 `delete` 触发外键错误，须映射为明确错误响应或重定向提示，**禁止** `catch` 后吞掉并当作成功。（3）批量 `In(ids)` 若 ID 数量极大，需分批删除或确认 MySQL/驱动限制。

**Tech Stack:** NestJS 11、TypeORM、Fastify、MySQL、Redis、Handlebars 后台模板。

**Spec 依据:** `docs/superpowers/specs/2026-03-24-admin-hard-delete-design.md`

---

## 文件总览（预计修改）

| 区域 | 文件 |
|------|------|
| REST / 领域服务 | `src/modules/product/product.service.ts`、`news/news.service.ts`、`solution/solution.service.ts`、`menu/menu.service.ts`、`file-material/file-material.service.ts` |
| 配置模块 | `src/modules/config-custom/config-custom.service.ts` |
| 后台控制器 | `src/modules/admin/admin-product.controller.ts`、`admin-news.controller.ts`、`admin-solution.controller.ts`、`admin-download.controller.ts`、`admin-menu.controller.ts`、`admin-industry-case.controller.ts`、`admin-activity-calendar.controller.ts`、`admin-product-category.controller.ts`、`admin.controller.ts`、`admin-api.controller.ts` |
| 文档 | `README.md`、`.cursor/rules/pengcheng-project.mdc` |
| 后台模板检视 | `views/admin/**/*.hbs`：Task 9 必做 `rg` 检视「回收站 / 恢复」类文案（排除 `db-backup` 等「恢复数据库」语义） |

**不修改（确认即可）:** `src/common/entities/base.entity.ts` 中可保留 `Status.Deleted` 枚举值但业务不再写入；`db-backup` 备份文件删除等非 status 语义。

---

### Task 0: 基线与外键摸底

**Files:**
- Read: 各 `src/entities/*.entity.ts` 中带 `@ManyToOne` / `onDelete` 的实体
- Modify: 无（仅记录）

- [ ] **Step 1:** 在仓库根执行检索，保存命中列表便于勾选。

```bash
rg "Status\.Deleted" src --glob "*.ts"
```

预期：列出本文「文件总览」中各文件及行号；若有新增命中一并纳入。

- [ ] **Step 2:** 对「删父记录」的模块（下载分类/系列/文件类型、产品分类树、语言等）打开对应 entity，记录 MySQL 是否会因 FK 阻止 `DELETE`，以及 TypeORM 声明的 `onDelete`（`CASCADE` / `SET NULL`）。将需「先删子表」的写在 Task 备注中。

- [ ] **Step 3:** Commit（若仅笔记可跳过；或 commit 到个人分支的 `docs:` 草稿，由团队习惯决定）。

---

### Task 1: REST 与共享 Service — `remove` 改为硬删

**Files:**
- Modify: `src/modules/product/product.service.ts`
- Modify: `src/modules/news/news.service.ts`
- Modify: `src/modules/solution/solution.service.ts`
- Modify: `src/modules/menu/menu.service.ts`
- Modify: `src/modules/file-material/file-material.service.ts`

- [ ] **Step 1:** 在 `product.service.ts` 中把 `remove` 从软删改为物理删除。

替换前：

```typescript
async remove(id: number): Promise<void> {
  await this.productRepo.update(id, { status: Status.Deleted });
}
```

替换后（无子表时最小改动）：

```typescript
async remove(id: number): Promise<void> {
  await this.productRepo.delete(id);
}
```

- [ ] **Step 2:** 对 `news.service.ts`、`solution.service.ts`、`menu.service.ts`、`file-material.service.ts` 的 `remove` 做同样替换。若某模块删除时抛出 FK 错误，根据 Task 0 笔记在同一方法内用 `this.dataSource.transaction` 先删子行再删主行（注入 `DataSource` 若尚未注入）。

- [ ] **Step 3:** 编译验证。

```bash
cd c:\code\pengcheng_website
npm run build
```

预期：无 TypeScript 错误。

- [ ] **Step 4:** Commit

```bash
git add src/modules/product/product.service.ts src/modules/news/news.service.ts src/modules/solution/solution.service.ts src/modules/menu/menu.service.ts src/modules/file-material/file-material.service.ts
git commit -m "feat: hard delete in REST remove() for product/news/solution/menu/file-material"
```

---

### Task 2: `config-custom.service.ts` 配置与分类删除

**Files:**
- Modify: `src/modules/config-custom/config-custom.service.ts`

- [ ] **Step 1:** 将 `batchRemoveDeletable`、`remove`、分类删除中所有 `update(..., { status: Status.Deleted })` 改为 `this.configRepo.delete(...)` / `this.categoryRepo.delete(...)`（或 `delete({ id: In(idList) })`）。保持原有 `deletable` 校验逻辑不变。

- [ ] **Step 2:** 若删除 `config` 行时存在关联表（若有），在事务内按顺序删除。当前若无 FK 错误则无需事务。

- [ ] **Step 3:** `npm run build`

- [ ] **Step 4:** Commit

```bash
git add src/modules/config-custom/config-custom.service.ts
git commit -m "feat: hard delete for config-custom batch and single remove"
```

---

### Task 3: 后台 — 产品、产品分类、产品参数

**Files:**
- Modify: `src/modules/admin/admin-product.controller.ts`
- Modify: `src/modules/admin/admin-product-category.controller.ts`

- [ ] **Step 1:** `admin-product.controller.ts`：`productDelete`、`productBatchDelete` 使用 `productRepo.delete(id)` / `delete({ id: In(ids) })`；`productParamDelete` 使用 `productParamRepo.delete(id)`。保留 `redis.delPattern?.('pengcheng:*')`。

- [ ] **Step 2:** `admin-product-category.controller.ts`：单删与批量删改为 `delete`。若删除分类时存在子分类，**保持现有业务逻辑**：若当前代码已递归收集子 ID 再更新，则改为对相同 ID 集合 `delete`；若仅更新单条，需确认是否应先删子分类（与现网行为一致，避免破坏树结构）。

- [ ] **Step 3:** `npm run build`

- [ ] **Step 4:** Commit

```bash
git add src/modules/admin/admin-product.controller.ts src/modules/admin/admin-product-category.controller.ts
git commit -m "feat(admin): hard delete products, params, product categories"
```

---

### Task 4: 后台 — 新闻与方案

**Files:**
- Modify: `src/modules/admin/admin-news.controller.ts`
- Modify: `src/modules/admin/admin-solution.controller.ts`

- [ ] **Step 1:** `admin-news.controller.ts`：新闻分类与新闻正文的单删/批量删全部改为 `delete`，保留 Redis 失效。

- [ ] **Step 2:** `admin-solution.controller.ts`：方案与方案分类单删/批量删改为 `delete`，保留 Redis 失效。

- [ ] **Step 3:** `npm run build`

- [ ] **Step 4:** Commit

```bash
git add src/modules/admin/admin-news.controller.ts src/modules/admin/admin-solution.controller.ts
git commit -m "feat(admin): hard delete news and solutions"
```

---

### Task 5: 后台 — 下载中心（多实体）

**Files:**
- Modify: `src/modules/admin/admin-download.controller.ts`

- [ ] **Step 1:** 将 `download`、`downloadCategory`、`downloadFileType`、`downloadSeries` 的单删与批量删从 `update` 软删改为 `delete`。

- [ ] **Step 2:** 以 **Task 0** 对目标库真实 FK 为准。若 `download` 表对分类的外键已为 **ON DELETE CASCADE**，可仅 `delete` 分类（子行由库级联删除），仍建议放在事务内；若生产库**无 FK**，则应用层须先删子再删父。`Download` 实体上 `ManyToOne(..., { onDelete: 'CASCADE' })` 仅作提示，**不能替代**对真实库的确认。

示例骨架（无 FK 时的保守顺序；有 CASCADE 时可简化为只删分类，由 Task 0 结论定）：

```typescript
await this.dataSource.transaction(async (manager) => {
  await manager.getRepository(Download).delete({ resourceTypeId: categoryId });
  await manager.getRepository(DownloadCategory).delete(categoryId);
});
```

- [ ] **Step 3:** `npm run build`

- [ ] **Step 4:** Commit

```bash
git add src/modules/admin/admin-download.controller.ts
git commit -m "feat(admin): hard delete download entities with safe ordering"
```

---

### Task 6: 后台 — 菜单、活动日历、行业案例

**Files:**
- Modify: `src/modules/admin/admin-menu.controller.ts`
- Modify: `src/modules/admin/admin-activity-calendar.controller.ts`
- Modify: `src/modules/admin/admin-industry-case.controller.ts`

- [ ] **Step 1:** 各文件中单删/批量删改为 `repository.delete`，保留 Redis 若已有。

- [ ] **Step 2:** `npm run build`

- [ ] **Step 3:** Commit

```bash
git add src/modules/admin/admin-menu.controller.ts src/modules/admin/admin-activity-calendar.controller.ts src/modules/admin/admin-industry-case.controller.ts
git commit -m "feat(admin): hard delete menus, activity calendar, industry cases"
```

---

### Task 7: 后台 — 杂项与管理员 API

**Files:**
- Modify: `src/modules/admin/admin.controller.ts`
- Modify: `src/modules/admin/admin-api.controller.ts`

- [ ] **Step 1:** `admin.controller.ts`：语言、购物车留言、联系留言、海外招聘等删除改为 `delete`。**删除语言**：确认 `Lang` 与各内容表的 FK（实体上多为 `onDelete: 'CASCADE'`）；若应用层直接 `langRepo.delete(id)` 即可由 DB 级联则保持单次删除，否则在事务内按 spec 顺序处理。若担心生产库无 FK，须在 Task 0 确认后再编码。

- [ ] **Step 2:** `admin-api.controller.ts`：`adminDelete` 中系统管理员保护逻辑保留，将 `adminRepo.update(..., Status.Deleted)` 改为 `adminRepo.delete(id)`。

- [ ] **Step 3:** `npm run build`

- [ ] **Step 4:** Commit

```bash
git add src/modules/admin/admin.controller.ts src/modules/admin/admin-api.controller.ts
git commit -m "feat(admin): hard delete lang/cart/contact/recruit/admin user"
```

---

### Task 8: 全仓扫尾与误用排查

**Files:**
- Grep: `src/**/*.ts`、`scripts/`、`test/`（若存在）

- [ ] **Step 1:** 再次执行，预期 **零命中**（除 `base.entity.ts` 枚举定义与注释外）。

```bash
rg "Status\.Deleted" src --glob "*.ts"
```

- [ ] **Step 2:** 检索可能手写软删：

```bash
rg "status:\s*Status\.Deleted|update\([^\)]*,\s*\{\s*status:\s*-1" src --glob "*.ts"
```

- [ ] **Step 3:** 检索 `QueryBuilder`、`.update(` 等与 `status` 组合的手写更新（按项目习惯补充关键词，如 `\.update\(|createQueryBuilder`），覆盖 `src` 与 `scripts/`、`test/`。

- [ ] **Step 4:** **统计 / 报表**：检索 `Status.Deleted`、`-1`、`Deleted` 在**非删除 API**中的使用（如 dashboard、原生 SQL）；若存在「只统计已软删」的逻辑，改为与硬删一致（删后行不存在）。

- [ ] **Step 5:** 打开测试、种子、迁移中与 `status`、`-1` 相关的断言；若测试假设「删后行仍在」，更新断言或测试数据。无相关文件则记录「已确认无」。

- [ ] **Step 6:** 若有修复，commit：`fix: remove remaining soft-delete writes`

---

### Task 9: 文档与规则

**Files:**
- Modify: `README.md`
- Modify: `.cursor/rules/pengcheng-project.mdc`
- 检视: `views/admin/**/*.hbs`

- [ ] **Step 1:** 检视后台模板文案（排除数据库备份页的「恢复」语义）：

```bash
rg "回收站|恢复" views/admin
```

对命中项判断是否仍指「业务回收站」；若误导则改文案。无命中或均已合理则记录「已检视」。

- [ ] **Step 2:** 在 README 数据表约定中，将「status -1 删除、回收站」改为：**删除为物理删除，无回收站**；`status` 仍保留 `0/1` 等展示用含义（与现表结构一致）。并注明：历史 `status=-1` 行在清理前仍存在时，**列表查询仍应按 status 过滤**（与 spec §4.3 一致）。

- [ ] **Step 3:** 同步更新 `.cursor/rules/pengcheng-project.mdc` 相同段落。

- [ ] **Step 4:** Commit

```bash
git add README.md .cursor/rules/pengcheng-project.mdc
# 若有 hbs 修改则一并 add
git commit -m "docs: describe hard delete; remove recycle-bin wording for status -1"
```

---

### Task 10: 验证（P0 手工清单）

**Files:** 无

- [ ] **Step 1:** `npm run build` — 必须通过。

- [ ] **Step 2:** `npm run lint` — 解决新增告警（若项目已配置 eslint）。

- [ ] **Step 3:** 本地启动 `npm run dev`，登录后台，对 **P0** 各点至少点删一次并刷新列表：下载（含分类）、配置批量删、删一条新闻/产品、菜单、活动日历、行业案例、语言（**慎用测试库**）。

- [ ] **Step 4:** **遗留数据**：若测试库中仍有 `status=-1` 的旧行，抽查某列表页展示是否与改前一致（不应因硬删改造而误展示脏数据）。

- [ ] **Step 5:** 任选可安全构造的场景，确认外键删除失败时用户能看到明确错误（重定向消息或接口错误），而非静默成功。

- [ ] **Step 6:** 对 REST `DELETE`（若路由存在且可调用）用 Postman/curl 测 `remove` 后 DB 行消失（测试环境）。

- [ ] **Step 7:** 若有 `src/app.controller.spec.ts` 等，运行 `npx jest`（仅当项目已配置 jest；当前 `package.json` 脚本未列 jest，以 build + 手工为主）。

---

## 执行完成后

再次执行：

```bash
rg "Status\.Deleted" src --glob "*.ts"
```

除 `base.entity.ts` 外应为空或仅剩注释。

---

## 执行方式（交付时由负责人选择）

**Plan complete and saved to `docs/superpowers/plans/2026-03-24-hard-delete-implementation-plan.md`. Two execution options:**

1. **Subagent-Driven (recommended)** — 每任务独立子代理 + 任务间复核，迭代快。  
2. **Inline Execution** — 本会话按 Task 顺序执行，设检查点批量提交。

请选择 **1** 或 **2** 开始落地实现。
