# Website Layout Cache (聚合服务) Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 新增 WebsiteLayoutService，用统一 Redis key（TTL 5 分钟）聚合 menu、product_category、config，所有前台页面通过 getLayoutData(langId) 取数并渲染公共头/导航。

**Architecture:** 聚合服务内先读 Redis key `pengcheng:layout:{langId}`；未命中则并行查 MenuService.findTree、ProductService.listCategories、ConfigCustomService.getByKey，组装后写入 Redis（ttl=300）并返回。控制器只调 getLayoutData，将结果转成 navItems/logoUrl 等注入 view。

**Tech Stack:** NestJS, RedisService (ioredis), TypeORM, Handlebars.

---

## Task 1: Redis key 与 TTL 常量

**Files:**
- Modify: `src/modules/redis/redis.service.ts`

**Step 1:** 在 `CACHE_KEYS` 中增加 `LAYOUT`，并导出布局缓存 TTL 常量（或从配置读取，默认 300）。

在 `redis.service.ts` 中：
- 添加 `LAYOUT: (langId: number) => \`${CACHE_KEY_PREFIX}layout:${langId}\`` 到 `CACHE_KEYS`。
- 可选：在 `configuration.ts` 增加 `redis.layoutTtlSeconds`（默认 300），在 `RedisService` 中读取；若暂不配置化，则在聚合服务内写死 300。

**Step 2: Commit**

```bash
git add src/modules/redis/redis.service.ts
git commit -m "chore(redis): add LAYOUT cache key and layout TTL"
```

---

## Task 2: 定义 LayoutCachePayload 与 WebsiteLayoutService 接口

**Files:**
- Create: `src/modules/website/website-layout.types.ts`
- Create: `src/modules/website/website-layout.service.ts`（仅接口与空实现或占位）

**Step 1:** 新建类型文件，定义 `LayoutCachePayload`（menus, productCategories, configByKey）及 `GetLayoutDataOptions`（configKeys?: string[]）。

**Step 2:** 新建 `WebsiteLayoutService`，依赖注入 MenuService、ProductService、ConfigCustomService、RedisService；实现 `getLayoutData(langId: number, options?: GetLayoutDataOptions): Promise<LayoutCachePayload>`：先读 `CACHE_KEYS.LAYOUT(langId)`，命中则返回；未命中则并行调 menu.findTree、product.listCategories、按 options.configKeys 逐个 config.getByKey，组装 payload，用 `redis.set(key, payload, 300)` 写入后返回。

**Step 3:** 在 `WebsiteModule` 中注册 `WebsiteLayoutService`：imports 增加 `RedisModule`（MenuModule/ConfigCustomModule 未导出 RedisModule），providers 增加 `WebsiteLayoutService`，exports 可选导出供他处复用。

**Step 4: Commit**

```bash
git add src/modules/website/website-layout.types.ts src/modules/website/website-layout.service.ts src/modules/website/website.module.ts
git commit -m "feat(website): add WebsiteLayoutService and getLayoutData with Redis layout cache"
```

---

## Task 3: WebsiteController 改为使用 getLayoutData

**Files:**
- Modify: `src/modules/website/website.controller.ts`

**Step 1:** 注入 `WebsiteLayoutService`，在 `getHomeViewContext` 中：在得到 `langId`、`isDomestic` 后，不再 `Promise.all([productService.listCategories, menuService.getFromCache, configService.getFromCache])`，改为调用 `websiteLayoutService.getLayoutData(langId, { configKeys: ['logo1', 'logo2'] })`，用返回的 `menus`、`productCategories`、`configByKey` 计算 logo（按 isDomestic 取 logo2 或 logo1）、buildCategoryTree、buildMenuNav，得到 navItems。其余逻辑（locale、basePath、viewName 等）不变。

**Step 2: Commit**

```bash
git add src/modules/website/website.controller.ts
git commit -m "refactor(website): use WebsiteLayoutService.getLayoutData for home view context"
```

---

## Task 4: 后台变更时清理 layout 缓存

**Files:**
- Modify: `src/modules/redis/redis.service.ts`（可选：新增 `clearLayoutCache()` 方法，内部 `delPattern('pengcheng:layout:*')`）
- Modify: `src/modules/menu/menu.service.ts`（create/update/remove 三处，在现有 `delPattern('pengcheng:menu:*')` 后增加 layout 清理）
- Modify: `src/modules/config-custom/config-custom.service.ts`（所有 `delPattern('pengcheng:config:*')` 处共约 6 处，随后增加 layout 清理）

说明：产品分类在 `admin-product-category.controller.ts` 已使用 `delPattern('pengcheng:*')`，会清掉 layout；后台「清除 Redis 缓存」在 `admin-core.controller.ts` 调用 `redis.clearCache()` 会清掉全部 `pengcheng:*`，无需再改。

**Step 1:** 在 `menu.service.ts` 的 create、update、remove 方法中，在现有 `await this.redis.delPattern('pengcheng:menu:*')` 之后增加 `await this.redis.delPattern('pengcheng:layout:*')`。在 `config-custom.service.ts` 中所有 `await this.redis.delPattern('pengcheng:config:*')` 之后增加 `await this.redis.delPattern('pengcheng:layout:*')`。

**Step 2: Commit**

```bash
git add src/modules/menu/menu.service.ts src/modules/config-custom/config-custom.service.ts
git commit -m "chore: clear layout cache when menu or config changes"
```

---

## Task 5: 配置化 TTL（可选）

**Files:**
- Modify: `src/config/configuration.ts`
- Modify: `src/modules/website/website-layout.service.ts`

**Step 1:** 在 `configuration.ts` 的 redis 段增加 `layoutTtlSeconds: 300`（或从 env 读取）。在 `WebsiteLayoutService` 中注入 ConfigService，读取 `config.get('redis.layoutTtlSeconds', 300)` 作为 set 的 ttl 参数。

**Step 2: Commit**

```bash
git add src/config/configuration.ts src/modules/website/website-layout.service.ts
git commit -m "config: add redis.layoutTtlSeconds for layout cache"
```

---

## Verification

- 启动应用，访问首页 `/`、`/cn`、`/en`，确认头部/导航与改前一致。
- 在 Redis 中检查存在 `pengcheng:layout:{langId}`，TTL 约 300。
- 在后台修改菜单或产品分类或配置后，再访问首页，确认 5 分钟内可看到更新（或立刻若清理了 layout 缓存）。

---

## Execution Options

**Plan complete and saved to `docs/plans/2025-03-15-website-layout-cache.md`.**

1. **Subagent-Driven (this session)** — 按任务拆分子 agent 执行，每步可 review。
2. **Parallel Session (separate)** — 在新会话中用 executing-plans 按检查点批量执行。

Which approach do you prefer?
