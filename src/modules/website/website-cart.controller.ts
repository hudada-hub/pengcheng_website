import { Controller, Get, Query } from '@nestjs/common';
import { LangService } from '../../i18n/lang.service';
import { ProductService } from '../product/product.service';
import type { Product } from '../../entities/product.entity';

const PLACEHOLDER_THUMB = '/images/products/placeholder.jpg';

/** 默认条数；上限防止一次拉取过多 */
export const RECOMMEND_PRODUCTS_DEFAULT_LIMIT = 8;
export const RECOMMEND_PRODUCTS_MAX_LIMIT = 24;

/**
 * 同分类优先，不足或无 category 时用全站「热门」顺序（view_count 降序，再 product_id）补齐。
 * 去重按业务 productId。
 */
export function pickRecommendedProducts(
  products: Product[],
  categoryId: number | null,
  limit: number,
): Product[] {
  const cap = Math.min(Math.max(1, limit), RECOMMEND_PRODUCTS_MAX_LIMIT);
  const byHot = [...products].sort((a, b) => {
    const va = a.viewCount ?? 0;
    const vb = b.viewCount ?? 0;
    if (vb !== va) return vb - va;
    return (b.productId ?? b.id) - (a.productId ?? a.id);
  });
  const seen = new Set<number>();
  const out: Product[] = [];

  const pushUnique = (p: Product) => {
    if (out.length >= cap) return;
    const pid = p.productId ?? p.id;
    if (seen.has(pid)) return;
    seen.add(pid);
    out.push(p);
  };

  if (categoryId != null && categoryId > 0) {
    for (const p of byHot) {
      if (p.categoryId === categoryId) pushUnique(p);
    }
  }

  for (const p of byHot) {
    pushUnique(p);
  }

  return out;
}

export function mapProductToRecommendCard(p: Product) {
  return {
    productId: p.productId ?? p.id,
    title: (p.detailTitle && p.detailTitle.trim()) || p.name,
    thumbUrl: p.thumbUrl?.trim() || PLACEHOLDER_THUMB,
    categoryId: p.categoryId ?? null,
    coreParams: p.coreParams ?? null,
  };
}

function parseOptionalPositiveInt(raw: unknown): number | null {
  if (raw == null || raw === '') return null;
  const s = String(Array.isArray(raw) ? raw[0] : raw).trim();
  if (!s) return null;
  const n = Number.parseInt(s, 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function parseLimit(raw: unknown): number {
  const n = parseOptionalPositiveInt(raw);
  if (n == null) return RECOMMEND_PRODUCTS_DEFAULT_LIMIT;
  return Math.min(n, RECOMMEND_PRODUCTS_MAX_LIMIT);
}

@Controller('api/website')
export class WebsiteCartController {
  constructor(
    private readonly langService: LangService,
    private readonly productService: ProductService,
  ) {}

  @Get('recommend-products')
  async recommendProducts(
    @Query('categoryId') categoryIdRaw?: string,
    @Query('limit') limitRaw?: string,
    /** 与前台路径语言一致，如 en、cn、jp；不传则用站点默认语言 */
    @Query('locale') localeRaw?: string,
  ) {
    const categoryId = parseOptionalPositiveInt(categoryIdRaw);
    const limit = parseLimit(limitRaw);
    const langId = await this.resolveLangId((localeRaw ?? '').trim());

    const products = await this.productService.getProductsFromCache(langId);
    const picked = pickRecommendedProducts(products, categoryId, limit);
    return { items: picked.map(mapProductToRecommendCard) };
  }

  private async resolveLangId(localeSegment: string): Promise<number> {
    if (localeSegment) {
      const lang = await this.langService.findByCodeForRoute(localeSegment);
      if (lang) return lang.id;
    }
    const def = await this.langService.getDefault();
    if (def) return def.id;
    const en = await this.langService.findByCode('en');
    return en?.id ?? 1;
  }
}
