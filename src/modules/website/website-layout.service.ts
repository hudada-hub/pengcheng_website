import { Injectable } from '@nestjs/common';
import { MenuService } from '../menu/menu.service';
import { ProductService } from '../product/product.service';
import { ConfigCustomService } from '../config-custom/config-custom.service';
import type {
  LayoutCachePayload,
  GetLayoutDataOptions,
  MenuTreeItem,
} from './website-layout.types';
import { Product } from 'src/entities/product.entity';
import { ProductCategory } from 'src/entities/product-category.entity';

const DEFAULT_CONFIG_KEYS = ['logo1', 'logo2'];

@Injectable()
export class WebsiteLayoutService {
  constructor(
    private readonly menuService: MenuService,
    private readonly productService: ProductService,
    private readonly configService: ConfigCustomService,
  ) {}

  /**
   * 获取前台页面公共数据：从 Redis 按语言 code 读取 menu:{code}、productCategory:{code}、product:{code}、config:{code}:{key}，未命中则各 Service 查 DB 并回写。
   */
  async getLayoutData(
    langId: number,
    options?: GetLayoutDataOptions,
  ): Promise<LayoutCachePayload> {
    const configKeys = [
      ...new Set([
        ...(options?.configKeys ?? DEFAULT_CONFIG_KEYS),
        'login-register',
        'fixed-four-icon',
        'cart-texts',
        'inquiry-price-form',
      ]),
    ];
    /** 默认 true：页脚/顶栏 mega 需把产品挂到分类树上，否则非产品页第二列为空 */
    const includeProducts = options?.includeProducts ?? true;

    const promises: Promise<any>[] = [
      this.menuService.getFromCache(langId) as Promise<MenuTreeItem[]>,
      this.productService.getCategoriesFromCache(langId),
      ...configKeys.map((k) => this.configService.getFromCache(langId, k)),
    ];

    // 如果需要产品数据，并行获取
    if (includeProducts) {
      promises.push(this.productService.getProductsFromCache(langId));
    }

    const results = await Promise.all(promises);
    const menus = results[0] as MenuTreeItem[];
    const productCategories = results[1] as ProductCategory[];
    const configResults = results.slice(2, 2 + configKeys.length);
    const products = includeProducts
      ? (results[results.length - 1] as Product[])
      : undefined;

    const configByKey: Record<string, unknown> = {};
    configKeys.forEach((k, i) => {
      configByKey[k] = configResults[i] ?? null;
    });

    return {
      menus,
      productCategories,
      products,
      configByKey: configByKey as LayoutCachePayload['configByKey'],
    };
  }
}
