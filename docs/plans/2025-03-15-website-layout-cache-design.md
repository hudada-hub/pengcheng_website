# 前台页面公共数据 Redis 缓存 — 设计文档

## 目标

所有前台页面（首页、未来的产品/解决方案/新闻等）共用同一套「先 Redis 后 MySQL」的公共数据（menu、product_category、config），TTL 统一 5 分钟，通过聚合服务一次读写，实现可复用、可扩展。

## 架构

- 新增 **WebsiteLayoutService**，对外提供 `getLayoutData(langId, options?)`，返回聚合的菜单、产品分类、所需配置（如 logo）。
- 使用**统一 Redis key**（如 `pengcheng:layout:{langId}`）存一份聚合对象，TTL 固定 5 分钟（300 秒）。
- 控制器：需要公共头/导航的页面只调用 `getLayoutData(langId)`，将结果注入 view context；页面内不再直接调 MenuService / ProductService.listCategories / ConfigService 取这三类数据。
- 后台在菜单、产品分类、配置的增删改时，除现有按 key 的缓存清理外，同时删除 `pengcheng:layout:*`，保证前台尽快看到更新。

## 聚合数据结构与 Redis 规范

### Redis Key

- Key：`pengcheng:layout:{langId}`  
- 示例：`pengcheng:layout:1`  
- 与现有 `CACHE_KEY_PREFIX`（`pengcheng:`）一致，便于 `clearCache` 或按模式清理。

### 聚合对象结构（接口）

```ts
interface LayoutCachePayload {
  menus: Menu[];           // 树形菜单，与 MenuService.findTree 一致
  productCategories: ProductCategory[];
  configByKey: Record<string, Config | null>;  // 如 { logo1: Config, logo2: Config }
}
```

- **menus**：当前语言下树形菜单，与现有 `MenuService.getFromCache` 返回结构一致（含 `children`）。
- **productCategories**：当前语言的产品分类列表（平表），与 `ProductService.listCategories(langId)` 一致。
- **configByKey**：按 key 的配置，例如 `{ logo1: Config | null, logo2: Config | null }`，便于首页或其它页按需取 logo 等；若后续有更多配置 key，在此扩展即可。

序列化：整体 JSON 存入 Redis，由现有 `RedisService.get/set` 处理。

## WebsiteLayoutService 接口与依赖

### 接口

- `getLayoutData(langId: number, options?: { configKeys?: string[] }): Promise<LayoutCachePayload>`
  - **langId**：语言 ID，用于菜单、分类、配置的按语言查询。
  - **options.configKeys**：需要放入 `configByKey` 的配置 key 列表，默认 `['logo1', 'logo2']`（与当前首页逻辑一致）。
  - 返回：`{ menus, productCategories, configByKey }`；若 `langId` 无效或无需缓存，可约定返回空结构或仍从 DB 组一份不写缓存（按你们策略定）。

### 依赖

- **RedisService**：读/写 Redis，写时传入 `ttlSeconds: 300`。
- **MenuService**：仅用其**读 DB** 的能力（如 `findTree(langId)`），不再用 `getFromCache`，避免两套 TTL 混用；聚合服务内自己实现「先 Redis 后 DB」。
- **ProductService**：仅用其 `listCategories(langId)`（当前直查 DB），在聚合内「先 Redis 后 DB」。
- **ConfigCustomService**：仅用其按 key 查单条的能力（如 `getByKey(langId, keyName)`），在聚合内按 `configKeys` 查并写入 `configByKey`。

即：聚合服务内部先查 `pengcheng:layout:{langId}`；未命中则并行调上述三个数据源组 `LayoutCachePayload`，写入 Redis（TTL=300）并返回。

### 常量

- TTL：300 秒（5 分钟），可提为配置项如 `redis.layoutTtlSeconds`，默认 300。
- Key 生成：在 `RedisService` 的 `CACHE_KEYS` 中增加 `LAYOUT: (langId: number) => \`${CACHE_KEY_PREFIX}layout:${langId}\``，供本服务与清理逻辑使用。

## 与现有缓存的配合

- **Menu**：现有 `MenuService.getFromCache` 仍可用于后台或其它非「前台页面公共数据」场景，TTL 保持 7 天。前台页面**只**通过 `WebsiteLayoutService.getLayoutData` 取菜单，不再直接调 `MenuService.getFromCache`。
- **Config**：同理，现有按 key 的 config 缓存可保留；前台页面只从 `getLayoutData` 的 `configByKey` 取。
- **ProductCategory**：当前无 Redis 缓存，聚合服务内实现「读 Redis → 未命中则 DB 并写 Redis（仅 layout key）」即可；若将来为 ProductCategory 单独做 7 天缓存，可再在 ProductService 增加，与 layout 的 5 分钟 key 互不冲突。
- **清理**：后台在菜单/产品分类/配置的增删改时，除现有 `delPattern('pengcheng:menu:*')` 等外，增加 `delPattern('pengcheng:layout:*')`，使前台 5 分钟内看到最新数据。

## 前台路由如何使用

- 当前：`WebsiteController` 的 `getHomeViewContext` 内用 `Promise.all` 调 `productService.listCategories`、`menuService.getFromCache`、`configService.getFromCache`。
- 改为：`getHomeViewContext` 在得到 `langId` 后，调用一次 `websiteLayoutService.getLayoutData(langId, { configKeys: [isDomestic ? 'logo2' : 'logo1'] })`（或统一传 `['logo1','logo2']` 再在视图里按 isDomestic 取），用返回的 `menus`、`productCategories`、`configByKey` 继续做 `buildCategoryTree`、`buildMenuNav`、`getLogoUrlFromConfig`，其它逻辑不变。
- 未来：产品列表、解决方案、新闻等页面，只要需要公共头/导航，同样在解析出 `langId` 后调用 `getLayoutData(langId)`，把结果合并进该页的 view context（例如 `navItems`、`logoUrl` 等），模板即可复用同一套头部/导航数据。

## 失效策略

- **TTL**：5 分钟（300 秒），仅对 `pengcheng:layout:*` 生效。
- **主动清理**：在以下场景调用 `RedisService.delPattern('pengcheng:layout:*')`（或使用 `CACHE_KEYS.LAYOUT` 的 pattern）：
  - 菜单的增删改（与现有 menu 缓存清理一起）；
  - 产品分类的增删改；
  - 配置的增删改（与现有 config 缓存清理一起）；
  - 后台「清除 Redis 缓存」入口（若有）中一并清理 layout。
- 不要求改现有 7 天 TTL 的 key；layout 独立 key、独立 TTL、独立清理即可。

## 扩展方式

- 增加**新的公共数据**（如友情链接、底部配置）：在 `LayoutCachePayload` 中增加字段，在 `getLayoutData` 内未命中缓存时多查一个数据源，写入同一 key；`configKeys` 已支持多 key，配置类可直接加 key。
- 增加**新页面**：该页控制器解析 `langId` 后调用 `getLayoutData(langId)`，把返回的 `menus`、`productCategories`、`configByKey` 转成该页需要的 `navItems`、`logoUrl` 等注入 view，无需再各自访问 Redis/DB。

## 小结

| 项目       | 说明 |
|------------|------|
| 聚合服务   | WebsiteLayoutService.getLayoutData(langId, options?) |
| Redis key  | pengcheng:layout:{langId}，TTL 300 秒 |
| 数据来源   | MenuService.findTree、ProductService.listCategories、ConfigCustomService.getByKey |
| 前台使用   | 所有需公共头/导航的页面只调 getLayoutData，结果进 view context |
| 失效       | TTL 5 分钟 + 后台菜单/分类/配置变更时 delPattern('pengcheng:layout:*') |
