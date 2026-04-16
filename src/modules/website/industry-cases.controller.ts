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
import { Repository } from 'typeorm';
import { IndustryCase } from '../../entities/industry-case.entity';
import { Product } from '../../entities/product.entity';
import { SolutionCategory } from '../../entities/solution-category.entity';
import { Solution } from '../../entities/solution.entity';
import { Menu } from '../../entities/menu.entity';
import { LangService } from '../../i18n/lang.service';
import { WebsiteLayoutService } from './website-layout.service';
import {
  BaseWebsiteController,
  LOCALE_KEY,
  NavItem,
} from './base-website.controller';
import { getResourceNotFoundCopy } from '../../common/utils/website-not-found-messages';
import type { LayoutCachePayload } from './website-layout.types';
import { Status } from '../../common/entities/base.entity';
import { parseGlobalMapFromConfigs } from './global-map-layout';

function parseCasesSearchQuery(req: FastifyRequest): string {
  const q = req.query as Record<string, unknown> | undefined;
  const raw = q?.q;
  if (raw == null || raw === '') return '';
  const s = String(Array.isArray(raw) ? raw[0] : raw).trim();
  return s.length > 200 ? s.slice(0, 200) : s;
}

function parseCasesPage(req: FastifyRequest): number {
  const q = req.query as Record<string, unknown> | undefined;
  const raw = q?.page;
  if (raw == null || raw === '') return 1;
  const n = Number.parseInt(String(Array.isArray(raw) ? raw[0] : raw), 10);
  return Number.isFinite(n) && n > 0 ? n : 1;
}

function parseCasesCategoryId(req: FastifyRequest): string {
  const q = req.query as Record<string, unknown> | undefined;
  const raw = q?.categoryId;
  if (raw == null || raw === '') return '';
  return String(Array.isArray(raw) ? raw[0] : raw).trim();
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
  'about-us-map',
  'about-us-map-data',
  /** 搜索页文案（后台「搜索页文字」，key_name `seach-page-texts`） */
  'seach-page-texts',
  /** 分享配置 */
  'share-types',
  /** 联系表单各字段 label */
  'contact-us-labels',
  /** 联系表单提交按钮 */
  'submit',
  /** 关联产品卡片：「获取报价」按钮文案 */
  'get-a-quote',
  /** 关联产品卡片 Tab 文案：Images / Description / Specifications */
  'product-list-card-text',
  /** 关联产品区块标题和副标题 */
  'product-texts-relations',
  /** 应用案例列表页文字 */
  'case-list-text',
  /** 应用案例详情页查看详情按钮文字：取自表字段 title */
  'application-text',
];

@Controller()
export class IndustryCasesController extends BaseWebsiteController {
  constructor(
    langService: LangService,
    websiteLayoutService: WebsiteLayoutService,
    @InjectRepository(IndustryCase)
    private readonly industryCaseRepo: Repository<IndustryCase>,
    @InjectRepository(Product)
    private readonly productRepo: Repository<Product>,
    @InjectRepository(SolutionCategory)
    private readonly solutionCategoryRepo: Repository<SolutionCategory>,
    @InjectRepository(Menu)
    private readonly menuRepo: Repository<Menu>,
  ) {
    super(langService, websiteLayoutService);
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
   * 案例列表/详情页的页面标题与 meta 不读全站 website-*，
   * 列表用固定栏目名；详情仅用 industry_case 表的 meta_*。
   */
  getWebsiteTitle(
    _layoutData: LayoutCachePayload,
    isDomestic: boolean,
  ): string {
    return isDomestic ? '应用案例' : 'Application Cases';
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

  private async buildCasesListContext(
    pathLocale: string,
    searchQ = '',
    currentPage = 1,
    categoryId = '',
  ) {
    const lang = await this.langService.findByCodeForRoute(pathLocale || 'en');
    if (!lang) throw new NotFoundException();
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
    const listTitle = this.getWebsiteTitle(layoutData, isDomestic);
    const description = this.getWebsiteDescription(layoutData, isDomestic);
    const keywords = this.getWebsiteKeywords(layoutData, isDomestic);
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

    // 直接从数据库查询linkUrl为'cases'的菜单项，无论其状态如何
    let casesMenu: Menu | null = null;
    let casesBannerUrl: string | null = null;
    let casesSeoTitle: string | null = null;
    let casesSeoDescription: string | null = null;
    let casesSeoKeywords: string | null = null;

    try {
      // 查询linkUrl为'cases'的菜单项
      casesMenu = await this.menuRepo.findOne({
        where: {
          linkUrl: 'cases',
          langId: langId,
        },
      });

      if (casesMenu) {
        console.log('Found cases menu:', casesMenu);
        casesBannerUrl = casesMenu.bannerUrl || casesMenu.menuPicUrl || null;
        casesSeoTitle = casesMenu.metaTitle || null;
        casesSeoDescription = casesMenu.metaDescription || null;
        casesSeoKeywords = casesMenu.metaKeywords || null;
      } else {
        console.log('No cases menu found for langId:', langId);
      }
    } catch (error) {
      console.error('Error querying cases menu:', error);
    }

    // 解析应用案例列表页文字配置
    const caseListTexts = {
      categoryTitle: 'Case Categories',
      allCategories: 'All Categories',
      noCasesYet: 'No cases yet.',
    };
    const caseListTextConfig = layoutData.configByKey['case-list-text'] ?? null;
    if (caseListTextConfig && caseListTextConfig.content) {
      const content = Array.isArray(caseListTextConfig.content)
        ? caseListTextConfig.content
        : [];
      if (content.length > 0) {
        const item = content[0] as { content?: unknown };
        caseListTexts.categoryTitle = String(
          item.content || 'Case Categories',
        ).trim();
      }
      if (content.length > 1) {
        const item = content[1] as { content?: unknown };
        caseListTexts.allCategories = String(
          item.content || 'All Categories',
        ).trim();
      }
      if (content.length > 2) {
        const item = content[2] as { content?: unknown };
        caseListTexts.noCasesYet = String(
          item.content || 'No cases yet.',
        ).trim();
      }
    }

    // 分页配置
    const pageSize = 9;
    const page = Math.max(1, Number.parseInt(String(currentPage), 10) || 1);

    // 获取所有案例
    let rows = await this.industryCaseRepo.find({
      where: { langId, status: Status.Normal },
      order: { isTop: 'DESC', sort: 'DESC', id: 'DESC' },
    });

    // 搜索过滤
    const needle = searchQ.trim().toLowerCase();
    if (needle) {
      rows = rows.filter((c) => {
        const t = (c.title || '').toLowerCase();
        const spec = (c.specLine || '').toLowerCase();
        return t.includes(needle) || spec.includes(needle);
      });
    }

    // 获取分类数据（type=1，业务板块）
    const categories = await this.solutionCategoryRepo.find({
      where: { type: 1, status: Status.Normal, langId },
      order: { solutionCategoryId: 'ASC' },
    });

    // 统计每个分类的案例数量
    const categoryWithCounts = categories.map((category) => {
      if (!category.solutionCategoryId) {
        return {
          id: 0,
          title: category.title,
          count: 0,
        };
      }
      const count = rows.filter((caseItem) => {
        if (!caseItem.categoryId) return false;
        const solutionCategoryIdStr = String(category.solutionCategoryId);
        return caseItem.categoryId.includes(solutionCategoryIdStr);
      }).length;
      return {
        id: Number(category.solutionCategoryId),
        title: category.title,
        count,
      };
    });

    // 分类过滤
    if (categoryId) {
      rows = rows.filter((c) => {
        if (!c.categoryId) return false;
        return c.categoryId.includes(categoryId);
      });
    }

    const totalItems = rows.length;
    const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
    const safePage = Math.min(Math.max(1, page), totalPages);

    // 分页切片
    const startIndex = (safePage - 1) * pageSize;
    const paginatedRows = rows.slice(startIndex, startIndex + pageSize);

    const casesList = paginatedRows.map((c) => ({
      industryCaseId: c.industryCaseId,
      title: c.title,
      thumbnail:
        (c.thumbnail && c.thumbnail.trim()) ||
        '/images/products/placeholder.jpg',
      specLine: c.specLine?.trim() || null,
      url:
        `${basePath}/cases/${c.industryCaseId}`.replace(/\/{2,}/g, '/') ||
        `/cases/${c.industryCaseId}`,
    }));

    // 生成分页对象
    const pagination = this.buildWebsiteListPagination({
      currentPage: safePage,
      totalPages,
      totalItems,
      makeUrl: (p: number) => {
        const base = `${basePath}/cases`.replace(/\/+$/, '') || '/cases';
        const q = searchQ ? `&q=${encodeURIComponent(searchQ)}` : '';
        const cat = categoryId
          ? `&categoryId=${encodeURIComponent(categoryId)}`
          : '';
        return `${base}?page=${p}${q}${cat}`;
      },
      isDomestic,
    });

    // 转换selectedCategoryId为数字类型，确保与分类id类型一致
    const selectedCategoryIdNum = categoryId ? parseInt(categoryId, 10) : null;

    // 调试信息
    console.log('Category ID from query:', categoryId);
    console.log('Selected Category ID (number):', selectedCategoryIdNum);
    console.log('Categories:', categoryWithCounts);

    return {
      locale,
      langId,
      isDomestic,
      basePath,
      localeCodes: codes,
      pathLocale: effectivePathLocale,
      title: casesSeoTitle || listTitle,
      description: casesSeoDescription || description,
      keywords: casesSeoKeywords || keywords,
      logoUrl,
      navItems,
      categoryTree,
      casesList,
      pagination,
      casesListUrl: `${basePath}/cases`.replace(/\/+$/, '') || '/cases',
      casesSearchQuery: searchQ,
      categories: categoryWithCounts,
      totalCount: categoryWithCounts.reduce((sum, cat) => sum + cat.count, 0),
      caseListTexts,
      viewName: 'website/cases-list',
      pageViewPageType: 'cases-list',
      casesBannerUrl,
      ...commonData,
      selectedCategoryId: selectedCategoryIdNum,
    };
  }

  /** 与列表页相同的排序，用于上一条/下一条 */
  private async findOrderedCasesForLang(
    langId: number,
  ): Promise<IndustryCase[]> {
    return this.industryCaseRepo.find({
      where: { langId, status: Status.Normal },
      order: { isTop: 'DESC', sort: 'DESC', id: 'DESC' },
    });
  }

  private caseDetailPath(basePath: string, industryCaseId: number): string {
    const p =
      `${(basePath || '').replace(/\/+$/, '')}/cases/${industryCaseId}`.replace(
        /\/{2,}/g,
        '/',
      );
    return p || `/cases/${industryCaseId}`;
  }

  private resolveSharePageUrl(
    req: FastifyRequest,
    basePath: string,
    industryCaseId: number,
  ): string {
    const path = this.caseDetailPath(basePath, industryCaseId);
    const envBase = (process.env.SITE_URL || '').trim().replace(/\/+$/, '');
    if (envBase) {
      return `${envBase}${path.startsWith('/') ? path : `/${path}`}`;
    }
    const rawProto = req.headers['x-forwarded-proto'];
    const proto =
      typeof rawProto === 'string' && rawProto.trim()
        ? rawProto.split(',')[0].trim()
        : 'http';
    const host = (req.headers.host as string) || 'localhost';
    return `${proto}://${host}${path.startsWith('/') ? path : `/${path}`}`;
  }

  /**
   * 解析分享配置
   * content: [{title: 'wechat', content: 'wechat', pic1Url: '...'}, {title: 'linkedin', content: 'linkedin', pic1Url: '...'}]
   */
  private parseShareTypesConfig(cfg: unknown): {
    modalTitle: string;
    types: Array<{ type: string; label: string; iconUrl: string }>;
  } {
    const defaultResult = {
      modalTitle: '',
      types: [] as Array<{ type: string; label: string; iconUrl: string }>,
    };
    if (!cfg) return defaultResult;
    const arr = Array.isArray(cfg) ? cfg : [];
    const types = arr
      .map((item: unknown) => {
        const it = item as Record<string, unknown>;
        const type = String(it?.title || it?.content || '')
          .toLowerCase()
          .trim();
        const label = String(it?.content || it?.title || '').trim();
        const iconUrl = String(it?.pic1Url || '').trim();
        if (!type) return null;
        return { type, label, iconUrl };
      })
      .filter(
        (x): x is { type: string; label: string; iconUrl: string } =>
          x !== null,
      );
    return { modalTitle: '', types };
  }

  private async buildCaseDetailContext(
    pathLocale: string,
    businessCaseId: number,
    req: FastifyRequest,
  ) {
    const lang = await this.langService.findByCodeForRoute(pathLocale || 'en');
    if (!lang) throw new NotFoundException();
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
    console.log('[DEBUG] langId:', langId, 'pathLocale:', pathLocale);
    console.log('[DEBUG] application-text config:', JSON.stringify(layoutData.configByKey['application-text']));
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

    // 分享配置：当前语言无配置时，兜底使用 cn 语言的配置
    let shareTypesCfg = layoutData.configByKey['share-types'] ?? null;
    let shareTypesParsed = this.parseShareTypesConfig(
      (shareTypesCfg as { content?: unknown })?.content,
    );
    let shareModalTitle = String(
      (shareTypesCfg as { title?: unknown })?.title || '',
    ).trim();
    let shareTypes = shareTypesParsed.types;

    if (shareTypes.length === 0 && lang.code !== 'cn') {
      const cnLang = await this.langService.findByCode('cn');
      if (cnLang) {
        const cnLayoutData = await this.websiteLayoutService.getLayoutData(
          cnLang.id,
          {
            configKeys: ['share-types'],
            includeProducts: false,
          },
        );
        const cnShareTypesCfg = cnLayoutData.configByKey['share-types'] ?? null;
        if (cnShareTypesCfg) {
          const cnParsed = this.parseShareTypesConfig(
            (cnShareTypesCfg as { content?: unknown })?.content,
          );
          if (cnParsed.types.length > 0) {
            shareTypesCfg = cnShareTypesCfg;
            shareTypesParsed = cnParsed;
            shareModalTitle = String(
              (cnShareTypesCfg as { title?: unknown })?.title || '',
            ).trim();
            shareTypes = cnParsed.types;
          }
        }
      }
    }

    const industryCase = await this.industryCaseRepo.findOne({
      where: { industryCaseId: businessCaseId, langId, status: Status.Normal },
      select: [
        'id',
        'industryCaseId',
        'langId',
        'title',
        'content',
        'thumbnail',
        'bannerUrl',
        'bannerTitle',
        'tags',
        'metaTitle',
        'metaDescription',
        'metaKeywords',
        'relatedProductIds',
        'relatedIndustryCaseIds',
        'relatedSolutionIds',
        'createdAt',
        'status',
      ],
    });

    if (!industryCase) {
      const listUrl = `${basePath}/cases`.replace(/\/+$/, '') || '/cases';
      const rf = getResourceNotFoundCopy(lang.code, 'case');
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
        listUrl,
        notFoundHint: rf.hint,
        notFoundBackLabel: rf.back,
        notFoundBodyClass: 'g-products-page g-cases-page',
        notFoundStylesheets: [
          '/css/global/products-global.css',
          '/css/global/solutions-global.css',
        ],
        pageViewPageType: 'case-not-found',
        ...commonData,
      };
    }

    const pageTitle =
      (industryCase.metaTitle && industryCase.metaTitle.trim()) ||
      industryCase.title;
    const description =
      (industryCase.metaDescription && industryCase.metaDescription.trim()) ||
      null;
    const keywords =
      (industryCase.metaKeywords && industryCase.metaKeywords.trim()) || null;

    const ordered = await this.findOrderedCasesForLang(langId || 0);
    const idx = ordered.findIndex((c) => c.industryCaseId === businessCaseId);
    let casePrev: { title: string; url: string } | null = null;
    let caseNext: { title: string; url: string } | null = null;
    if (idx !== -1) {
      const pathPrefix = (basePath || '').replace(/\/+$/, '');
      if (idx > 0) {
        const p = ordered[idx - 1];
        casePrev = {
          title: p.title,
          url:
            `${pathPrefix}/cases/${p.industryCaseId}`.replace(/\/{2,}/g, '/') ||
            `/cases/${p.industryCaseId}`,
        };
      }
      if (idx < ordered.length - 1) {
        const n = ordered[idx + 1];
        caseNext = {
          title: n.title,
          url:
            `${pathPrefix}/cases/${n.industryCaseId}`.replace(/\/{2,}/g, '/') ||
            `/cases/${n.industryCaseId}`,
        };
      }
    }

    const sharePageUrl = this.resolveSharePageUrl(
      req,
      basePath,
      businessCaseId,
    );

    // 获取关联产品
    const relatedProducts = await this.getRelatedProducts(
      industryCase.relatedProductIds,
      langId || 0,
      basePath,
    );

    // 获取关联解决方案
    const relatedSolutions = await this.getRelatedSolutions(
      industryCase.relatedSolutionIds,
      langId || 0,
      basePath,
    );

    const caseBannerSearchPlaceholder =
      locale === 'zh-CN' ? '搜索案例' : 'Search cases';

    const globalMap = parseGlobalMapFromConfigs(
      layoutData.configByKey['about-us-map'] ?? null,
      layoutData.configByKey['about-us-map-data'] ?? null,
    );
    const mapZh = locale === 'zh-CN';

    const rawTagsUnknown: unknown = industryCase.tags;
    let caseTags: string[] = [];
    if (Array.isArray(rawTagsUnknown)) {
      caseTags = rawTagsUnknown.map((t) => String(t).trim()).filter(Boolean);
    } else if (typeof rawTagsUnknown === 'string' && rawTagsUnknown.trim()) {
      try {
        const parsed = JSON.parse(rawTagsUnknown) as unknown;
        if (Array.isArray(parsed)) {
          caseTags = parsed.map((t) => String(t).trim()).filter(Boolean);
        }
      } catch {
        caseTags = [];
      }
    }

    const created =
      industryCase.createdAt instanceof Date
        ? industryCase.createdAt
        : new Date(industryCase.createdAt);
    const caseReleaseDate = `${created.getFullYear()}-${created.getMonth() + 1}-${created.getDate()}`;

    return {
      notFound: false,
      viewName: 'website/case-detail',
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
      casesListUrl: `${basePath}/cases`.replace(/\/+$/, '') || '/cases',
      caseBannerSearchUrl:
        `${basePath}/search`.replace(/\/{2,}/g, '/') || '/search',
      industryCase,
      bannerImageUrl:
        industryCase.bannerUrl?.trim() ||
        industryCase.thumbnail?.trim() ||
        null,
      casePrev,
      caseNext,
      sharePageUrl,
      caseTags,
      hasCaseTags: caseTags.length > 0,
      caseReleaseDate,
      caseReleaseLabel: locale === 'zh-CN' ? '发布时间' : 'Release time',

      caseBannerSearchPlaceholder,
      pageViewPageType: 'case-detail',
      hasGlobalMap: globalMap.hasContent,
      globalMapSectionId: globalMap.sectionId,
      globalMapTitle: globalMap.title,
      globalMapSubtitle: globalMap.subtitle,
      globalMapLegendHq: globalMap.legendHq,
      globalMapLegendOffice: globalMap.legendOffice,
      globalMapSupplement: globalMap.supplement,
      globalMapPointsJson: globalMap.pointsJson,
      globalMapAriaLabel:
        globalMap.title ||
        (mapZh ? '全球销售与服务网络' : 'Global sales and service network'),
      globalMapLegendAria: mapZh ? '图例' : 'Map legend',
      globalMapErrNoEcharts: mapZh ? '图表库未加载' : 'ECharts unavailable',
      globalMapErrLoad: mapZh ? '地图加载失败' : 'Map failed to load',
      globalMapLoadingText: mapZh ? '加载地图中…' : 'Loading map…',
      shareTypes,
      shareModalTitle,
      relatedProducts,
      hasRelatedProducts: relatedProducts.length > 0,
      relatedSolutions,
      hasRelatedSolutions: relatedSolutions.length > 0,
      getAQuoteLabel: this.pickGetAQuoteLabel(layoutData),
      productListCardTabs: this.pickProductListCardTabs(layoutData),
      relatedProductsConfig: {
        title: this.parseRelatedProductsTextConfig(
          layoutData.configByKey['product-texts-relations'],
          isDomestic,
        ).sectionTitle,
        description: this.parseRelatedProductsTextConfig(
          layoutData.configByKey['product-texts-relations'],
          isDomestic,
        ).sectionSubtitle,
        viewDetails: this.parseApplicationTextLabel(
          layoutData.configByKey['application-text'],
          isDomestic,
        ),
      },
      relatedSolutionsConfig: {
        title: this.parseRelatedSolutionsTextConfig(
          layoutData.configByKey['product-texts-relations'],
          isDomestic,
        ).sectionTitle,
        description: this.parseRelatedSolutionsTextConfig(
          layoutData.configByKey['product-texts-relations'],
          isDomestic,
        ).sectionSubtitle,
        viewDetails: (() => {
          const val = this.parseApplicationTextLabel(
            layoutData.configByKey['application-text'],
            isDomestic,
          );
          console.log('[DEBUG] relatedSolutionsConfig.viewDetails:', val);
          return val;
        })(),
      },
      ...commonData,
    };
  }

  private pickGetAQuoteLabel(layoutData: LayoutCachePayload): string {
    const cfg = layoutData.configByKey['get-a-quote'] ?? null;
    return (
      this.getTextFromConfig(cfg, 'title')?.trim() ||
      this.getTextFromConfig(cfg, 'description')?.trim() ||
      'Get a Quote'
    );
  }

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
    if (!cfg || !(cfg as any).content || !Array.isArray((cfg as any).content))
      return fb;
    const rows = (cfg as any).content as Record<string, unknown>[];
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

  private parseRelatedProductsTextConfig(
    cfg: import('../../entities/config.entity').Config | null,
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

  /**
   * 解析 application-text 配置的 title 字段（查看详情的按钮文字）
   */
  private parseApplicationTextLabel(
    cfg: import('../../entities/config.entity').Config | null,
    isZh: boolean,
  ): string {
    console.log('[DEBUG parseApplicationTextLabel] cfg:', cfg ? cfg.title : 'null');
    if (!cfg) return '';
    const tableTitle = typeof cfg.title === 'string' ? cfg.title.trim() : '';
    console.log('[DEBUG parseApplicationTextLabel] tableTitle:', tableTitle);
    return tableTitle;
  }

  /**
   * 解析关联解决方案文字配置
   */
  private parseRelatedSolutionsTextConfig(
    cfg: import('../../entities/config.entity').Config | null,
    isZh: boolean,
  ): {
    sectionTitle: string;
    sectionSubtitle: string;
  } {
    const fb = {
      sectionTitle: isZh ? '关联解决方案' : 'Related Solutions',
      sectionSubtitle: '',
    };
    if (!cfg) return fb;

    // 处理数组形式的配置
    if (cfg.content && Array.isArray(cfg.content)) {
      // 第二个元素是 Related Solutions
      const solutionItem = cfg.content[1];
      if (solutionItem && typeof solutionItem === 'object') {
        const solutionItemObj = solutionItem as Record<string, unknown>;
        const jsonTitle =
          typeof solutionItemObj.title === 'string'
            ? solutionItemObj.title.trim()
            : '';
        const jsonDesc =
          typeof solutionItemObj.description === 'string'
            ? solutionItemObj.description.trim()
            : '';
        if (jsonTitle) {
          return {
            sectionTitle: jsonTitle,
            sectionSubtitle: jsonDesc,
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
      sectionTitle: jsonTitle || tableTitle || fb.sectionTitle,
      sectionSubtitle: jsonDesc || tableDesc || fb.sectionSubtitle,
    };
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
      where: productIds.map((id) => ({ id, langId })),
      select: ['id', 'productId', 'name', 'thumbUrl', 'model', 'coreParams'],
    });

    // 构建返回数据
    return products.map((product) => {
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
              .filter(
                (p: { label?: string; value?: string }) =>
                  (p.value ?? '').toString().trim() !== '',
              )
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

  /**
   * 获取关联解决方案列表
   */
  private async getRelatedSolutions(
    relatedSolutionIds: string | null | undefined,
    langId: number,
    basePath: string,
  ): Promise<
    Array<{
      id: number;
      title: string;
      url: string;
      picUrl: string;
      description: string | null;
    }>
  > {
    if (!relatedSolutionIds || !relatedSolutionIds.trim()) {
      return [];
    }

    // 解析解决方案ID列表
    const solutionIds = relatedSolutionIds
      .split(',')
      .map((id) => Number.parseInt(id.trim(), 10))
      .filter((id) => Number.isFinite(id) && id > 0);

    if (solutionIds.length === 0) {
      return [];
    }

    // 查询解决方案数据
    const solutions = await this.industryCaseRepo.manager.find(Solution, {
      where: solutionIds.map((id) => ({ id, langId, status: Status.Normal })),
      select: ['id', 'solutionId', 'title', 'bannerBgUrl'],
    });

    // 构建返回数据
    return solutions.map((solution) => ({
      id: solution.id,
      title: solution.title || '',
      url: `${basePath}/solutions/${solution.solutionId}`.replace(
        /\/{2,}/g,
        '/',
      ),
      picUrl:
        solution.bannerBgUrl?.trim() || '/images/products/placeholder.jpg',
      description: null,
    }));
  }

  private renderPage(reply: FastifyReply, ctx: Record<string, unknown>) {
    const is404 = ctx.notFound === true;
    const viewName = String(ctx.viewName);
    const payload = { ...ctx };
    delete payload.notFound;
    delete payload.viewName;
    if (is404) {
      return (reply as any).code(404).view(viewName, payload);
    }
    return (reply as any).view(viewName, payload);
  }

  @Get('cases')
  async casesListDefault(
    @Req() req: FastifyRequest,
    @Res() reply: FastifyReply,
  ) {
    const ctx = await this.buildCasesListContext(
      '',
      parseCasesSearchQuery(req),
      parseCasesPage(req),
      parseCasesCategoryId(req),
    );
    (req as any)[LOCALE_KEY] = ctx.locale;
    return (reply as any).view(ctx.viewName, ctx);
  }

  @Get(':locale/cases')
  async casesListLocale(
    @Param('locale') localeParam: string,
    @Req() req: FastifyRequest,
    @Res() reply: FastifyReply,
  ) {
    const pathLocale = (localeParam || '').toLowerCase();
    const ctx = await this.buildCasesListContext(
      pathLocale,
      parseCasesSearchQuery(req),
      parseCasesPage(req),
      parseCasesCategoryId(req),
    );
    (req as any)[LOCALE_KEY] = ctx.locale;
    return (reply as any).view(ctx.viewName, ctx);
  }

  @Get('cases/:caseId')
  async caseDetailDefault(
    @Param('caseId') caseIdParam: string,
    @Req() req: FastifyRequest,
    @Res() reply: FastifyReply,
  ) {
    const id = Number.parseInt(caseIdParam, 10);
    if (!Number.isFinite(id) || id < 1) {
      return (reply as any).code(404).send('Not found');
    }
    const ctx = await this.buildCaseDetailContext('', id, req);
    (req as any)[LOCALE_KEY] = ctx.locale;
    return this.renderPage(reply, ctx);
  }

  @Get(':locale/cases/:caseId')
  async caseDetailLocale(
    @Param('locale') localeParam: string,
    @Param('caseId') caseIdParam: string,
    @Req() req: FastifyRequest,
    @Res() reply: FastifyReply,
  ) {
    const id = Number.parseInt(caseIdParam, 10);
    if (!Number.isFinite(id) || id < 1) {
      return (reply as any).code(404).send('Not found');
    }
    const pathLocale = (localeParam || '').toLowerCase();
    const ctx = await this.buildCaseDetailContext(pathLocale, id, req);
    (req as any)[LOCALE_KEY] = ctx.locale;
    return this.renderPage(reply, ctx);
  }
}
