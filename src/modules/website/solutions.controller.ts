import {
  Controller,
  Get,
  NotFoundException,
  Param,
  Req,
  Res,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { In, Repository } from 'typeorm';
import type { Solution } from '../../entities/solution.entity';
import type { SolutionCategory } from '../../entities/solution-category.entity';
import type { Config } from '../../entities/config.entity';
import { IndustryCase } from '../../entities/industry-case.entity';
import { Product } from '../../entities/product.entity';
import { Status } from '../../common/entities/base.entity';
import { LangService } from '../../i18n/lang.service';
import { SolutionService } from '../solution/solution.service';
import { WebsiteLayoutService } from './website-layout.service';
import { BaseWebsiteController, LOCALE_KEY } from './base-website.controller';
import type { LayoutCachePayload, MenuTreeItem } from './website-layout.types';
import { getResourceNotFoundCopy } from '../../common/utils/website-not-found-messages';

function parseCategoryIdFromQuery(req: FastifyRequest): number[] | null {
  const q = req.query as Record<string, unknown> | undefined;
  const raw = q?.categoryId;
  if (raw == null || raw === '') return null;
  const s = String(Array.isArray(raw) ? raw[0] : raw).trim();
  if (!s) return null;
  // 解析逗号分隔的分类 ID 列表
  const ids = s
    .split(',')
    .map((id) => Number.parseInt(id.trim(), 10))
    .filter((id) => Number.isFinite(id));
  return ids.length > 0 ? ids : null;
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
  /** 方案详情页「应用案例」区块：type 10，content.title / content.description；表 title / description 为按钮文案 */
  'application-text',
  /** 方案列表卡片按钮：type 1，优先 content JSON 的 content 字段 */
  'readmore',
  /** 搜索页文案（后台「搜索页文字」，key_name `seach-page-texts`） */
  'seach-page-texts',
  /** 解决方案列表页侧边栏文字 */
  'solution-text',
  /** 面包屑导航文字 */
  'breadcrumb-text',
  /** 关联产品区块标题和副标题 */
  'product-texts-relations',
  /** 联系表单各字段 label */
  'contact-us-labels',
  /** 联系表单提交按钮 */
  'submit',
];

@Controller()
export class SolutionsController extends BaseWebsiteController {
  constructor(
    langService: LangService,
    websiteLayoutService: WebsiteLayoutService,
    private readonly solutionService: SolutionService,
    @InjectRepository(IndustryCase)
    private readonly industryCaseRepo: Repository<IndustryCase>,
    @InjectRepository(Product)
    private readonly productRepo: Repository<Product>,
  ) {
    super(langService, websiteLayoutService);
  }

  /** 后台「关联应用案例」存的是 industry_case 表行 id（当前语言） */
  private async loadRelatedIndustryCasesForSolution(
    relatedIndustryCaseIdsStr: string | null,
    langId: number,
    basePath: string,
  ): Promise<
    Array<{
      title: string;
      thumbnail: string | null;
      specLine: string | null;
      detailUrl: string;
    }>
  > {
    if (!relatedIndustryCaseIdsStr?.trim()) return [];
    const rowIds = relatedIndustryCaseIdsStr
      .split(',')
      .map((s) => parseInt(s.trim(), 10))
      .filter((n) => Number.isFinite(n));
    if (!rowIds.length) return [];
    const rows = await this.industryCaseRepo.find({
      where: { id: In(rowIds), langId, status: Status.Normal },
    });
    const byId = new Map(rows.map((r) => [r.id, r]));
    const ordered: IndustryCase[] = [];
    for (const id of rowIds) {
      const r = byId.get(id);
      if (r) ordered.push(r);
    }
    const pathPrefix = (basePath || '').replace(/\/+$/, '');
    return ordered.map((c) => ({
      title: c.title,
      thumbnail: c.thumbnail?.trim() || null,
      specLine: c.specLine?.trim() || null,
      detailUrl:
        `${pathPrefix}/cases/${c.industryCaseId}`.replace(/\/{2,}/g, '/') ||
        `/cases/${c.industryCaseId}`,
    }));
  }

  /**
   * 获取关联产品列表
   */
  private async getRelatedProducts(
    relatedProductIds: string | null | undefined,
    langId: number,
    basePath: string,
  ): Promise<
    Array<{
      id: number;
      title: string;
      url: string;
      picUrl: string;
      model: string | null;
      coreParams: Array<{ label: string | null; value: string }>;
    }>
  > {
    if (!relatedProductIds || !relatedProductIds.trim()) {
      return [];
    }

    // 解析产品ID列表
    const productIds = relatedProductIds
      .split(',')
      .map((id) => Number.parseInt(id.trim(), 10))
      .filter((id) => Number.isFinite(id) && id > 0);

    if (productIds.length === 0) {
      return [];
    }

    // 查询产品数据
    const products = await this.productRepo.find({
      where: [
        { productId: In(productIds), langId },
        { id: In(productIds), langId },
      ],
      select: ['id', 'productId', 'name', 'thumbUrl', 'model', 'coreParams'],
    });

    // 保持原始顺序
    const productMap = new Map<number, (typeof products)[0]>();
    products.forEach((p) => {
      productMap.set(p.productId, p);
      productMap.set(p.id, p);
    });
    const orderedProducts: typeof products = [];
    for (const pid of productIds) {
      const p = productMap.get(pid);
      if (p) orderedProducts.push(p);
    }

    // 构建返回数据
    return orderedProducts.map((product) => {
      // 解析核心参数
      let coreParams: Array<{ label: string | null; value: string }> = [];
      if (product.coreParams) {
        try {
          const params =
            typeof product.coreParams === 'string'
              ? JSON.parse(product.coreParams)
              : product.coreParams;
          if (Array.isArray(params)) {
            coreParams = params
              .slice(0, 2)
              .map((p: { label?: string; value?: string }) => ({
                label: p.label || null,
                value: p.value || '',
              }));
          }
        } catch {
          coreParams = [];
        }
      }

      return {
        id: product.id,
        title: product.name,
        url: `${basePath}/products/${product.productId}`.replace(
          /\/{2,}/g,
          '/',
        ),
        picUrl: product.thumbUrl?.trim() || '/images/products/placeholder.jpg',
        model: product.model?.trim() || null,
        coreParams,
      };
    });
  }

  async getLayoutData(
    langId: number,
    options?: { configKeys?: string[]; includeProducts?: boolean },
  ): Promise<LayoutCachePayload> {
    return this.websiteLayoutService.getLayoutData(langId, {
      ...options,
      includeProducts: true,
    });
  }

  /**
   * 方案列表/详情不读全站 website-*；列表：`?categoryId=` 时用 solution_category 的 meta_*；
   * 无分类筛选时用菜单（link 指向本语言 `/solutions`）的 meta_*，缺省用菜单名；再无则「解决方案」/ Solutions。
   * 详情仅用 solution 表 meta_*（与产品详情一致，不拼后缀）。
   */
  getWebsiteTitle(
    _layoutData: LayoutCachePayload,
    isDomestic: boolean,
  ): string {
    return isDomestic ? '解决方案' : 'Solutions';
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

  /** 扁平分类：匹配行 id 或业务 solution_category_id；无匹配时退化为仅 query id */
  private collectSolutionCategoryRowIdsForQueryParam(
    categories: SolutionCategory[],
    langId: number,
    queryCategoryId: number,
  ): Set<number> {
    const inLang = categories.filter((c) => c.langId === langId);
    const allowed = new Set<number>();
    for (const c of inLang) {
      const biz = c.solutionCategoryId ?? c.id;
      if (c.id === queryCategoryId || biz === queryCategoryId) {
        allowed.add(c.id);
      }
    }
    if (allowed.size === 0) {
      return new Set<number>([queryCategoryId]);
    }
    return allowed;
  }

  /** 与侧栏/筛选一致：当前 ?categoryId= 对应的分类行（用于列表页 SEO） */
  private resolveSolutionListCategoryRow(
    categories: SolutionCategory[],
    langId: number,
    categoryFilterId: number | null,
  ): SolutionCategory | null {
    if (categoryFilterId == null) return null;
    const allowedIds = this.collectSolutionCategoryRowIdsForQueryParam(
      categories,
      langId,
      categoryFilterId,
    );
    const inLang = categories
      .filter((c) => c.langId === langId && allowedIds.has(c.id))
      .sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0) || a.id - b.id);
    return inLang[0] ?? null;
  }

  /**
   * 配置 `application-text`（key_name）：区块主副标题取自 content JSON 的 title、description；
   * 「查看详情」「更多案例」取自表字段 title、description。
   */
  private parseApplicationTextConfig(
    cfg: Config | null,
    isZh: boolean,
  ): {
    sectionTitle: string;
    sectionSubtitle: string;
    viewDetails: string;
    moreCases: string;
  } {
    if (!cfg) {
      return {
        sectionTitle: '',
        sectionSubtitle: '',
        viewDetails: '',
        moreCases: '',
      };
    }
    const obj =
      cfg.content &&
      typeof cfg.content === 'object' &&
      !Array.isArray(cfg.content)
        ? cfg.content
        : null;
    const jsonTitle =
      obj && typeof obj.title === 'string' ? obj.title.trim() : '';
    const jsonDesc =
      obj && typeof obj.description === 'string' ? obj.description.trim() : '';
    const tableTitle = typeof cfg.title === 'string' ? cfg.title.trim() : '';
    const tableDesc =
      typeof cfg.description === 'string' ? cfg.description.trim() : '';
    return {
      sectionTitle: jsonTitle,
      sectionSubtitle: jsonDesc,
      viewDetails: tableTitle,
      moreCases: tableDesc,
    };
  }

  private parseRelatedProductsTextConfig(
    cfg: Config | null,
    isZh: boolean,
  ): {
    sectionTitle: string;
    sectionSubtitle: string;
    viewDetails: string;
  } {
    if (!cfg) {
      return {
        sectionTitle: '',
        sectionSubtitle: '',
        viewDetails: '',
      };
    }

    // 处理数组形式的配置
    if (cfg.content && Array.isArray(cfg.content)) {
      // 第一个元素是 Related Products
      const productItem = cfg.content[0];
      if (productItem && typeof productItem === 'object') {
        const productItemObj = productItem as Record<string, unknown>;
        const jsonTitle =
          typeof productItemObj.title === 'string'
            ? productItemObj.title.trim()
            : '';
        const jsonDesc =
          typeof productItemObj.description === 'string'
            ? productItemObj.description.trim()
            : '';
        if (jsonTitle) {
          return {
            sectionTitle: jsonTitle,
            sectionSubtitle: jsonDesc,
            viewDetails: '',
          };
        }
      }
    }

    // 兼容旧的对象形式配置
    const obj =
      cfg.content &&
      typeof cfg.content === 'object' &&
      !Array.isArray(cfg.content)
        ? cfg.content
        : null;
    const jsonTitle =
      obj && typeof obj.title === 'string' ? obj.title.trim() : '';
    const jsonDesc =
      obj && typeof obj.description === 'string' ? obj.description.trim() : '';
    const tableTitle = typeof cfg.title === 'string' ? cfg.title.trim() : '';
    const tableDesc =
      typeof cfg.description === 'string' ? cfg.description.trim() : '';
    return {
      sectionTitle: jsonTitle || tableTitle,
      sectionSubtitle: jsonDesc || tableDesc,
      viewDetails: '',
    };
  }

  private parseSolutionTextConfig(cfg: Config | null): {
    solutionCategories: string;
    allSolutions: string;
    businessSegments: string;
    applicationScenarios: string;
    solutionTextBgPicUrl: string;
  } {
    const defaultResult = {
      solutionCategories: '',
      allSolutions: '',
      businessSegments: '',
      applicationScenarios: '',
      solutionTextBgPicUrl: '',
    };
    if (!cfg) return defaultResult;
    // 配置是数组类型，content 是数组
    const arr = cfg.content && Array.isArray(cfg.content) ? cfg.content : null;
    const firstItem =
      arr && arr[0] ? (arr[0] as Record<string, unknown>) : null;
    const secondItem =
      arr && arr[1] ? (arr[1] as Record<string, unknown>) : null;
    const thirdItem =
      arr && arr[2] ? (arr[2] as Record<string, unknown>) : null;
    const fourthItem =
      arr && arr[3] ? (arr[3] as Record<string, unknown>) : null;
    const categoriesText =
      firstItem && typeof firstItem.content === 'string'
        ? firstItem.content.trim()
        : '';
    const allSolutionsText =
      secondItem && typeof secondItem.content === 'string'
        ? secondItem.content.trim()
        : '';
    const businessSegmentsText =
      thirdItem && typeof thirdItem.content === 'string'
        ? thirdItem.content.trim()
        : '';
    const applicationScenariosText =
      fourthItem && typeof fourthItem.content === 'string'
        ? fourthItem.content.trim()
        : '';
    const solutionTextBgPicUrl =
      typeof cfg.bgPicUrl === 'string' ? cfg.bgPicUrl.trim() : '';
    return {
      solutionCategories: categoriesText,
      allSolutions: allSolutionsText,
      businessSegments: businessSegmentsText,
      applicationScenarios: applicationScenariosText,
      solutionTextBgPicUrl,
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

  private expectedSolutionsListPath(basePath: string): string {
    const p = (basePath || '').replace(/\/+$/, '');
    return p ? `${p}/solutions` : '/solutions';
  }

  private menuLinkToPublicPath(
    linkUrl: string | null | undefined,
    basePath: string,
  ): string {
    if (!linkUrl?.trim()) return '';
    const u = linkUrl.trim();
    if (u.startsWith('http://') || u.startsWith('https://')) return '';
    if (u.startsWith('/')) return u.replace(/\/+$/, '') || '/';
    const bp = (basePath || '').replace(/\/+$/, '');
    const seg = u.replace(/^\/+/, '');
    return bp ? `${bp}/${seg}`.replace(/\/+$/, '') : `/${seg}`;
  }

  private normalizePathForCompare(path: string): string {
    const s = path.replace(/\/+$/, '');
    return s || '/';
  }

  private findMenuForSolutionsList(
    tree: MenuTreeItem[],
    basePath: string,
    targetPath: string,
  ): MenuTreeItem | null {
    const target = this.normalizePathForCompare(targetPath);
    for (const m of tree) {
      const abs = this.normalizePathForCompare(
        this.menuLinkToPublicPath(m.linkUrl, basePath),
      );
      if (abs && abs === target) return m;
      if (m.children?.length) {
        const found = this.findMenuForSolutionsList(
          m.children,
          basePath,
          targetPath,
        );
        if (found) return found;
      }
    }
    return null;
  }

  private resolveSolutionsListBannerFromMenus(
    menus: MenuTreeItem[],
    basePath: string,
  ): { imageUrl: string | null; title: string | null; desc: string | null } {
    const expected = this.expectedSolutionsListPath(basePath);
    const node = this.findMenuForSolutionsList(menus, basePath, expected);
    if (!node) {
      return { imageUrl: null, title: null, desc: null };
    }
    return {
      imageUrl: node.bannerUrl?.trim() || null,
      title: node.bannerTitle?.trim() || null,
      desc: node.bannerDesc?.trim() || null,
    };
  }

  /** 列表页注入模板的字段（与详情页分离） */
  private buildSolutionsListTemplatePayload(
    ctx: Record<string, unknown>,
  ): Record<string, unknown> {
    return {
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
      navItems: ctx.navItems,
      categoryTree: ctx.categoryTree,
      solutions: ctx.solutions,
      solutionSidebarItems: ctx.solutionSidebarItems,
      footerAboutUs: ctx.footerAboutUs,
      footerPhone: ctx.footerPhone,
      footerBeian: ctx.footerBeian,
      followUs: ctx.followUs,
      contactUs: ctx.contactUs,
      fixedFourIcons: ctx.fixedFourIcons,
      loginRegister: ctx.loginRegister,
      cartTexts: ctx.cartTexts,
      inquiryPriceFormTexts: ctx.inquiryPriceFormTexts,
      bannerImageUrl: ctx.bannerImageUrl,
      solutionsBannerHeading: ctx.solutionsBannerHeading,
      solutionsBannerDesc: ctx.solutionsBannerDesc,
      solutionsReadMoreLabel: ctx.solutionsReadMoreLabel,
      pageViewPageType: ctx.pageViewPageType,
      navLangs: ctx.navLangs,
      configTexts: ctx.configTexts,
      breadcrumbTexts: ctx.breadcrumbTexts,
    };
  }

  private buildSolutionsList(solutionsData: Solution[], basePath: string) {
    return solutionsData.map((s) => ({
      id: s.solutionId,
      title: s.title,
      url: `${basePath}/solutions/${s.solutionId}`,
      picUrl:
        (s.bannerBgUrl && s.bannerBgUrl.trim()) ||
        '/images/products/placeholder.jpg',
    }));
  }

  private buildSolutionSidebarItems(
    categories: SolutionCategory[],
    basePath: string,
    langId: number,
    categoryFilterId: number | null,
    allSolutionsTitle: string,
  ): { title: string; url: string; active: boolean; group?: number }[] {
    const listPath =
      `${basePath}/solutions`.replace(/\/+/g, '/').replace(/^\/{2,}/, '/') ||
      '/solutions';
    const items: {
      title: string;
      url: string;
      active: boolean;
      group?: number;
    }[] = [
      {
        title: allSolutionsTitle,
        url: listPath,
        active: categoryFilterId == null,
      },
    ];

    // 按类型分组
    const businessSegments = categories
      .filter((c) => c.langId === langId && c.type === 1)
      .sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0) || a.id - b.id);
    const applicationScenarios = categories
      .filter((c) => c.langId === langId && c.type === 2)
      .sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0) || a.id - b.id);

    // 添加业务板块分类
    for (const c of businessSegments) {
      const bizId = c.solutionCategoryId ?? c.id;
      const active =
        categoryFilterId != null &&
        (c.id === categoryFilterId || bizId === categoryFilterId);
      items.push({
        title: c.title,
        url: `${listPath}?categoryId=${encodeURIComponent(String(bizId))}`,
        active,
        group: 1,
      });
    }

    // 添加应用案例分类
    for (const c of applicationScenarios) {
      const bizId = c.solutionCategoryId ?? c.id;
      const active =
        categoryFilterId != null &&
        (c.id === categoryFilterId || bizId === categoryFilterId);
      items.push({
        title: c.title,
        url: `${listPath}?categoryId=${encodeURIComponent(String(bizId))}`,
        active,
        group: 2,
      });
    }

    return items;
  }

  async getSolutionsListViewContext(
    pathLocale: string,
    categoryFilterIds: number[] | null = null,
  ) {
    const lang = await this.langService.findByCodeForRoute(pathLocale || 'en');
    if (!lang) {
      throw new NotFoundException();
    }
    const langId = lang.id;
    const locale =
      lang.code === 'cn' ? 'zh-CN' : lang.code === 'en' ? 'en' : lang.code;
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
    const logoUrl = this.getLogoUrlFromConfig(
      layoutData.configByKey['logo'] ?? null,
    );
    const navItems = this.buildNavItemsFromLayout(
      layoutData,
      basePath,
      isDomestic,
    );
    const categoryTree = this.buildProductNavTreeFromLayout(
      layoutData,
      basePath,
    );

    const [solutionCategories, solutionsData] = await Promise.all([
      this.solutionService.getCategoriesFromCache(langId || 0),
      this.solutionService.getSolutionsFromCache(langId || 0),
    ]);

    let listSource = solutionsData;
    if (categoryFilterIds != null && categoryFilterIds.length > 0) {
      // 收集所有允许的分类行 ID
      const allowedRowIds = new Set<number>();
      for (const categoryFilterId of categoryFilterIds) {
        const rowIds = this.collectSolutionCategoryRowIdsForQueryParam(
          solutionCategories,
          langId || 0,
          categoryFilterId,
        );
        rowIds.forEach((id) => allowedRowIds.add(id));
      }

      listSource = solutionsData.filter((s) => {
        if (!s.categoryId) return false;
        // 解析逗号分隔的分类 ID 列表
        const categoryIds = s.categoryId
          .split(',')
          .map((id) => parseInt(id.trim(), 10))
          .filter((id) => !isNaN(id));
        // 检查是否有任何分类 ID 在允许的列表中
        return categoryIds.some((id) => allowedRowIds.has(id));
      });
    }

    const solutions = this.buildSolutionsList(listSource, basePath);
    const commonData = await this.buildCommonPageData(
      langId || 0,
      basePath,
      layoutData,
    );

    const banner = this.resolveSolutionsListBannerFromMenus(
      layoutData.menus,
      basePath,
    );
    const bannerImageUrl = banner.imageUrl;
    const solutionsBannerHeading = banner.title;

    // 解决方案侧边栏文字配置
    const solutionTextCfg = layoutData.configByKey['solution-text'] ?? null;

    const configTexts = this.parseSolutionTextConfig(solutionTextCfg);

    const solutionSidebarItems = this.buildSolutionSidebarItems(
      solutionCategories,
      basePath,
      langId || 0,
      categoryFilterIds?.[0] || null, // 只传递第一个分类 ID 用于高亮
      configTexts.allSolutions,
    );

    const listTitle = this.getWebsiteTitle(layoutData, isDomestic);
    const catRow = this.resolveSolutionListCategoryRow(
      solutionCategories,
      langId || 0,
      categoryFilterIds?.[0] || null, // 只传递第一个分类 ID 用于标题
    );
    const menus = layoutData.menus;
    const expectedSolutionsPath = this.expectedSolutionsListPath(basePath);
    const solutionsMenuNode = this.findMenuForSolutionsList(
      menus,
      basePath,
      expectedSolutionsPath,
    );
    let documentTitle: string;
    let description: string | null;
    let keywords: string | null;
    if (catRow) {
      documentTitle =
        (catRow.metaTitle && catRow.metaTitle.trim()) || catRow.title;
      description =
        (catRow.metaDescription && catRow.metaDescription.trim()) || null;
      keywords = (catRow.metaKeywords && catRow.metaKeywords.trim()) || null;
    } else if (solutionsMenuNode) {
      documentTitle =
        (solutionsMenuNode.metaTitle && solutionsMenuNode.metaTitle.trim()) ||
        solutionsMenuNode.name;
      description =
        (solutionsMenuNode.metaDescription &&
          solutionsMenuNode.metaDescription.trim()) ||
        null;
      keywords =
        (solutionsMenuNode.metaKeywords &&
          solutionsMenuNode.metaKeywords.trim()) ||
        null;
    } else {
      documentTitle = listTitle;
      description = null;
      keywords = null;
    }

    const readmoreCfg = layoutData.configByKey['readmore'] ?? null;
    const solutionsReadMoreLabel =
      this.getTextFromConfig(readmoreCfg, 'title') ?? '';

    // 面包屑导航文字
    const breadcrumbCfg = layoutData.configByKey['breadcrumb-text'] ?? null;
    const breadcrumbTexts = this.parseBreadcrumbTextConfig(breadcrumbCfg);

    return {
      locale,
      langId,
      isDomestic,
      basePath,
      localeCodes: codes,
      pathLocale: effectivePathLocale,
      title: documentTitle,
      description,
      keywords,
      logoUrl,
      navItems,
      categoryTree,
      solutions,
      solutionSidebarItems,
      bannerImageUrl,
      solutionsBannerHeading,
      solutionsBannerDesc: banner.desc,
      solutionsReadMoreLabel,
      breadcrumbTexts,
      viewName: 'website/solutions',
      pageViewPageType: 'solutions',
      ...commonData,
      configTexts,
    };
  }

  async getSolutionDetailViewContext(
    pathLocale: string,
    businessSolutionId: number,
  ) {
    const lang = await this.langService.findByCodeForRoute(pathLocale || 'en');
    if (!lang) {
      throw new NotFoundException();
    }
    const langId = lang.id;
    const locale =
      lang.code === 'cn' ? 'zh-CN' : lang.code === 'en' ? 'en' : lang.code;
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
    const logoUrl = this.getLogoUrlFromConfig(
      layoutData.configByKey['logo'] ?? null,
    );
    const navItems = this.buildNavItemsFromLayout(
      layoutData,
      basePath,
      isDomestic,
    );
    const categoryTree = this.buildProductNavTreeFromLayout(
      layoutData,
      basePath,
    );
    const commonData = await this.buildCommonPageData(
      langId || 0,
      basePath,
      layoutData,
    );
    const applicationTextCfg =
      layoutData.configByKey['application-text'] ?? null;
    const applicationCasesCopy = this.parseApplicationTextConfig(
      applicationTextCfg,
      isDomestic,
    );

    // 关联产品区块文字
    const relatedProductsTextCfg =
      layoutData.configByKey['product-texts-relations'] ?? null;
    const relatedProductsText = this.parseRelatedProductsTextConfig(
      relatedProductsTextCfg,
      isDomestic,
    );

    // 面包屑导航文字
    const breadcrumbCfg = layoutData.configByKey['breadcrumb-text'] ?? null;
    const breadcrumbTexts = this.parseBreadcrumbTextConfig(breadcrumbCfg);

    const solution = await this.solutionService.findBySolutionIdAndLang(
      businessSolutionId,
      langId,
    );
    if (!solution) {
      const rf = getResourceNotFoundCopy(lang.code, 'solution');
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
        categoryTree,
        listUrl: `${basePath}/solutions`,
        notFoundHint: rf.hint,
        notFoundBackLabel: rf.back,
        notFoundBodyClass: 'g-products-page g-solutions-page',
        notFoundStylesheets: [
          '/css/global/products-global.css',
          '/css/global/solutions-global.css',
        ],
        pageViewPageType: 'solution-not-found',
        breadcrumbTexts,
        ...commonData,
      };
    }

    const pageTitle =
      (solution.metaTitle && solution.metaTitle.trim()) ||
      (solution.bannerTitle && solution.bannerTitle.trim()) ||
      solution.title;
    const description =
      (solution.metaDescription && solution.metaDescription.trim()) || null;
    const keywords =
      (solution.metaKeywords && solution.metaKeywords.trim()) || null;
    const bannerImageUrl = solution.bannerBgUrl?.trim() || null;

    const solutionHeroTitle =
      (solution.bannerTitle && solution.bannerTitle.trim()) || solution.title;
    const solutionHeroDesc = solution.bannerDesc?.trim() || null;
    const kehuRows = Array.isArray(solution.kehu) ? solution.kehu : [];

    const relatedCases = await this.loadRelatedIndustryCasesForSolution(
      solution.relatedIndustryCaseIds,
      langId || 0,
      basePath,
    );
    const showSolutionCasesSection = relatedCases.length > 0;
    const casesListUrl =
      `${(basePath || '').replace(/\/+$/, '')}/cases`.replace(/\/{2,}/g, '/') ||
      '/cases';

    // 获取关联产品
    const relatedProducts = await this.getRelatedProducts(
      solution.relatedProductIds,
      langId || 0,
      basePath,
    );

    return {
      notFound: false,
      viewName: 'website/solution-detail',
      locale,
      langId,
      isDomestic,
      basePath,
      localeCodes: codes,
      pathLocale: effectivePathLocale,
      title: pageTitle,
      description,
      keywords,
      logoUrl,
      navItems,
      categoryTree,
      solutionsListUrl: `${basePath}/solutions`,
      solution,
      bannerImageUrl,
      solutionHeroTitle,
      solutionHeroDesc,
      kehuRows,
      kehuBannerUrl: solution.kehuBannerUrl?.trim() || null,
      solutionCases: relatedCases,
      showSolutionCasesSection,
      casesListUrl,
      applicationCasesSectionTitle: applicationCasesCopy.sectionTitle,
      applicationCasesSectionSubtitle: applicationCasesCopy.sectionSubtitle,
      applicationCaseViewDetailsLabel: applicationCasesCopy.viewDetails,
      applicationCasesMoreLabel: applicationCasesCopy.moreCases,
      relatedProducts,
      hasRelatedProducts: relatedProducts.length > 0,
      relatedProductsConfig: {
        title: relatedProductsText.sectionTitle,
        description: relatedProductsText.sectionSubtitle,
        viewDetails: applicationCasesCopy.viewDetails,
      },
      pageViewPageType: 'solution-detail',
      breadcrumbTexts,
      ...commonData,
    };
  }

  private renderSolutionDetailPage(
    reply: FastifyReply,
    ctx: Record<string, unknown>,
    req: FastifyRequest,
  ) {
    const is404 = ctx.notFound === true;
    const viewName = String(ctx.viewName);
    const payload = { ...ctx };
    delete payload.notFound;
    delete payload.viewName;
    const contactFormCsrfToken = (req as any).csrfToken?.() ?? '';
    Object.defineProperty(payload, 'contactFormCsrfToken', {
      value: contactFormCsrfToken,
      writable: true,
      enumerable: true,
    });
    if (is404) {
      return (reply as any).code(404).view(viewName, payload);
    }
    return (reply as any).view(viewName, payload);
  }

  @Get('solutions')
  async solutions(@Req() req: FastifyRequest, @Res() reply: FastifyReply) {
    const categoryFilterId = parseCategoryIdFromQuery(req);
    const ctx = await this.getSolutionsListViewContext('', categoryFilterId);
    (req as any)[LOCALE_KEY] = ctx.locale;
    const contactFormCsrfToken = (req as any).csrfToken?.() ?? '';
    return (reply as any).view(ctx.viewName, {
      ...this.buildSolutionsListTemplatePayload(ctx as any),
      contactFormCsrfToken,
    });
  }

  @Get(':locale/solutions')
  async solutionsWithLocale(
    @Param('locale') localeParam: string,
    @Req() req: FastifyRequest,
    @Res() reply: FastifyReply,
  ) {
    const pathLocale = (localeParam || '').toLowerCase();
    const categoryFilterId = parseCategoryIdFromQuery(req);
    const ctx = await this.getSolutionsListViewContext(
      pathLocale,
      categoryFilterId,
    );
    (req as any)[LOCALE_KEY] = ctx.locale;
    const contactFormCsrfToken = (req as any).csrfToken?.() ?? '';
    return (reply as any).view(ctx.viewName, {
      ...this.buildSolutionsListTemplatePayload(ctx as any),
      contactFormCsrfToken,
    });
  }

  @Get('solutions/:solutionId')
  async solutionDetail(
    @Param('solutionId') solutionIdParam: string,
    @Req() req: FastifyRequest,
    @Res() reply: FastifyReply,
  ) {
    const id = Number.parseInt(solutionIdParam, 10);
    if (!Number.isFinite(id) || id < 1) {
      return (reply as any).code(404).send('Not found');
    }
    const ctx = await this.getSolutionDetailViewContext('', id);
    (req as any)[LOCALE_KEY] = ctx.locale;
    return this.renderSolutionDetailPage(reply, ctx, req);
  }

  @Get(':locale/solutions/:solutionId')
  async solutionDetailLocale(
    @Param('locale') localeParam: string,
    @Param('solutionId') solutionIdParam: string,
    @Req() req: FastifyRequest,
    @Res() reply: FastifyReply,
  ) {
    const id = Number.parseInt(solutionIdParam, 10);
    if (!Number.isFinite(id) || id < 1) {
      return (reply as any).code(404).send('Not found');
    }
    const pathLocale = (localeParam || '').toLowerCase();
    const ctx = await this.getSolutionDetailViewContext(pathLocale, id);
    (req as any)[LOCALE_KEY] = ctx.locale;
    return this.renderSolutionDetailPage(reply, ctx, req);
  }
}
