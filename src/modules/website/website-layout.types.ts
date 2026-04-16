import type { Menu } from '../../entities/menu.entity';
import type { ProductCategory } from '../../entities/product-category.entity';
import type { Product } from '../../entities/product.entity';
import type { Config } from '../../entities/config.entity';

/** 树形菜单节点（含 children） */
export type MenuTreeItem = Menu & { children?: MenuTreeItem[] };

/** 前台页面公共数据聚合缓存结构 */
export interface LayoutCachePayload {
  menus: MenuTreeItem[];
  productCategories: ProductCategory[];
  products?: Product[];
  configByKey: Record<string, Config | null>;
}

/** getLayoutData 可选参数 */
export interface GetLayoutDataOptions {
  /** 需要放入 configByKey 的配置 key 列表，默认 ['logo1', 'logo2'] */
  configKeys?: string[];
  /** 是否包含产品数据（用于菜单树挂载产品），默认 true */
  includeProducts?: boolean;
}
