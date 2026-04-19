import {
  Controller,
  Get,
  NotFoundException,
  Param,
  Req,
  Res,
} from '@nestjs/common';
import type { FastifyReply, FastifyRequest } from 'fastify';
import type { Product } from '../../entities/product.entity';
import type { ProductCategory } from '../../entities/product-category.entity';
import { LangService } from '../../i18n/lang.service';
import { ProductService } from '../product/product.service';
import { WebsiteLayoutService } from './website-layout.service';
import {
  BaseWebsiteController,
  LOCALE_KEY,
  type WebsitePageContext,
} from './base-website.controller';
import type { LayoutCachePayload } from './website-layout.types';
import type { Config } from '../../entities/config.entity';
import { buildProductParamsRenderBlocks } from './product-params-json.util';
import { getResourceNotFoundCopy } from '../../common/utils/website-not-found-messages';

/** 仅支持单个 categoryId */
function parseCategoryIdsFromQuery(req: FastifyRequest): number[] {
  const q = req.query as Record<string, unknown> | undefined;
  const raw = q?.categoryId;
  if (raw == null || raw === '') return [];
  // 只取第一个有效的 categoryId
  const firstValue = Array.isArray(raw) ? raw[0] : raw;
  const n = Number.parseInt(String(firstValue).trim(), 10);
  return Number.isFinite(n) ? [n] : [];
}

function parsePageFromQuery(req: FastifyRequest): number {
  const q = req.query as Record<string, unknown> | undefined;
  const raw = q?.page;
  if (raw == null || raw === '') return 1;
  const s = String(Array.isArray(raw) ? raw[0] : raw).trim();
  const n = Number.parseInt(s, 10);
  return Number.isFinite(n) && n >= 1 ? n : 1;
}

const LAYOUT_CONFIG_KEYS = [
  'logo',
  'website-title',
  'website-description',
  'website-keywords',
  'footer-aboutus',
  'footer-phone',
  'footer-beian',
  'followus',
  'contact-us',
  /** 产品卡片/详情「获取报价」文案（type 1，content.content） */
  'get-a-quote',
  /** 产品列表卡片 Tab 文案（is_array type 1，三项 content 依次为 Images/Description/Specifications） */
  'product-list-card-text',
  /** 搜索页文案（后台「搜索页文字」，key_name `seach-page-texts`） */
  'seach-page-texts',
  /** 面包屑导航文字 */
  'breadcrumb-text',
  /** 产品列表页侧边栏文字 */
  'product-texts',
  /** 案例页和解决方案页-产品关联文字 */
  'product-texts-relations',
  /** 联系表单标签 */
  'contact-us-labels',
  /** 提交按钮文案 */
  'submit',
  /** 联系表单成功提示 */
  'contact-us-success',
  /** 应用案例详情页查看详情按钮文字：取自表字段 title */
  'application-text',
];

@Controller()
export class ProductsController extends BaseWebsiteController {
  /** 产品列表每页条数（与分页 partial 一致） */
  private static readonly PRODUCTS_PAGE_SIZE = 12;

  constructor(
    langService: LangService,
    websiteLayoutService: WebsiteLayoutService,
    private readonly productService: ProductService,
  ) {
    super(langService, websiteLayoutService);
  }

  /**
   * 从 Redis 聚合缓存获取菜单、产品分类、配置（由 WebsiteLayoutService 实现）。
   */
  async getLayoutData(
    langId: number,
    options?: { configKeys?: string[]; includeProducts?: boolean },
  ): Promise<LayoutCachePayload> {
    return this.websiteLayoutService.getLayoutData(langId, {
      ...options,
      includeProducts: true, // 产品页需要产品数据
    });
  }

  /**
   * 满足基类抽象方法；产品列表/详情页的页面标题与 meta 不读全站 website-* 配置，
   * 仅使用 product_category / product 表的 meta_title、meta_keywords、meta_description。
   */
  getWebsiteTitle(
    _layoutData: LayoutCachePayload,
    isDomestic: boolean,
  ): string {
    return isDomestic ? '产品' : 'Products';
  }

  getWebsiteDescription(
    _layoutData: LayoutCachePayload,
    _isDomestic: boolean,
  ): string | null {
    return null;
  }

  getWebsiteKeywords(
    _layoutData: LayoutCachePayload,
    _isDomestic: boolean,
  ): string | null {
    return null;
  }

  /** 配置 `get-a-quote`：与 readmore / learn-more 相同取 title 字段链上的 content */
  private pickGetAQuoteLabel(layoutData: LayoutCachePayload): string {
    const cfg = layoutData.configByKey['get-a-quote'] ?? null;
    return (
      this.getTextFromConfig(cfg, 'title')?.trim() ||
      this.getTextFromConfig(cfg, 'description')?.trim() ||
      'Get a Quote'
    );
  }

  /** 配置 `product-list-card-text`：数组三项的 `content` 为 Tab 文案；`data-tab` 仍为 images/description/specifications（脚本用） */
  private pickProductListCardTabs(layoutData: LayoutCachePayload): {
    images: string;
    description: string;
    specifications: string;
  } {
    const fb = {
      images: 'Images',
      description: 'Description',
      specifications: 'Specifications',
    };
    const cfg = layoutData.configByKey['product-list-card-text'] ?? null;
    if (!cfg?.content || !Array.isArray(cfg.content)) return fb;
    const rows = cfg.content as Record<string, unknown>[];
    const pick = (i: number, def: string) => {
      const row = rows[i];
      if (!row || typeof row !== 'object') return def;
      const c = row.content;
      const s = typeof c === 'string' ? c.trim() : '';
      return s || def;
    };
    return {
      images: pick(0, fb.images),
      description: pick(1, fb.description),
      specifications: pick(2, fb.specifications),
    };
  }

  /** 配置 `application-text`：取表字段 title 作为查看详情按钮文字 */
  private pickApplicationTextLabel(
    layoutData: LayoutCachePayload,
    isZh: boolean,
  ): string {
    const cfg = layoutData.configByKey['application-text'] ?? null;
    if (!cfg) return '';
    const tableTitle = typeof cfg.title === 'string' ? cfg.title.trim() : '';
    return tableTitle;
  }

  /** 分类表上的 Banner 地址 */
  private pickCategoryBannerUrl(cat: ProductCategory): string | null {
    const s = cat.bannerUrl?.trim() ?? '';
    return s || null;
  }

  /**
   * 列表页 Banner：按 URL `?categoryId=` 与侧栏一致，匹配当前语言下分类行 `id` 或业务 `category_id`，
   * 仅用该分类自身的 `bannerUrl`；无参数则 null（占位）。
   */
  private resolveProductListBannerUrl(
    categories: ProductCategory[],
    langId: number,
    queryCategoryId: number | null,
  ): string | null {
    if (queryCategoryId == null) return null;
    const matches = categories.filter(
      (c) =>
        c.langId === langId &&
        (c.id === queryCategoryId || c.categoryId === queryCategoryId),
    );
    matches.sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0) || a.id - b.id);
    for (const c of matches) {
      const url = this.pickCategoryBannerUrl(c);
      if (url) return url;
    }
    return null;
  }

  /** 与 Banner 一致：当前筛选对应的分类行（用于列表页 SEO） */
  private resolveProductListCategoryRow(
    categories: ProductCategory[],
    langId: number,
    queryCategoryId: number | null,
  ): ProductCategory | null {
    if (queryCategoryId == null) return null;
    const matches = categories.filter(
      (c) =>
        c.langId === langId &&
        (c.id === queryCategoryId || c.categoryId === queryCategoryId),
    );
    if (!matches.length) return null;
    matches.sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0) || a.id - b.id);
    return matches[0];
  }

  /**
   * 获取产品列表页面的视图上下文
   */
  async getProductsViewContext(
    pathLocale: string,
    categoryFilterIds: number[] = [],
    page: number = 1,
  ): Promise<
    WebsitePageContext & {
      viewName: string;
      categoryTree: any[];
      products: any[];
      bannerImageUrl: string | null;
      pagination: Record<string, unknown> | null;
      breadcrumbTexts: { home: string; products: string; solutions: string };
      productTexts: { allProducts: string };
    }
  > {
    const lang = await this.langService.findByCodeForRoute(pathLocale || 'en');
    if (!lang) {
      /** `:locale/products` 会匹配任意首段（如 `/contact/products`）；非配置语言返回 404 */
      throw new NotFoundException();
    }
    const langId = lang.id;
    const locale =
      lang.code === 'cn' ? 'cn' : lang.code === 'en' ? 'en' : lang.code;
    const isDomestic = lang.code === 'cn';
    const basePath = lang.code === 'en' ? '' : `/${lang.code}`;
    const codes = await this.langService
      .findAll()
      .then((langs) => langs.map((l) => l.code));
    const effectivePathLocale =
      pathLocale || (lang.code === 'en' ? '' : lang.code);

    const layoutData = await this.getLayoutData(langId || 0, {
      configKeys: LAYOUT_CONFIG_KEYS,
    });
    const listCategory =
      categoryFilterIds.length === 1
        ? this.resolveProductListCategoryRow(
            layoutData.productCategories || [],
            langId || 0,
            categoryFilterIds[0],
          )
        : null;
    let title: string;
    let description: string | null;
    let keywords: string | null;
    if (listCategory) {
      title = listCategory.metaTitle?.trim() || listCategory.name;
      description = listCategory.metaDescription?.trim() || null;
      keywords = listCategory.metaKeywords?.trim() || null;
    } else {
      title = this.getWebsiteTitle(layoutData, isDomestic);
      description = this.getWebsiteDescription(layoutData, isDomestic);
      keywords = this.getWebsiteKeywords(layoutData, isDomestic);
    }
    const logoUrl = this.getLogoUrlFromConfig(
      layoutData.configByKey['logo'] ?? null,
    );
    const englishLogoUrl = await this.getEnglishLogoUrlFromConfig(
      layoutData.configByKey['logo'] ?? null,
      langId,
    );
    const navItems = this.buildNavItemsFromLayout(
      layoutData,
      basePath,
      isDomestic,
    );

    const productsData = layoutData.products || [];
    const categoryTree = this.annotateProductCategoryTreeForFilters(
      this.buildProductNavTreeFromLayout(layoutData, basePath),
      categoryFilterIds,
      basePath,
    );

    let listSource = productsData;
    if (categoryFilterIds.length > 0) {
      const cats = layoutData.productCategories || [];
      if (cats.length > 0) {
        const allowedRowIds = this.collectCategoryRowIdsUnion(
          cats,
          categoryFilterIds,
        );
        listSource = productsData.filter(
          (p) => p.categoryId != null && allowedRowIds.has(p.categoryId),
        );
      } else {
        listSource = productsData.filter(
          (p) =>
            p.categoryId != null && categoryFilterIds.includes(p.categoryId),
        );
      }
    }

    const pageSize = ProductsController.PRODUCTS_PAGE_SIZE;
    const totalItems = listSource.length;
    const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
    const currentPage = Math.min(Math.max(1, page), totalPages);
    const sliceStart = (currentPage - 1) * pageSize;
    const products = this.buildProductsList(
      listSource.slice(sliceStart, sliceStart + pageSize),
      basePath,
    );
    const pagination = this.buildProductsPagination(
      basePath,
      categoryFilterIds,
      currentPage,
      totalItems,
      pageSize,
      isDomestic,
    );

    // 构建公共的头部和尾部数据
    const commonData = await this.buildCommonPageData(
      langId || 0,
      basePath,
      layoutData,
    );

    const bannerImageUrl = this.resolveProductListBannerUrl(
      layoutData.productCategories || [],
      langId || 0,
      categoryFilterIds.length ? categoryFilterIds[0] : null,
    );

    const getAQuoteLabel = this.pickGetAQuoteLabel(layoutData);
    const productListCardTabs = this.pickProductListCardTabs(layoutData);
    const productsBannerTitle =
      (listCategory?.name && String(listCategory.name).trim()) ||
      (isDomestic ? '产品' : 'Products');

    // 面包屑导航文字
    const breadcrumbCfg = layoutData.configByKey['breadcrumb-text'] ?? null;
    const breadcrumbTexts = this.parseBreadcrumbTextConfig(breadcrumbCfg);

    // 产品列表页文字
    const productTextsCfg = layoutData.configByKey['product-texts'] ?? null;
    const productTexts = this.parseProductTextsConfig(productTextsCfg);

    return {
      locale,
      langId,
      isDomestic,
      basePath,
      localeCodes: codes,
      pathLocale: effectivePathLocale,
      title,
      description,
      keywords,
      logoUrl,
      englishLogoUrl,
      navItems,
      categoryTree,
      products,
      bannerImageUrl,
      pagination,
      getAQuoteLabel,
      productListCardTabs,
      productsBannerTitle,
      breadcrumbTexts,
      productTexts,
      viewName: 'website/products',
      pageViewPageType: 'products',
      ...commonData,
    };
  }

  /**
   * 前台产品列表分页数据（链接为 GET，保留当前分类多选）。
   */
  private buildProductsPagination(
    basePath: string,
    categoryIds: number[],
    currentPage: number,
    totalItems: number,
    pageSize: number,
    isDomestic: boolean,
  ): Record<string, unknown> | null {
    const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
    const cp = Math.min(Math.max(1, currentPage), totalPages);
    if (totalItems === 0 || totalPages <= 1) return null;

    const makeUrl = (p: number) =>
      this.buildProductsListQueryUrl(basePath, categoryIds, p);
    const base = this.buildWebsiteListPagination({
      currentPage: cp,
      totalPages,
      totalItems,
      makeUrl,
      isDomestic,
    });
    if (!base) return null;
    return { ...base, pageSize };
  }

  /**
   * 将实体 coreParams（字符串数组）转为卡片展示行。
   * 支持「名称：值」「Name: value」；无分隔符时整段作为 value。
   */
  private mapCoreParamsForProductCard(
    core: string[] | null | undefined,
  ): { label: string; value: string }[] {
    if (!core?.length) return [];
    return core.map((line) => {
      const s = String(line).trim();
      const m = s.match(/^(.+?)[:：]\s*(.+)$/);
      if (m) {
        return { label: m[1].trim(), value: m[2].trim() };
      }
      return { label: '', value: s };
    });
  }

  /**
   * 构建产品列表数据（仅真实数据，无 mock）
   */
  private buildProductsList(productsData: Product[], basePath: string) {
    return productsData.map((p: Product) => ({
      id: p.productId ?? p.id,
      title: p.name,
      model: p.model ?? null,
      url: `${basePath}/products/${p.productId ?? p.id}`,
      picUrl: p.thumbUrl || '/images/products/placeholder.jpg',
      coreParams: this.mapCoreParamsForProductCard(p.coreParams),
    }));
  }

  private certificationLabel(id: number, isDomestic: boolean): string {
    const map: Record<number, { en: string; zh: string }> = {
      1: { en: 'UN38.3', zh: 'UN38.3 认证' },
      2: { en: 'UN38.4', zh: 'UN38.4 认证' },
    };
    const row = map[id];
    if (!row) return String(id);
    return isDomestic ? row.zh : row.en;
  }

  /**
   * 产品详情页（业务 product_id + 当前语言）
   */
  async getProductDetailViewContext(
    pathLocale: string,
    businessProductId: number,
    req?: any,
  ): Promise<Record<string, unknown>> {
    const lang = await this.langService.findByCodeForRoute(pathLocale || 'en');
    if (!lang) {
      throw new NotFoundException();
    }
    const langId = lang.id;
    const locale =
      lang.code === 'cn' ? 'cn' : lang.code === 'en' ? 'en' : lang.code;
    const isDomestic = lang.code === 'cn';
    const basePath = lang.code === 'en' ? '' : `/${lang.code}`;
    const codes = await this.langService
      .findAll()
      .then((langs) => langs.map((l) => l.code));
    const effectivePathLocale =
      pathLocale || (lang.code === 'en' ? '' : lang.code);

    const layoutData = await this.getLayoutData(langId || 0, {
      configKeys: LAYOUT_CONFIG_KEYS,
    });
    console.log('[DEBUG products] application-text config:', JSON.stringify(layoutData.configByKey['application-text']));
    console.log('[DEBUG products] viewDetails:', this.pickApplicationTextLabel(layoutData, isDomestic));
    const logoUrl = this.getLogoUrlFromConfig(
      layoutData.configByKey['logo'] ?? null,
    );
    const englishLogoUrl = await this.getEnglishLogoUrlFromConfig(
      layoutData.configByKey['logo'] ?? null,
      langId,
    );
    const navItems = this.buildNavItemsFromLayout(
      layoutData,
      basePath,
      isDomestic,
    );
    const commonData = await this.buildCommonPageData(
      langId || 0,
      basePath,
      layoutData,
    );
    const getAQuoteLabel = this.pickGetAQuoteLabel(layoutData);

    // 面包屑导航文字
    const breadcrumbCfg = layoutData.configByKey['breadcrumb-text'] ?? null;
    const breadcrumbTexts = this.parseBreadcrumbTextConfig(breadcrumbCfg);

    const product = await this.productService.findByProductIdAndLang(
      businessProductId,
      langId,
    );
    if (!product) {
      const categoryTree404 = this.annotateProductCategoryTreeForFilters(
        this.buildProductNavTreeFromLayout(layoutData, basePath),
        [],
        basePath,
      );
      const rf = getResourceNotFoundCopy(lang.code, 'product');
      return {
        notFound: true,
        viewName: 'website/not-found',
        locale,
        langId,
        isDomestic,
        basePath,
        localeCodes: codes,
        pathLocale: effectivePathLocale,
        title: rf.title,
        description: null,
        keywords: null,
        logoUrl,
        navItems,
        categoryTree: categoryTree404,
        listUrl: `${basePath}/products`,
        notFoundHint: rf.hint,
        notFoundBackLabel: rf.back,
        notFoundBodyClass: 'g-products-page g-product-detail-page',
        notFoundStylesheets: [
          '/css/global/products-global.css',
          '/css/global/product-detail-global.css',
        ],
        bannerImageUrl: null,
        pageViewPageType: 'product-not-found',
        getAQuoteLabel,
        breadcrumbTexts,
        ...commonData,
      };
    }

    const categories = layoutData.productCategories || [];
    const catRow =
      product.categoryId != null
        ? categories.find(
            (c) => c.id === product.categoryId && c.langId === langId,
          )
        : undefined;
    const categoryName = catRow?.name ?? null;
    const categoryQueryId =
      catRow != null ? (catRow.categoryId ?? catRow.id) : null;
    const productsListUrl = this.buildProductsListQueryUrl(
      basePath,
      categoryQueryId != null ? [categoryQueryId] : [],
      1,
    );

    const categoryTree = this.annotateProductCategoryTreeForFilters(
      this.buildProductNavTreeFromLayout(layoutData, basePath),
      categoryQueryId != null ? [categoryQueryId] : [],
      basePath,
    );

    const pics =
      Array.isArray(product.mainPics) && product.mainPics.length > 0
        ? product.mainPics.filter(Boolean)
        : product.thumbUrl
          ? [product.thumbUrl]
          : [];

    const title =
      product.metaTitle?.trim() ||
      (product.detailTitle && product.detailTitle.trim()) ||
      product.name;
    const description = product.metaDescription?.trim() || null;
    const keywords = product.metaKeywords?.trim() || null;

    const certs = product.certifications || [];

    const featureTabPanels = this.buildProductFeatureTabPanels(
      product.features,
      product.summary,
    );
    const productParamsBlocks = buildProductParamsRenderBlocks(
      product.paramsJson,
    );

    // 处理关联产品
    const relatedProductIds = (product.relatedProductIds ?? [])
      .map((id: number) => parseInt(String(id), 10))
      .filter((n: number) => Number.isFinite(n));

    const allProducts = layoutData.products || [];
    const relatedProducts = relatedProductIds
      .map((id) => allProducts.find((p) => p.id === id || p.productId === id))
      .filter(Boolean)
      .map((p: Product) => ({
        id: p.productId ?? p.id,
        title: p.name,
        model: p.model ?? null,
        url: `${basePath}/products/${p.productId ?? p.id}`,
        picUrl: p.thumbUrl || '/images/products/placeholder.jpg',
        coreParams: this.mapCoreParamsForProductCard(p.coreParams),
      }));

    const hasRelatedProducts = relatedProducts.length > 0;

    // 从配置中获取关联产品文字
    const productRelationsCfg =
      layoutData.configByKey['product-texts-relations'] ?? null;
    let relatedProductsTitle = isDomestic ? '相关产品' : 'Related Products';
    let relatedProductsDescription = '';

    if (productRelationsCfg?.content) {
      try {
        const content =
          typeof productRelationsCfg.content === 'string'
            ? JSON.parse(productRelationsCfg.content)
            : productRelationsCfg.content;

        // 处理数组形式的配置
        if (content && Array.isArray(content)) {
          // 第一个元素是 Related Products
          const productItem = content[0];
          if (productItem && typeof productItem === 'object') {
            if (productItem.title) {
              relatedProductsTitle = String(productItem.title).trim();
            }
            if (productItem.description) {
              relatedProductsDescription = String(
                productItem.description,
              ).trim();
            }
          }
        } else if (content && typeof content === 'object') {
          // 兼容旧的对象形式配置
          if (content.title) {
            relatedProductsTitle = String(content.title).trim();
          }
          if (content.description) {
            relatedProductsDescription = String(content.description).trim();
          }
        }
      } catch (e) {
        // 解析失败时使用默认值
      }
    }

    // 关联产品配置
    const relatedProductsConfig = {
      title: relatedProductsTitle,
      description: relatedProductsDescription,
      viewDetails: this.pickApplicationTextLabel(layoutData, isDomestic),
    };

    // 联系表单配置
    const isZhContact = lang.code === 'cn';
    const contactUsSuccessText = this.getContactUsSuccessText(
      layoutData,
      lang.code,
    );
    const contactToastInvalid = isZhContact
      ? '请填写有效的姓名与邮箱。'
      : 'Please enter a valid name and email address.';
    const contactToastNetwork = isZhContact
      ? '网络异常，请稍后重试。'
      : 'Network error. Please try again.';
    const contactToastForbidden = isZhContact
      ? '页面已过期，请刷新后重新提交。'
      : 'This page has expired. Please refresh and try again.';
    const contactToastErrTitle = isZhContact ? '提示' : 'Notice';

    // CSRF token
    const contactFormCsrfToken = req.csrfToken?.() || '';

    return {
      notFound: false,
      viewName: 'website/product-detail',
      locale,
      langId,
      isDomestic,
      basePath,
      localeCodes: codes,
      pathLocale: effectivePathLocale,
      title,
      description,
      keywords,
      logoUrl,
      englishLogoUrl,
      navItems,
      categoryTree,
      productsListUrl,
      categoryName,
      categoryQueryId,
      product,
      mainPics: pics,
      coreParamsRows: this.mapCoreParamsForProductCard(product.coreParams),
      certifications: certs,
      featureTabPanels,
      productParamsBlocks,
      bannerImageUrl: product.bannerUrl?.trim() || null,
      relatedProducts,
      hasRelatedProducts,
      relatedProductsConfig,
      contactUsSuccessText,
      contactToastInvalid,
      contactToastNetwork,
      contactToastForbidden,
      contactToastErrTitle,
      contactFormCsrfToken,
      ...commonData,
      /** 详情页 Banner 不显示「产品/Products」标题（名称在正文区） */
      hideProductsBannerTitle: true,
      pageViewPageType: 'product-detail',
      getAQuoteLabel,
      breadcrumbTexts,
    };
  }

  /**
   * 解析面包屑导航文字配置
   * content: [{content: 'Home'}, {content: 'Products'}, {content: 'Solutions'}]
   */
  private parseBreadcrumbTextConfig(cfg: Config | null): {
    home: string;
    products: string;
    solutions: string;
  } {
    const defaultResult = {
      home: '',
      products: '',
      solutions: '',
    };
    if (!cfg) return defaultResult;
    const arr = cfg.content && Array.isArray(cfg.content) ? cfg.content : null;
    const homeItem = arr && arr[0] ? (arr[0] as Record<string, unknown>) : null;
    const productsItem =
      arr && arr[1] ? (arr[1] as Record<string, unknown>) : null;
    const solutionsItem =
      arr && arr[2] ? (arr[2] as Record<string, unknown>) : null;
    return {
      home:
        homeItem && typeof homeItem.content === 'string'
          ? homeItem.content.trim()
          : '',
      products:
        productsItem && typeof productsItem.content === 'string'
          ? productsItem.content.trim()
          : '',
      solutions:
        solutionsItem && typeof solutionsItem.content === 'string'
          ? solutionsItem.content.trim()
          : '',
    };
  }

  /**
   * 解析产品列表页文字配置
   * content: [{content: 'All Products'}]
   */
  private parseProductTextsConfig(cfg: Config | null): {
    allProducts: string;
  } {
    const defaultResult = {
      allProducts: '',
    };
    if (!cfg) return defaultResult;
    const arr = cfg.content && Array.isArray(cfg.content) ? cfg.content : null;
    const firstItem =
      arr && arr[0] ? (arr[0] as Record<string, unknown>) : null;
    return {
      allProducts:
        firstItem && typeof firstItem.content === 'string'
          ? firstItem.content.trim()
          : '',
    };
  }

  /**
   * 详情页「特点 Tab + 要点列表」：`features` 为对象格式，key 为 tab 标题，value 为要点数组。
   */
  private buildProductFeatureTabPanels(
    features: any | null | undefined,
    summary: string[] | null | undefined,
  ): { label: string; bullets: string[] }[] {
    // 处理对象格式的 features
    if (features && typeof features === 'object' && !Array.isArray(features)) {
      return Object.entries(features)
        .map(([label, bullets]) => ({
          label: String(label ?? '').trim(),
          bullets: Array.isArray(bullets)
            ? bullets.map((b) => String(b ?? '').trim()).filter(Boolean)
            : [],
        }))
        .filter((item) => item.label && item.bullets.length);
    }
    // 兼容旧的数组格式
    const fs = (features ?? [])
      .map((s) => String(s ?? '').trim())
      .filter(Boolean);
    const ss = (summary ?? [])
      .map((s) => String(s ?? '').trim())
      .filter(Boolean);
    if (!fs.length) return [];
    if (fs.length === ss.length && ss.length > 0) {
      return fs.map((label, i) => ({ label, bullets: [ss[i]] }));
    }
    if (ss.length > 0) {
      return fs.map((label) => ({ label, bullets: ss.slice() }));
    }
    return fs.map((label) => ({ label, bullets: [label] }));
  }

  private renderProductDetailPage(
    reply: FastifyReply,
    ctx: Record<string, unknown>,
  ) {
    const is404 = ctx.notFound === true;
    const viewName = String(ctx.viewName);
    const payload = { ...ctx };
    payload.contactFormCsrfToken = '';
    delete payload.notFound;
    delete payload.viewName;
    if (is404) {
      return (reply as any).code(404).view(viewName, payload);
    }
    return (reply as any).view(viewName, payload);
  }

  @Get('products')
  async products(@Req() req: FastifyRequest, @Res() reply: FastifyReply) {
    const categoryFilterIds = parseCategoryIdsFromQuery(req);
    const page = parsePageFromQuery(req);
    const ctx = await this.getProductsViewContext('', categoryFilterIds, page);
    (req as any)[LOCALE_KEY] = ctx.locale;
    return (reply as any).view(ctx.viewName, {
      locale: ctx.locale,
      title: ctx.title,
      description: ctx.description,
      keywords: ctx.keywords,
      localeCodes: ctx.localeCodes,
      pathLocale: ctx.pathLocale,
      basePath: ctx.basePath,
      langId: ctx.langId,
      isDomestic: ctx.isDomestic,
      logoUrl: ctx.logoUrl,
      englishLogoUrl: ctx.englishLogoUrl,
      navItems: ctx.navItems,
      categoryTree: ctx.categoryTree,
      products: ctx.products,
      pagination: ctx.pagination,
      footerAboutUs: ctx.footerAboutUs,
      footerPhone: ctx.footerPhone,
      footerBeian: ctx.footerBeian,
      followUs: ctx.followUs,
      contactUs: ctx.contactUs,
      bannerImageUrl: ctx.bannerImageUrl,
      pageViewPageType: ctx.pageViewPageType,
      getAQuoteLabel: ctx.getAQuoteLabel,
      productListCardTabs: ctx.productListCardTabs,
      productsBannerTitle: ctx.productsBannerTitle,
      fixedFourIcons: ctx.fixedFourIcons,
      loginRegister: ctx.loginRegister,
      cartTexts: ctx.cartTexts,
      inquiryPriceFormTexts: ctx.inquiryPriceFormTexts,
      navLangs: ctx.navLangs,
      breadcrumbTexts: ctx.breadcrumbTexts,
      productTexts: ctx.productTexts,
      contactUsFormLabels: ctx.contactUsFormLabels,
      contactUsSubmitLabel: ctx.contactUsSubmitLabel,
    });
  }

  @Get(':locale/products')
  async productsWithLocale(
    @Param('locale') localeParam: string,
    @Req() req: FastifyRequest,
    @Res() reply: FastifyReply,
  ) {
    const pathLocale = (localeParam || '').toLowerCase();
    const categoryFilterIds = parseCategoryIdsFromQuery(req);
    const page = parsePageFromQuery(req);
    const ctx = await this.getProductsViewContext(
      pathLocale,
      categoryFilterIds,
      page,
    );
    (req as any)[LOCALE_KEY] = ctx.locale;
    return (reply as any).view(ctx.viewName, {
      locale: ctx.locale,
      title: ctx.title,
      description: ctx.description,
      keywords: ctx.keywords,
      localeCodes: ctx.localeCodes,
      pathLocale: ctx.pathLocale,
      basePath: ctx.basePath,
      langId: ctx.langId,
      isDomestic: ctx.isDomestic,
      logoUrl: ctx.logoUrl,
      englishLogoUrl: ctx.englishLogoUrl,
      navItems: ctx.navItems,
      categoryTree: ctx.categoryTree,
      products: ctx.products,
      pagination: ctx.pagination,
      footerAboutUs: ctx.footerAboutUs,
      footerPhone: ctx.footerPhone,
      footerBeian: ctx.footerBeian,
      followUs: ctx.followUs,
      contactUs: ctx.contactUs,
      bannerImageUrl: ctx.bannerImageUrl,
      pageViewPageType: ctx.pageViewPageType,
      getAQuoteLabel: ctx.getAQuoteLabel,
      productListCardTabs: ctx.productListCardTabs,
      productsBannerTitle: ctx.productsBannerTitle,
      fixedFourIcons: ctx.fixedFourIcons,
      loginRegister: ctx.loginRegister,
      cartTexts: ctx.cartTexts,
      inquiryPriceFormTexts: ctx.inquiryPriceFormTexts,
      navLangs: ctx.navLangs,
      breadcrumbTexts: ctx.breadcrumbTexts,
      productTexts: ctx.productTexts,
      contactUsFormLabels: ctx.contactUsFormLabels,
      contactUsSubmitLabel: ctx.contactUsSubmitLabel,
    });
  }

  @Get('products/:productId')
  async productDetail(
    @Param('productId') productIdParam: string,
    @Req() req: FastifyRequest,
    @Res() reply: FastifyReply,
  ) {
    const id = Number.parseInt(productIdParam, 10);
    if (!Number.isFinite(id) || id < 1) {
      return (reply as any).code(404).send('Not found');
    }
    const ctx = await this.getProductDetailViewContext('', id, req);
    (req as any)[LOCALE_KEY] = ctx.locale;
    return this.renderProductDetailPage(reply, ctx);
  }

  @Get(':locale/products/:productId')
  async productDetailLocale(
    @Param('locale') localeParam: string,
    @Param('productId') productIdParam: string,
    @Req() req: FastifyRequest,
    @Res() reply: FastifyReply,
  ) {
    const id = Number.parseInt(productIdParam, 10);
    if (!Number.isFinite(id) || id < 1) {
      return (reply as any).code(404).send('Not found');
    }
    const pathLocale = (localeParam || '').toLowerCase();
    const ctx = await this.getProductDetailViewContext(pathLocale, id, req);
    (req as any)[LOCALE_KEY] = ctx.locale;
    return this.renderProductDetailPage(reply, ctx);
  }
}
