import type { FastifyReply, FastifyRequest } from 'fastify';
import { LangService } from '../../i18n/lang.service';
import { WebsiteLayoutService } from './website-layout.service';
import type { Menu } from '../../entities/menu.entity';
import type { ProductCategory } from '../../entities/product-category.entity';
import type { Product } from '../../entities/product.entity';
import type { Config } from '../../entities/config.entity';
import type { LayoutCachePayload } from './website-layout.types';
import { Logger } from '@nestjs/common';

export const LOCALE_KEY = 'locale';

/** 导航项，供模板渲染菜单/分类树 */
export type NavItem = {
  title: string;
  url: string;
  picUrl?: string | null;
  bannerUrl?: string | null;
  metaTitle?: string | null;
  metaKeywords?: string | null;
  metaDescription?: string | null;
  children?: NavItem[];
  /** 挂载在分类下的产品行（导航下拉用），侧栏渲染时跳过 */
  isProduct?: boolean;
  /** 与 `?categoryId=` 一致，用于侧栏高亮与筛选 */
  queryCategoryId?: number;
  /** 该分类节点（含子分类下）产品总数，侧栏展示 */
  productCount?: number;
  /** 当前列表筛选是否命中该分类 */
  active?: boolean;
  selected?: boolean;
  /** 含子分类时，是否展开（当前筛选在子级时为 true） */
  expanded?: boolean;
};

/** 前台页面公共上下文（locale、SEO、导航、logo 等），子类可扩展 */
export type WebsitePageContext = {
  locale: string;
  title: string;
  contactUs: Config | null;
  description: string | null;
  keywords: string | null;
  localeCodes: string[];
  pathLocale: string;
  basePath: string;
  langId: number | undefined;
  /** 海外 global 页脚统计上报用，与 `page_stats.page_type` 对齐 */
  pageViewPageType?: string;
  isDomestic: boolean;
  logoUrl: string | null;
  englishLogoUrl: string | null;
  navItems: NavItem[];
  viewName: string;
  carouselItems?: Array<{
    picUrl: string;
    title: string;
    description: string;
    url: string;
  }>;
  /** 首页轮播「了解更多」按钮文案，来自配置 key `learn-more`（按当前语言） */
  heroLearnMoreLabel?: string;
  /** 产品列表/详情「获取报价」按钮文案，配置 key `get-a-quote`（按当前语言） */
  getAQuoteLabel?: string;
  /** 产品列表卡片 Tab：Images / Description / Specifications，配置 key `product-list-card-text`（is_array，每项 content） */
  productListCardTabs?: {
    images: string;
    description: string;
    specifications: string;
  };
  /** 产品列表 Banner 标题：`?categoryId=` 仅选一项时为该分类名称，否则为「产品 / Products」 */
  productsBannerTitle?: string;
  advantageItems?: Array<{
    picUrl: string;
    title: string;
    description: string;
    url: string;
  }>;
  /** 业务领域区块主标题，来自 config `business-areas` 的 title */
  businessAreasTitle?: string;
  businessAreas?: Array<{
    key: string;
    label: string;
    data: {
      title: string;
      description: string;
      bgPicUrl: string;
      items: Array<{
        picUrl: string;
        title: string;
        content: string;
        url: string;
      }>;
    };
  }>;
  aboutUs?: {
    title: string;
    description: string;
    bgPicUrl: string;
    videoUrl: string;
    /** 首页 About 区块「阅读更多」链文案，配置 `readmore`（type 1 content.content） */
    readMoreLabel: string;
    stats: Array<{
      value: string;
      label: string;
    }>;
  };
  footerAboutUs?: {
    title: string;
    description: string;
    emailItems: Array<{
      label: string;
      email: string;
    }>;
  };
  footerPhone?: {
    label: string;
    phone: string;
  };
  footerBeian?: {
    content: string;
  };
  followUs?: {
    title: string;
    bgPicUrl: string;
    items: Array<{
      url: string;
      title: string;
      picUrl: string;
    }>;
  };
  customerLogos?: Array<{
    url: string;
    name: string;
    active: boolean;
  }>;
  customerLogosRow1?: Array<{
    url: string;
    name: string;
    active: boolean;
  }>;
  customerLogosRow2?: Array<{
    url: string;
    name: string;
    active: boolean;
  }>;
  /** 两行网格列优先顺序：[row1[0], row2[0], row1[1], row2[1], …] */
  customerLogosGrid?: Array<{
    url: string;
    name: string;
    active: boolean;
  }>;
  ourCustomersTitle?: string;
  aboutUsEnglishTitle?: string;
  ourCustomersEnglishTitle?: string;
  businessAreasEnglishTitle?: string;
  contactUsEnglishTitle?: string;
  newsEventsTitle?: string;
  newsEventsEnglishTitle?: string;
  newsList?: Array<{
    id: number;
    newsUrlId: number;
    title: string;
    thumbUrl: string | null;
    publishAt: Date | null;
    summary: string | null;
  }>;
  activities?: Array<{
    id: number;
    activityUrlId: number;
    title: string;
    location: string | null;
    eventDateStart: Date | null;
    eventDateEnd: Date | null;
    url: string | null;
  }>;
  /** 首页联系表单 label，来自配置 key `contact-us-labels` */
  contactUsFormLabels?: {
    fullName: string;
    email: string;
    nation: string;
    location: string;
    phone: string;
    question: string;
  };
  /** 首页联系表单提交按钮，来自配置 key `submit` */
  contactUsSubmitLabel?: string;
  /** 首页联系表单提交成功提示，来自配置 key `contact-us-success-text`（content.content） */
  contactUsSuccessText?: string;
  contactToastInvalid?: string;
  contactToastNetwork?: string;
  contactToastForbidden?: string;
  contactToastErrTitle?: string;
  /** 海外站右下角悬浮四键图标，config key `fixed-four-icon`（type 2 图片数组，pic1Url；顺序：询价、外链1、外链2、回顶） */
  fixedFourIcons?: {
    items: Array<{
      picUrl: string;
      url: string;
      title: string;
    }>;
  };
  /** 登录注册弹窗（config key `login-register`） */
  loginRegister?: {
    signInTitle: string;
    passwordPlaceholder: string;
    agreePrefix: string;
    userAgreementText: string;
    userAgreementUrl: string;
    noAccount: string;
    registerNow: string;
    emailPlaceholder: string;
    registerTitle: string;
    registerSubmit: string;
    confirmPasswordPlaceholder: string;
    msgAgree: string;
    msgMismatch: string;
    invalidCredentials: string;
  };
  /** 购物车抽屉文案（config key `cart-texts`，is_array 顺序见设计文档） */
  cartTexts?: {
    continueShopping: string;
    myCart: string;
    youMightAlsoLike: string;
    add: string;
    haveAnAccount: string;
    signIn: string;
    next: string;
    yourCartIsEmpty: string;
    remove: string;
    total: string;
    productLine: string;
    addFail: string;

    network: string;
    mergeFail: string;
    startInquiryFail: string;
    submitOk: string;
    qtyDecAria: string;
    qtyIncAria: string;
  };
  /** 询价表单文案（config key `inquiry-price-form`） */
  inquiryPriceFormTexts?: {
    contactInformation: string;
    descriptionParagraph: string;
    firstName: string;
    lastName: string;
    email: string;
    phoneNumber: string;
    address: string;
    leaveMessage: string;
    submit: string;
    successMessage: string;
    invalidMessage: string;
  };
  /** 搜索页文案（config key `seach-page-texts`） */
  searchPageTexts?: {
    labelTabAll: string;
    labelTabUsecases: string;
    labelTabProducts: string;
    labelTabNews: string;
    headlineSearchPrefix: string;
    headlineSearchReturned: string;
    headlineSearchMatches: string;
    heroSearchPlaceholder: string;
    emptyHint: string;
    noResultsHint: string;
    labelViewMore: string;
  };
  /** 顶栏语言切换（`buildCommonPageData`），须传入模板否则 header 仅显示地球图标且无交互 */
  navLangs?: Array<{
    code: string;
    langFullName: string;
    langIconUrl: string | null;
  }>;
  /** 中文搜索快捷入口（config key `zh-search-entry`） */
  zhSearchEntry?: {
    title: string;
    content: Array<{ title: string; url: string }>;
  } | null;
};

/**
 * 前台网站抽象基类。两套模板（国内/海外）下各页面控制器继承此类。
 * 子类实现：从 Redis 获取菜单/产品分类/配置，以及页面标题、description、keywords。
 */
export abstract class BaseWebsiteController {
  constructor(
    protected readonly langService: LangService,
    protected readonly websiteLayoutService: WebsiteLayoutService,
  ) {}

  // ---------- 抽象方法：子类实现 ----------

  /** 获取布局数据（菜单、产品分类、配置，通常来自 Redis 聚合缓存） */
  abstract getLayoutData(
    langId: number,
    options?: { configKeys?: string[]; includeProducts?: boolean },
  ): Promise<LayoutCachePayload>;

  /** 获取网站/页面标题 */
  abstract getWebsiteTitle(
    layoutData: LayoutCachePayload,
    isDomestic: boolean,
  ): string;

  /** 获取网站/页面 description（SEO） */
  abstract getWebsiteDescription(
    layoutData: LayoutCachePayload,
    isDomestic: boolean,
  ): string | null;

  /** 获取网站/页面 keywords（SEO） */
  abstract getWebsiteKeywords(
    layoutData: LayoutCachePayload,
    isDomestic: boolean,
  ): string | null;

  // ----------  protected 工具方法（子类复用） ----------

  protected isDomesticTemplateLocale(locale: string): boolean {
    return (locale || '').toLowerCase() === 'cn';
  }

  protected normalizeLocaleForData(requested: string): string {
    return (requested || '').toLowerCase();
  }

  protected buildCategoryTree(
    categories: ProductCategory[],
    basePath: string,
    products?: Product[],
  ): NavItem[] {
    // 构建分类节点
    const map = new Map<
      number,
      NavItem & { _id: number; _parentId: number; _categoryId: number }
    >();
    categories.forEach((c) => {
      const id = c.id;
      const parentId = c.parentId || 0;
      const categoryId = c.categoryId ?? c.id;
      map.set(id, {
        _id: id,
        _parentId: parentId,
        _categoryId: categoryId,
        title: c.name,
        url: `${basePath}/products?categoryId=${encodeURIComponent(String(categoryId))}`,
        picUrl: c.menuPicUrl,
        isProduct: false,
        queryCategoryId: categoryId,
        children: [],
      });
    });

    // 构建树形结构
    const roots: (NavItem & {
      _id: number;
      _parentId: number;
      _categoryId: number;
    })[] = [];
    map.forEach((node) => {
      if (!node._parentId) roots.push(node);
      else {
        const parent = map.get(node._parentId);
        if (parent) parent.children!.push(node);
        else roots.push(node);
      }
    });

    const rollupProductCount = (
      node: NavItem & { _id: number },
      prods: Product[],
    ): number => {
      const direct = prods.filter((p) => p.categoryId === node._id).length;
      let fromChildren = 0;
      for (const ch of node.children || []) {
        const c = ch as NavItem & { _id?: number };
        if (c.isProduct !== true && c._id != null) {
          fromChildren += rollupProductCount(
            c as NavItem & { _id: number },
            prods,
          );
        }
      }
      const total = direct + fromChildren;
      node.productCount = total;
      return total;
    };

    const prods = products ?? [];
    roots.forEach((r) => rollupProductCount(r, prods));

    // 如果有产品，挂载到对应分类下
    // 规则：产品应该挂载到最深层级的分类下
    // - 如果产品关联的分类是叶子分类（没有子分类），则直接挂载
    // - 如果产品关联的分类有子分类，则需要找到实际的叶子分类挂载
    if (products && products.length > 0) {
      products.forEach((p) => {
        if (!p.categoryId) return;
        const productNav: NavItem = {
          title: p.name,
          url: `${basePath}/products/${p.productId}`,
          picUrl: p.thumbUrl ?? null,
          isProduct: true,
        };

        // 找到产品应该挂载的叶子分类节点
        // 策略：如果产品分类有子分类，说明这是父级分类，产品应该作为该分类的直接子项（三级菜单）
        // 如果产品分类没有子分类，说明这是叶子分类，产品也作为直接子项
        const categoryNode = map.get(p.categoryId);
        if (categoryNode) {
          categoryNode.children!.push(productNav);
        }
      });
    }

    const strip = (items: (NavItem & { children?: NavItem[] })[]): NavItem[] =>
      items.map((it) => {
        if (it.isProduct === true) {
          return {
            title: it.title,
            url: it.url,
            picUrl: it.picUrl ?? null,
            isProduct: true,
          };
        }
        return {
          title: it.title,
          url: it.url,
          picUrl: it.picUrl ?? null,
          isProduct: false,
          productCount: it.productCount,
          queryCategoryId: it.queryCategoryId,
          children: it.children?.length ? strip(it.children) : undefined,
        };
      });
    return strip(roots);
  }

  /**
   * 产品列表 URL：`categoryId` 可重复多次表示多选；`page` 为分页页码。
   */
  protected buildProductsListQueryUrl(
    basePath: string,
    categoryIds: number[],
    page: number = 1,
  ): string {
    const params = new URLSearchParams();
    // 只使用第一个有效的 categoryId
    const validIds = categoryIds.filter((n) => Number.isFinite(n));
    if (validIds.length > 0) {
      params.set('categoryId', String(validIds[0]));
    }
    if (page > 1) params.set('page', String(page));
    const qs = params.toString();
    return qs ? `${basePath}/products?${qs}` : `${basePath}/products`;
  }

  /**
   * 产品列表侧栏：按 `?categoryId=` 多选标注当前选中；`url` 为切换该分类选中状态的链接（复选框与筛选一致）。
   */
  protected annotateProductCategoryTreeForFilters(
    items: NavItem[],
    selectedIds: number[],
    basePath: string,
  ): NavItem[] {
    return items.map((item) =>
      this.annotateProductCategoryNode(item, selectedIds, basePath),
    );
  }

  private annotateProductCategoryNode(
    node: NavItem,
    selectedIds: number[],
    basePath: string,
  ): NavItem {
    if (node.isProduct === true) return node;
    const children = node.children?.map((c) =>
      this.annotateProductCategoryNode(c, selectedIds, basePath),
    );
    const qid = node.queryCategoryId!;
    const isSelected = selectedIds.includes(qid);
    // 单选模式：点击分类时直接切换到该分类，不与其他分类组合
    const nextIds = isSelected ? [] : [qid];
    const filterToggleUrl = this.buildProductsListQueryUrl(
      basePath,
      nextIds,
      1,
    );
    const subtreeActive =
      children?.some((c) => this.categorySubtreeHasActiveFilter(c)) ?? false;
    return {
      ...node,
      children,
      url: filterToggleUrl,
      active: isSelected,
      selected: isSelected,
      expanded: isSelected || subtreeActive,
    };
  }

  private categorySubtreeHasActiveFilter(node: NavItem): boolean {
    if (node.isProduct === true) return false;
    if (node.active === true) return true;
    return (
      node.children?.some((c) => this.categorySubtreeHasActiveFilter(c)) ??
      false
    );
  }

  /**
   * 多个 `categoryId` 查询参数：各分类对应行 id 集合取并集，用于产品筛选。
   */
  protected collectCategoryRowIdsUnion(
    categories: ProductCategory[],
    queryCategoryIds: number[],
  ): Set<number> {
    const union = new Set<number>();
    for (const qid of queryCategoryIds) {
      for (const id of this.collectCategoryRowIdsForQueryParam(
        categories,
        qid,
      )) {
        union.add(id);
      }
    }
    return union;
  }

  /**
   * 与菜单链接一致：query 的 categoryId 可为业务 category_id，或分类行 id（见 buildCategoryTree 中 categoryId ?? id）。
   * 返回应参与产品筛选的 product_category 行 id 集合（含匹配到的节点及其所有子孙）。
   * 若无任何分类行匹配，则退化为仅包含 queryCategoryId 本身，以便按产品外键 category_id 精确匹配。
   */
  protected collectCategoryRowIdsForQueryParam(
    categories: ProductCategory[],
    queryCategoryId: number,
  ): Set<number> {
    const seedIds = new Set<number>();
    for (const c of categories) {
      if (c.id === queryCategoryId || c.categoryId === queryCategoryId) {
        seedIds.add(c.id);
      }
    }
    if (seedIds.size === 0) {
      return new Set<number>([queryCategoryId]);
    }
    const allowed = new Set<number>();
    const stack = [...seedIds];
    while (stack.length) {
      const id = stack.pop()!;
      if (allowed.has(id)) continue;
      allowed.add(id);
      for (const c of categories) {
        if (c.parentId === id) stack.push(c.id);
      }
    }
    return allowed;
  }

  /**
   * 从布局缓存数据构建产品分类导航树（含挂载到分类下的产品菜单项）。
   * 与首页 navItems、产品页侧边分类等共用同一套数据源与规则。
   */
  protected buildProductNavTreeFromLayout(
    layoutData: LayoutCachePayload,
    basePath: string,
  ): NavItem[] {
    return this.buildCategoryTree(
      layoutData.productCategories || [],
      basePath,
      layoutData.products,
    );
  }

  /**
   * 组装顶部导航：产品分类树 + 后台菜单树。
   * - 国内模板：首项为「产品」入口，子级为产品分类树。
   * - 国外模板：产品分类树作为顶级项前置，再接后台菜单。
   */
  protected buildNavItemsFromLayout(
    layoutData: LayoutCachePayload,
    basePath: string,
    isDomestic: boolean,
  ): NavItem[] {
    const productTree = this.buildProductNavTreeFromLayout(
      layoutData,
      basePath,
    );
    const menuNav = this.buildMenuNav(
      layoutData.menus as (Menu & { children?: Menu[] })[],
      basePath,
    );
    // 统一使用国外站的导航菜单结构，直接显示产品分类作为顶级菜单项
    return [...(productTree.length ? productTree : []), ...menuNav];
  }

  protected buildMenuNav(
    tree: (Menu & { children?: Menu[] })[],
    basePath: string,
  ): NavItem[] {
    const normalizeUrl = (u: string | null) => {
      if (!u) return '#';
      if (u.startsWith('http://') || u.startsWith('https://')) return u;
      if (u.startsWith('/')) return u;
      return `${basePath}/${u.replace(/^\/+/, '')}`;
    };
    const mapNode = (m: Menu & { children?: Menu[] }): NavItem => ({
      title: m.name,
      url: normalizeUrl(m.linkUrl),
      picUrl: m.menuPicUrl ?? null,
      bannerUrl: m.bannerUrl ?? null,
      metaTitle: m.metaTitle ?? null,
      metaKeywords: m.metaKeywords ?? null,
      metaDescription: m.metaDescription ?? null,
      children:
        m.children && m.children.length ? m.children.map(mapNode) : undefined,
    });
    return tree.map(mapNode);
  }

  protected getLogoUrlFromConfig(cfg: Config | null): string | null {
    if (!cfg) return null;
    if (typeof cfg.bgPicUrl === 'string' && cfg.bgPicUrl.trim())
      return cfg.bgPicUrl.trim();
    const c = cfg.content;
    if (c && typeof c === 'object' && !Array.isArray(c)) {
      const obj = c;
      const url =
        (typeof obj.url === 'string' && obj.url) ||
        (typeof obj.pic1Url === 'string' && obj.pic1Url) ||
        (typeof obj.picUrl === 'string' && obj.picUrl) ||
        (typeof obj.logoUrl === 'string' && obj.logoUrl) ||
        null;
      return url ? String(url) : null;
    }
    return null;
  }

  /** 从 Config 取英文 logo 路径（通过 langId=2 的配置获取） */
  protected async getEnglishLogoUrlFromConfig(_cfg: Config | null, langId: number): Promise<string | null> {
    if (langId === 2) return null;
    try {
      const enLayoutData = await this.websiteLayoutService.getLayoutData(2, {
        configKeys: ['logo'],
      });
      const enLogoCfg = enLayoutData.configByKey['logo'] ?? null;
      if (!enLogoCfg) return null;
      const c = enLogoCfg.content;
      if (c && typeof c === 'object' && !Array.isArray(c)) {
        const obj = c;
        const url =
          (typeof obj.pic1Url === 'string' && obj.pic1Url) ||
          (typeof obj.url === 'string' && obj.url) ||
          null;
        return url ? String(url) : null;
      }
    } catch {
      return null;
    }
    return null;
  }

  /** 从 Config 取英文版本的 title（通过 langId=2 的配置获取） */
  protected async getEnglishTitleFromConfig(_cfg: Config | null, langId: number, configKey: string): Promise<string | null> {
    if (langId === 2) return null;
    try {
      const enLayoutData = await this.websiteLayoutService.getLayoutData(2, {
        configKeys: [configKey],
      });
      const enCfg = enLayoutData.configByKey[configKey] ?? null;
      if (!enCfg) {
       
        return null;
      }
      const result = this.getTextFromConfig(enCfg, 'title');
   
      return result;
    } catch (error) {
      console.error(`[DEBUG] Error getting English title for ${configKey}:`, error);
      return null;
    }
  }

  /** 从 Config 取单行文案（title / description / keywords），优先从 content 的 content 字段取。 */
  protected getTextFromConfig(
    cfg: Config | null,
    field: 'title' | 'description' | 'keywords' | 'content',
  ): string | null {
    if (!cfg) return null;
    const c = cfg.content;
    const obj = c && typeof c === 'object' && !Array.isArray(c) ? c : null;

    if (field === 'title') {
      if (typeof cfg.title === 'string' && cfg.title.trim())
        return cfg.title.trim();
      if (obj && typeof obj.content === 'string' && obj.content.trim())
        return String(obj.content).trim();
      if (obj && typeof obj.title === 'string' && obj.title.trim())
        return String(obj.title).trim();
      return null;
    }
    if (field === 'description') {
      if (typeof cfg.description === 'string' && cfg.description.trim())
        return cfg.description.trim();
      if (obj && typeof obj.description === 'string' && obj.description.trim())
        return String(obj.description).trim();
      if (obj && typeof obj.content === 'string' && obj.content.trim())
        return String(obj.content).trim();
      return null;
    }
    if (field === 'keywords') {
      
      if (typeof cfg.description === 'string' && cfg.description.trim())
        return cfg.description.trim();
      if (obj && typeof obj.keywords === 'string' && obj.keywords.trim())
        return String(obj.keywords).trim();
      if (obj && typeof obj.content === 'string' && obj.content.trim())
        return String(obj.content).trim();
      return null;
    }
    if (field === 'content') {
  
      const contentVal  = cfg.content;
      // 如果是字符串，直接返回
      if (typeof contentVal === 'string' && contentVal) {
        return contentVal;
      }
      // 如果是对象，尝试从 content 属性获取
      if (contentVal && typeof contentVal === 'object' && !Array.isArray(contentVal)) {
        const contentObj = contentVal as Record<string, unknown>;
   
        if (typeof contentObj.content === 'string' && contentObj.content.trim()) {
          return contentObj.content.trim();
        }
      }
      return null;
    }
    return null;
  }

  /** 配置 `contact-us-success-text`（type 1）；无配置时按语言兜底 */
  protected getContactUsSuccessText(
    layoutData: LayoutCachePayload,
    langCode: string,
  ): string {
    const cfg = layoutData.configByKey['contact-us-success-text'] ?? null;
    const t = this.getTextFromConfig(cfg, 'title')?.trim();
    if (t) return t;
    const isZh = (langCode || '').toLowerCase() === 'cn';
    return isZh ? '我们已收到您的留言，将尽快与您联系。' : '';
  }

  /**
   * 配置 `contact-us-labels`：数组项的 `content` 依次为 fullName / email / nation / location / phone / question。
   */
  protected getContactUsFormLabels(cfg: Config | null): {
    fullName: string;
    email: string;
    nation: string;
    location: string;
    phone: string;
    question: string;
  } {
    const fallbacks = [
      'Full Name',
      'E-mail',
      'Nation',
      'Location(City)',
      'Phone Number',
      'How can we help you?',
    ] as const;
    if (!cfg?.content || !Array.isArray(cfg.content)) {
      return {
        fullName: fallbacks[0],
        email: fallbacks[1],
        nation: fallbacks[2],
        location: fallbacks[3],
        phone: fallbacks[4],
        question: fallbacks[5],
      };
    }
    const rows = cfg.content;
    const pick = (i: number) => {
      const item = rows[i];
      if (!item || typeof item !== 'object') return fallbacks[i];
      const c = (item as Record<string, unknown>).content;
      const s = typeof c === 'string' ? c.trim() : '';
      return s || fallbacks[i];
    };
    return {
      fullName: pick(0),
      email: pick(1),
      nation: pick(2),
      location: pick(3),
      phone: pick(4),
      question: pick(5),
    };
  }

  /**
   * 构建公共的头部和尾部数据（所有页面共用）
   */
  /** 前台用户协议静态页路径（与 UserAgreementPageController 一致） */
  protected buildUserAgreementPublicPath(basePath: string): string {
    const p = (basePath || '').replace(/\/+$/, '');
    const path = p ? `${p}/user-agreement` : '/user-agreement';
    return path.replace(/\/{2,}/g, '/') || '/user-agreement';
  }

  /**
   * 登录注册弹窗文案：`key_name` = login-register，多语言数组项见后台配置 type 1 / is_array。
   * @param basePath 当前语言前缀（英文 `''`，中文 `'/cn'`），用于缺省用户协议链接 `/user-agreement` 或 `/{locale}/user-agreement`
   */
  protected getLoginRegisterLabels(
    config: Config | null,
    basePath: string = '',
  ): {
    signInTitle: string;
    passwordPlaceholder: string;
    agreePrefix: string;
    userAgreementText: string;
    userAgreementUrl: string;
    noAccount: string;
    registerNow: string;
    emailPlaceholder: string;
    registerTitle: string;
    registerSubmit: string;
    confirmPasswordPlaceholder: string;
    msgAgree: string;
    msgMismatch: string;
    invalidCredentials: string;
  } {
    const agreementHref = this.buildUserAgreementPublicPath(basePath);
    const fb = {
      signInTitle: 'Sign in',
      passwordPlaceholder: 'Password',
      agreePrefix: 'I agree to',
      userAgreementText: 'the User Agreement',
      userAgreementUrl: agreementHref,
      noAccount: 'No account yet?',
      registerNow: 'Register now',
      emailPlaceholder: 'Email Address',
      registerTitle: 'Register',
      registerSubmit: 'Register',
      confirmPasswordPlaceholder: 'Confirm Password',
      msgAgree: 'Please accept the User Agreement',
      msgMismatch: 'Passwords do not match',
      invalidCredentials: 'Email or password is wrong',
    };
    if (!config || !Array.isArray(config.content)) return fb;
    const arr = config.content as Record<string, unknown>[];
    /** 与后台 type 1 单行、type 11 等多数字段一致：优先 content 文案框，缺省用 title、description */
    const pick = (i: number, def: string) => {
      const row = arr[i];
      if (!row || typeof row !== 'object') return def;
      const o = row;
      const c = typeof o.content === 'string' ? o.content.trim() : '';
      if (c) return c;
      const t = typeof o.title === 'string' ? o.title.trim() : '';
      if (t) return t;
      const d = typeof o.description === 'string' ? o.description.trim() : '';
      if (d) return d;
      return def;
    };
    const pickUrl = (i: number, def: string) => {
      const row = arr[i];
      if (!row || typeof row !== 'object') return def;
      const o = row;
      const top = typeof o.url === 'string' ? o.url.trim() : '';
      if (top) return top;
      const inner = o.content;
      if (inner && typeof inner === 'object' && !Array.isArray(inner)) {
        const u = (inner as Record<string, unknown>).url;
        if (typeof u === 'string' && u.trim()) return u.trim();
      }
      return def;
    };
    const out = {
      signInTitle: pick(0, fb.signInTitle),
      passwordPlaceholder: pick(1, fb.passwordPlaceholder),
      agreePrefix: pick(2, fb.agreePrefix),
      userAgreementText: pick(3, fb.userAgreementText),
      userAgreementUrl: pickUrl(3, agreementHref),
      noAccount: pick(4, fb.noAccount),
      registerNow: pick(5, fb.registerNow),
      emailPlaceholder: pick(6, fb.emailPlaceholder),
      registerTitle: pick(7, fb.registerTitle),
      registerSubmit: pick(7, fb.registerSubmit),
      confirmPasswordPlaceholder: pick(8, fb.confirmPasswordPlaceholder),
      msgAgree: pick(9, fb.msgAgree),
      msgMismatch: pick(10, fb.msgMismatch),
      invalidCredentials: pick(11, fb.invalidCredentials),
    };
    const href = out.userAgreementUrl.trim();
    if (!href || href === '#') {
      out.userAgreementUrl = agreementHref;
    }
    return out;
  }

  /**
   * 购物车抽屉文案：`key_name` = cart-texts，多语言数组项 type 1 / is_array，顺序与设计文档一致。
   */
  protected getCartTexts(config: Config | null): {
    continueShopping: string;
    myCart: string;
    youMightAlsoLike: string;
    add: string;
    haveAnAccount: string;
    signIn: string;
    next: string;
    yourCartIsEmpty: string;
    remove: string;
    total: string;
    productLine: string;
    addFail: string;

    network: string;
    mergeFail: string;
    startInquiryFail: string;
    submitOk: string;
    qtyDecAria: string;
    qtyIncAria: string;
  } {
    const fb = {
      continueShopping: 'Continue Shopping',
      myCart: 'My cart',
      youMightAlsoLike: 'You might also like',
      add: 'Add +',
      haveAnAccount: 'Have an account?',
      signIn: 'Sign in',
      next: 'Next',
      yourCartIsEmpty: 'Your cart is empty',
      remove: 'Remove',
      total: '{n} item(s)',
      productLine: 'Product #{id}',
      addFail: 'Could not add to cart',
      network: 'Network error',
      mergeFail: 'Could not merge your cart. Please try again.',
      startInquiryFail: 'Could not start inquiry. Please try again.',
      submitOk: 'Thank you. We will get back to you shortly.',
      qtyDecAria: 'Decrease quantity',
      qtyIncAria: 'Increase quantity',
    };
    if (!config || !Array.isArray(config.content)) return fb;
    const arr = config.content as Record<string, unknown>[];
    const pick = (i: number, def: string) => {
      const row = arr[i];
      if (!row || typeof row !== 'object') return def;
      const o = row;
      const c = typeof o.content === 'string' ? o.content.trim() : '';
      if (c) return c;
      const t = typeof o.title === 'string' ? o.title.trim() : '';
      if (t) return t;
      const d = typeof o.description === 'string' ? o.description.trim() : '';
      if (d) return d;
      return def;
    };
    return {
      continueShopping: pick(0, fb.continueShopping),
      myCart: pick(1, fb.myCart),
      youMightAlsoLike: pick(2, fb.youMightAlsoLike),
      add: pick(3, fb.add),
      haveAnAccount: pick(4, fb.haveAnAccount),
      signIn: pick(5, fb.signIn),
      next: pick(6, fb.next),
      yourCartIsEmpty: pick(7, fb.yourCartIsEmpty),
      remove: pick(8, fb.remove),
      total: pick(9, fb.total),
      productLine: pick(10, fb.productLine),
      addFail: pick(11, fb.addFail),
      network: pick(12, fb.network),
      mergeFail: pick(13, fb.mergeFail),
      startInquiryFail: pick(14, fb.startInquiryFail),
      submitOk: pick(15, fb.submitOk),
      qtyDecAria: pick(16, fb.qtyDecAria),
      qtyIncAria: pick(17, fb.qtyIncAria),
    };
  }

  /**
   * 抽屉内询价表单文案：`key_name` = inquiry-price-form，数组项顺序与设计文档一致。
   */
  protected getInquiryPriceFormTexts(config: Config | null): {
    contactInformation: string;
    descriptionParagraph: string;
    firstName: string;
    lastName: string;
    email: string;
    phoneNumber: string;
    address: string;
    leaveMessage: string;
    submit: string;
    successMessage: string;
    invalidMessage: string;
  } {
    const fb = {
      contactInformation: 'Contact Information',
      descriptionParagraph: '',
      firstName: 'First Name',
      lastName: 'Last Name',
      email: 'E-mail',
      phoneNumber: 'Phone Number',
      address: 'Address',
      leaveMessage: 'Leave Message',
      submit: 'Submit',
      successMessage: '',
      invalidMessage: 'Please enter a valid name and email address.',
    };
    if (!config || !Array.isArray(config.content)) return fb;
    const arr = config.content as Record<string, unknown>[];
    const pick = (i: number, def: string) => {
      const row = arr[i];
      if (!row || typeof row !== 'object') return def;
      const o = row;
      const c = typeof o.content === 'string' ? o.content.trim() : '';
      if (c) return c;
      const t = typeof o.title === 'string' ? o.title.trim() : '';
      if (t) return t;
      const d = typeof o.description === 'string' ? o.description.trim() : '';
      if (d) return d;
      return def;
    };
    return {
      contactInformation: pick(0, fb.contactInformation),
      descriptionParagraph: pick(1, fb.descriptionParagraph),
      firstName: pick(2, fb.firstName),
      lastName: pick(3, fb.lastName),
      email: pick(4, fb.email),
      phoneNumber: pick(5, fb.phoneNumber),
      address: pick(6, fb.address),
      leaveMessage: pick(7, fb.leaveMessage),
      submit: pick(8, fb.submit),
      successMessage: pick(9, fb.successMessage),
      invalidMessage: pick(10, fb.invalidMessage),
    };
  }

  /**
   * 搜索页文案：`key_name` = seach-page-texts，is_array。
   * 下标：0 全部 | 1 应用场景 | 2 产品 | 3 新闻 | 4 搜索标题词 | 5 结果行中间 | 6 结果行单位/结尾 | 7 搜索框占位 | 8 无结果提示 | 9 搜索框占位（重复）
   * 注：数组中未提供 无关键词副标题 和 「查看全部」
   */
  protected getSearchPageTexts(config: Config | null): {
    labelTabAll: string;
    labelTabUsecases: string;
    labelTabProducts: string;
    labelTabNews: string;
    headlineSearchPrefix: string;
    headlineSearchReturned: string;
    headlineSearchMatches: string;
    heroSearchPlaceholder: string;
    emptyHint: string;
    noResultsHint: string;
    labelViewMore: string;
    navSearchPlaceholder: string; // 导航栏搜索框占位符
  } {
    const getValue = (i: number): string => {
      if (!config || !Array.isArray(config.content)) return '';
      const arr = config.content as Record<string, unknown>[];
      const row = arr[i];
      if (!row || typeof row !== 'object') return '';
      const o = row;
      const c = typeof o.content === 'string' ? o.content.trim() : '';
      if (c) return c;
      const t = typeof o.title === 'string' ? o.title.trim() : '';
      if (t) return t;
      const d = typeof o.description === 'string' ? o.description.trim() : '';
      if (d) return d;
      return '';
    };
    return {
      labelTabAll: getValue(0),
      labelTabUsecases: getValue(1),
      labelTabProducts: getValue(2),
      labelTabNews: getValue(3),
      headlineSearchPrefix: getValue(4),
      headlineSearchReturned: getValue(5),
      headlineSearchMatches: getValue(6),
      heroSearchPlaceholder: getValue(7),
      emptyHint: '', // 数组中未提供无关键词副标题
      noResultsHint: getValue(8), // 无结果提示在索引 8
      labelViewMore: '', // 数组中未提供「查看全部」
      navSearchPlaceholder: getValue(9), // 导航栏搜索框占位符，使用索引 9
    };
  }

  /**
   * 前台列表统一分页数据：首/末页、上一页/下一页、数字槽位与可选总条数（供 list-pagination 模板）。
   * totalItems 传入且为 0，或 totalPages≤1 时返回 null。
   */
  protected buildWebsiteListPagination(opts: {
    currentPage: number;
    totalPages: number;
    totalItems?: number;
    makeUrl: (page: number) => string;
    isDomestic: boolean;
  }): Record<string, unknown> | null {
    const totalPages = Math.max(1, opts.totalPages);
    const cp = Math.min(Math.max(1, opts.currentPage), totalPages);
    if (opts.totalItems !== undefined && opts.totalItems === 0) return null;
    if (totalPages <= 1) return null;

    const { makeUrl } = opts;
    const slots: Array<
      | { type: 'page'; num: number; url: string; isCurrent: boolean }
      | { type: 'ellipsis' }
    > = [];
    const addPage = (n: number) => {
      slots.push({
        type: 'page',
        num: n,
        url: makeUrl(n),
        isCurrent: n === cp,
      });
    };
    const rangeStart = Math.max(1, cp - 2);
    const rangeEnd = Math.min(totalPages, cp + 2);
    if (rangeStart > 1) {
      addPage(1);
      if (rangeStart > 2) slots.push({ type: 'ellipsis' });
    }
    for (let n = rangeStart; n <= rangeEnd; n++) addPage(n);
    if (rangeEnd < totalPages) {
      if (rangeEnd < totalPages - 1) slots.push({ type: 'ellipsis' });
      addPage(totalPages);
    }

    const zh = opts.isDomestic;
    return {
      currentPage: cp,
      totalPages,
      prevUrl: cp > 1 ? makeUrl(cp - 1) : null,
      nextUrl: cp < totalPages ? makeUrl(cp + 1) : null,
      firstUrl: cp > 1 ? makeUrl(1) : null,
      lastUrl: cp < totalPages ? makeUrl(totalPages) : null,
      slots,
      prevLabel: zh ? '上一页' : 'Prev',
      nextLabel: zh ? '下一页' : 'Next',
      firstAriaLabel: zh ? '第一页' : 'First page',
      prevAriaLabel: zh ? '上一页' : 'Previous page',
      nextAriaLabel: zh ? '下一页' : 'Next page',
      lastAriaLabel: zh ? '最后一页' : 'Last page',
      ...(opts.totalItems !== undefined ? { totalItems: opts.totalItems } : {}),
    };
  }

  protected async buildCommonPageData(
    langId: number,
    basePath: string,
    layoutData: LayoutCachePayload,
  ) {
    // 页脚联系信息
    const footerAboutUsConfig =
      layoutData.configByKey['footer-aboutus'] ?? null;
    const footerAboutUs = this.getFooterAboutUs(footerAboutUsConfig);

    // 页脚电话信息
    const footerPhoneConfig = layoutData.configByKey['footer-phone'] ?? null;
    const footerPhone = this.getFooterPhone(footerPhoneConfig);

    // 页脚版权信息
    const footerBeianConfig = layoutData.configByKey['footer-beian'] ?? null;
    const footerBeian = this.getFooterBeian(footerBeianConfig);

    // Follow Us
    const followUsConfig = layoutData.configByKey['followus'] ?? null;
    const followUs = this.getFollowUs(followUsConfig);

    // Contact Us
    const contactUs = layoutData.configByKey['contact-us'] ?? null;
    const contactUsEnglishTitle = await this.getEnglishTitleFromConfig(contactUs, langId || 0, 'contact-us');
    console.log('[DEBUG] contactUsEnglishTitle result:', { 
      contactUsExists: !!contactUs,
      contactUsEnglishTitle 
    });

    // 获取英文 logo（用于中文站滚动后显示）
    const englishLogoUrl = await this.getEnglishLogoUrlFromConfig(
      layoutData.configByKey['logo'] ?? null,
      langId || 0,
    );

    const loginRegisterConfig =
      layoutData.configByKey['login-register'] ?? null;
    const loginRegister = this.getLoginRegisterLabels(
      loginRegisterConfig,
      basePath,
    );

    const fixedFourIconsCfg = layoutData.configByKey['fixed-four-icon'] ?? null;
    const fixedFourIcons = this.getFixedFourIcons(fixedFourIconsCfg);

    const cartTextsConfig = layoutData.configByKey['cart-texts'] ?? null;
    const cartTexts = this.getCartTexts(cartTextsConfig);
    const inquiryPriceFormCfg =
      layoutData.configByKey['inquiry-price-form'] ?? null;
    const inquiryPriceFormTexts =
      this.getInquiryPriceFormTexts(inquiryPriceFormCfg);

    // 搜索页文本配置（用于 header 搜索框 placeholder 等）
    const searchTextsConfig =
      layoutData.configByKey['seach-page-texts'] ?? null;
    const searchPageTexts = this.getSearchPageTexts(searchTextsConfig);

    // 中文搜索快捷入口配置
    const zhSearchEntryConfig = layoutData.configByKey['zh-search-entry'] ?? null;
    const zhSearchEntry = this.getZhSearchEntry(zhSearchEntryConfig);

    const submitInfoTextsConfig =
      layoutData.configByKey['submit-info-texts'] ?? null;
    const submitInfoTexts = this.getSubmitInfoTexts(submitInfoTextsConfig);

    const contactUsLabelsCfg =
      layoutData.configByKey['contact-us-labels'] ?? null;
    const contactUsFormLabels = this.getContactUsFormLabels(contactUsLabelsCfg);
    const contactUsLabels = contactUsLabelsCfg?.content || null;
    const submitCfg = layoutData.configByKey['submit'] ?? null;
    const contactUsSubmitLabel =
      this.getTextFromConfig(submitCfg, 'title')?.trim() || 'Submit';

    const langRows = await this.langService.findAll();
    const navLangs = langRows.map((l) => ({
      code: l.code,
      langFullName:
        (l.langFullName && String(l.langFullName).trim()) || l.name || l.code,
      langIconUrl: l.langIconUrl ? String(l.langIconUrl).trim() || null : null,
    }));

    return {
      footerAboutUs,
      footerPhone,
      footerBeian,
      followUs,
      contactUs,
      contactUsEnglishTitle: contactUsEnglishTitle ?? undefined,
      contactUsLabels,
      contactUsFormLabels,
      contactUsSubmitLabel,
      loginRegister,
      fixedFourIcons,
      cartTexts,
      inquiryPriceFormTexts,
      searchPageTexts,
      submitInfoTexts,
      navLangs,
      zhSearchEntry,
      englishLogoUrl,
    };
  }

  /** 从配置中解析提交成功提示文本 */
  protected getSubmitInfoTexts(config: Config | null): string {
    if (!config || !config.content) return '';
    try {
      const arr = config.content as Array<Record<string, unknown>>;
      if (arr.length > 0 && arr[0].content) {
        return String(arr[0].content).trim();
      }
    } catch {
      return '';
    }
    return '';
  }

  /** 从配置中解析页脚联系信息 */
  protected getFooterAboutUs(config: Config | null): {
    title: string;
    description: string;
    emailItems: Array<{
      label: string;
      email: string;
    }>;
  } {
    if (!config) {
      return { title: '', description: '', emailItems: [] };
    }
    const content = config.content;
    const items = Array.isArray(content) ? content : [];
    return {
      title: config.title || 'Contact Us',
      description: config.description || 'Email:',
      emailItems: items
        .filter((item) => item && typeof item === 'object')
        .map((item) => ({
          label: (item as any).title || '',
          email: (item as any).description || '',
        })),
    };
  }

  /** 从配置中解析页脚电话信息 */
  protected getFooterPhone(config: Config | null): {
    label: string;
    phone: string;
  } {
    if (!config) {
      return { label: 'Phone:', phone: '+86-400-079-2279' };
    }
    const c = config.content;
    const obj = c && typeof c === 'object' && !Array.isArray(c) ? c : null;
    const label = config.title || 'Phone:';
    let phone = '+86-400-079-2279';
    if (obj && typeof obj.content === 'string') {
      phone = obj.content;
    }
    return { label, phone };
  }

  /** 从配置中解析中文搜索快捷入口 */
  protected getZhSearchEntry(config: Config | null): {
    title: string;
    content: Array<{ title: string; url: string }>;
  } | null {
    if (!config) return null;
    const content = config.content;
    const items = Array.isArray(content) ? content : [];
    return {
      title: config.title || '快捷入口',
      content: items
        .filter((item) => item && typeof item === 'object')
        .map((item) => ({
          title: (item as any).title || '',
          url: (item as any).url || '',
        })),
    };
  }

  /** 从配置中解析页脚版权信息 */
  protected getFooterBeian(config: Config | null): {
    content: string;
  } {
    if (!config) {
      return { content: '© Copyright - 2010-2024 : All Rights Reserved.' };
    }
    const c = config.content;
    const obj = c && typeof c === 'object' && !Array.isArray(c) ? c : null;
    let content = '© Copyright - 2010-2024 : All Rights Reserved.';
    if (obj && typeof obj.content === 'string') {
      content = obj.content;
    }
    return { content };
  }

  /** 从配置中解析 Follow Us 数据 */
  protected getFollowUs(config: Config | null): {
    title: string;
    bgPicUrl: string;
    items: Array<{
      url: string;
      title: string;
      picUrl: string;
    }>;
  } {
    if (!config) {
      return { title: 'Follow Us', bgPicUrl: '', items: [] };
    }

    const content = config.content;
    const items = Array.isArray(content) ? content : [];
    return {
      title: config.title || 'Follow Us',
      bgPicUrl: (config.bgPicUrl || '').trim(),
      items: items
        .filter((item) => item && typeof item === 'object')
        .map((item) => {
          const raw = item as Record<string, unknown>;
          const pic =
            (typeof raw.pic1Url === 'string' && raw.pic1Url) ||
            (typeof raw.picUrl === 'string' && raw.picUrl) ||
            (typeof raw.pic2Url === 'string' && raw.pic2Url) ||
            '';
          const url =
            typeof raw.url === 'string' && raw.url.trim()
              ? raw.url.trim()
              : '#';
          const title =
            typeof raw.title === 'string' && raw.title.trim()
              ? raw.title.trim()
              : 'social';
          return { url, title, picUrl: pic };
        })
        .filter((item) => item.picUrl),
    };
  }

  /**
   * 配置 `fixed-four-icon`：is_array，每项 type 2 单图（pic1Url）；下标 0 询价、1–2 外链、3 回顶。
   */
  protected getFixedFourIcons(config: Config | null): {
    items: Array<{ picUrl: string; url: string; title: string }>;
  } {
    const slot = (): { picUrl: string; url: string; title: string } => ({
      picUrl: '',
      url: '',
      title: '',
    });
    const emptyFour = (): Array<{
      picUrl: string;
      url: string;
      title: string;
    }> => [slot(), slot(), slot(), slot()];
    if (!config || !Array.isArray(config.content)) {
      return { items: emptyFour() };
    }
    const rows = config.content as Record<string, unknown>[];
    const items = [0, 1, 2, 3].map((i) => {
      const raw = rows[i];
      if (!raw || typeof raw !== 'object') return slot();
      const r = raw;
      const pic =
        (typeof r.pic1Url === 'string' && r.pic1Url.trim()) ||
        (typeof r.picUrl === 'string' && r.picUrl.trim()) ||
        (typeof r.pic2Url === 'string' && r.pic2Url.trim()) ||
        '';
      const url = typeof r.url === 'string' ? r.url.trim() : '';
      const title = typeof r.title === 'string' ? r.title.trim() : '';
      return { picUrl: pic, url, title };
    });
    return { items };
  }
}
