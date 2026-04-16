import { Brackets, Repository } from 'typeorm';
import {
  Controller,
  Get,
  NotFoundException,
  Param,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { LangService } from '../../i18n/lang.service';
import { WebsiteLayoutService } from './website-layout.service';
import { BaseWebsiteController, LOCALE_KEY } from './base-website.controller';
import type { LayoutCachePayload } from './website-layout.types';
import { Product } from '../../entities/product.entity';
import { IndustryCase } from '../../entities/industry-case.entity';
import { News } from '../../entities/news.entity';
import { Status } from '../../common/entities/base.entity';
import type { Config } from '../../entities/config.entity';

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
  'readmore',
  'get-a-quote',
  'product-list-card-text',
  /** 搜索页文案（后台「搜索页文字」，key_name `seach-page-texts`） */
  'seach-page-texts',
  /** 联系表单各字段 label */
  'contact-us-labels',
  /** 联系表单提交按钮 */
  'submit',
];

const PAGE_SIZE = 12;
const ALL_PREVIEW = 8;

type SearchTab = 'all' | 'products' | 'usecases' | 'news';

function sanitizeSearchQuery(raw: unknown): string {
  let s = String(raw ?? '')
    .trim()
    .slice(0, 120);
  s = s.replace(/[%_\x00]/g, '');
  return s;
}

function parseSearchTab(raw: unknown): SearchTab {
  const t = String(raw ?? 'all')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_');
  if (t === 'products' || t === 'product') return 'products';
  if (
    t === 'usecases' ||
    t === 'use_cases' ||
    t === 'solutions' ||
    t === 'solution'
  )
    return 'usecases';
  if (t === 'news') return 'news';
  return 'all';
}

function parsePage(raw: unknown): number {
  const s = String(Array.isArray(raw) ? raw[0] : (raw ?? '')).trim();
  const n = Number.parseInt(s, 10);
  return Number.isFinite(n) && n >= 1 ? n : 1;
}

function formatNewsDate(d: Date | null | undefined, localeTag: string): string {
  if (!d) return '';
  try {
    return new Intl.DateTimeFormat(localeTag, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    }).format(d);
  } catch {
    return String(d);
  }
}

function intlLocaleForNews(langCode: string): string {
  const c = (langCode || 'en').toLowerCase();
  if (c === 'cn' || c === 'zh') return 'zh-CN';
  if (c === 'jp' || c === 'ja') return 'ja-JP';
  if (c === 'kr' || c === 'ko') return 'ko-KR';
  if (c === 'de') return 'de-DE';
  if (c === 'fr') return 'fr-FR';
  if (c === 'it') return 'it-IT';
  return 'en-US';
}

@Controller()
export class WebsiteSearchController extends BaseWebsiteController {
  constructor(
    langService: LangService,
    websiteLayoutService: WebsiteLayoutService,
    @InjectRepository(Product)
    private readonly productRepo: Repository<Product>,
    @InjectRepository(IndustryCase)
    private readonly industryCaseRepo: Repository<IndustryCase>,
    @InjectRepository(News)
    private readonly newsRepo: Repository<News>,
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

  getWebsiteTitle(layoutData: LayoutCachePayload, isDomestic: boolean): string {
    return (
      this.getTextFromConfig(
        layoutData.configByKey['website-title'] ?? null,
        'title',
      ) ?? (isDomestic ? '鹏成官网' : 'Pengcheng')
    );
  }

  getWebsiteDescription(
    layoutData: LayoutCachePayload,
    _isDomestic: boolean,
  ): string | null {
    const cfg = layoutData.configByKey['website-description'] ?? null;
    return this.getTextFromConfig(cfg, 'description');
  }

  getWebsiteKeywords(
    layoutData: LayoutCachePayload,
    _isDomestic: boolean,
  ): string | null {
    const cfg = layoutData.configByKey['website-keywords'] ?? null;
    return cfg ? this.getTextFromConfig(cfg, 'keywords') : null;
  }

  private buildSearchUrl(
    basePath: string,
    q: string,
    tab: SearchTab,
    page: number,
  ): string {
    const path = `${basePath}/search`;
    const sp = new URLSearchParams();
    if (q) sp.set('q', q);
    if (tab !== 'all') sp.set('tab', tab);
    if (page > 1) sp.set('page', String(page));
    const qs = sp.toString();
    return qs ? `${path}?${qs}` : path;
  }

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

  private pickGetAQuoteLabel(layoutData: LayoutCachePayload): string {
    const cfg = layoutData.configByKey['get-a-quote'] ?? null;
    return (
      this.getTextFromConfig(cfg, 'title')?.trim() ||
      this.getTextFromConfig(cfg, 'description')?.trim() ||
      'Get a Quote'
    );
  }

  /**
   * 配置 `seach-page-texts`：type 1、is_array=1，每项 `content` 为一段文案。
   * 下标：0 全部 | 1 应用场景 | 2 产品 | 3 新闻 | 4 搜索标题词 | 5 结果行中间 | 6 结果行单位/结尾 | 7 搜索框占位
   * 可选：8 无关键词副标题 | 9 无结果提示 | 10 「查看全部」
   */
  private pickSearchPageTexts(
    layoutData: LayoutCachePayload,
    isDomestic: boolean,
    locale: string,
  ) {
    const cfg = layoutData.configByKey['seach-page-texts'] ?? null;
    const arrLen =
      cfg?.content && Array.isArray(cfg.content) ? cfg.content.length : 0;
    const row = (i: number, def: string): string => {
      if (!cfg?.content || !Array.isArray(cfg.content)) return def;
      const arr = cfg.content as Record<string, unknown>[];
      const item = arr[i];
      if (!item || typeof item !== 'object') return def;
      const c = item.content;
      return typeof c === 'string' && c.trim() ? c.trim() : def;
    };
    const defaults = {
      labelTabAll: isDomestic ? '全部' : 'ALL',
      labelTabUsecases: isDomestic ? '应用场景' : 'Use Cases',
      labelTabProducts: isDomestic ? '产品' : 'Products',
      labelTabNews: isDomestic ? '新闻' : 'News',
      headlineSearchPrefix: isDomestic ? '搜索' : 'Search for',
      headlineSearchReturned: isDomestic ? '共找到' : 'returned',
      headlineSearchMatches: isDomestic ? '条结果' : 'matches',
      heroSearchPlaceholder: isDomestic ? '输入关键词搜索…' : 'Search…',
      emptyHint: isDomestic
        ? '请输入关键词开始搜索。'
        : 'Enter a keyword to search.',
      noResultsHint: isDomestic ? '没有找到相关内容。' : 'No results found.',
      labelViewMore: isDomestic ? '查看全部' : 'View all',
    };
    const l = (locale || '').toLowerCase();
    const cjkColon =
      l === 'zh-cn' ||
      l.startsWith('zh') ||
      l === 'ja' ||
      l === 'jp' ||
      l === 'ko';
    const sectionSuffix = cjkColon ? '：' : ':';
    const labelTabAll = row(0, defaults.labelTabAll);
    const labelTabUsecases = row(1, defaults.labelTabUsecases);
    const labelTabProducts = row(2, defaults.labelTabProducts);
    const labelTabNews = row(3, defaults.labelTabNews);
    const headlineSearchPrefix = row(4, defaults.headlineSearchPrefix);
    const headlineSearchReturned = row(5, defaults.headlineSearchReturned);
    const headlineSearchMatches = row(6, defaults.headlineSearchMatches);
    const heroSearchPlaceholder = row(7, defaults.heroSearchPlaceholder);
    const emptyHint =
      arrLen > 8 ? row(8, defaults.emptyHint) : defaults.emptyHint;
    const noResultsHint =
      arrLen > 9 ? row(9, defaults.noResultsHint) : defaults.noResultsHint;
    const labelViewMore =
      arrLen > 10 ? row(10, defaults.labelViewMore) : defaults.labelViewMore;

    return {
      labelTabAll,
      labelTabUsecases,
      labelTabProducts,
      labelTabNews,
      labelSectionProducts: labelTabProducts + sectionSuffix,
      labelSectionUsecases: labelTabUsecases + sectionSuffix,
      labelSectionNews: labelTabNews + sectionSuffix,
      headlineSearchPrefix,
      headlineSearchReturned,
      headlineSearchMatches,
      heroSearchPlaceholder,
      emptyHint,
      noResultsHint,
      labelViewMore,
      searchAriaSectionLabel: isDomestic ? '站内搜索' : 'Site search',
      searchAriaKeywordsLabel: isDomestic ? '搜索关键词' : 'Search keywords',
      searchAriaResultTabsLabel: isDomestic ? '结果类型' : 'Result type',
    };
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

  private buildProductSearchRows(products: Product[], basePath: string) {
    return products.map((p) => ({
      id: p.productId ?? p.id,
      title: p.name,
      model: p.model?.trim() || null,
      tag: p.features?.[0] ? String(p.features[0]).trim() || null : null,
      url: `${basePath}/products/${p.productId ?? p.id}`,
      picUrl: p.thumbUrl || '/images/products/placeholder.jpg',
      coreParams: this.mapCoreParamsForProductCard(p.coreParams),
    }));
  }

  private productSearchBracket(q: string): Brackets {
    const n = `%${q}%`;
    return new Brackets((qb) => {
      qb.where('p.name LIKE :n', { n })
        .orWhere('p.detailTitle LIKE :n', { n })
        .orWhere('p.metaTitle LIKE :n', { n })
        .orWhere('p.metaDescription LIKE :n', { n })
        .orWhere('p.metaKeywords LIKE :n', { n })
        .orWhere('p.model LIKE :n', { n })
        .orWhere('p.advantageSummary LIKE :n', { n });
    });
  }

  /** 应用案例（`industry_case` 表），与前台 `/cases` 一致 */
  private industryCaseSearchBracket(q: string): Brackets {
    const n = `%${q}%`;
    return new Brackets((qb) => {
      qb.where('ic.title LIKE :n', { n })
        .orWhere('ic.specLine LIKE :n', { n })
        .orWhere('ic.metaTitle LIKE :n', { n })
        .orWhere('ic.metaDescription LIKE :n', { n })
        .orWhere('ic.metaKeywords LIKE :n', { n })
        .orWhere('ic.content LIKE :n', { n });
    });
  }

  private buildIndustryCaseSearchRows(cases: IndustryCase[], basePath: string) {
    const prefix = (basePath || '').replace(/\/+$/, '');
    return cases.map((c) => {
      const thumb =
        (c.thumbnail && c.thumbnail.trim()) ||
        '/images/products/placeholder.jpg';
      const spec = c.specLine?.trim() || null;
      return {
        title: c.title,
        url:
          `${prefix}/cases/${c.industryCaseId}`.replace(/\/{2,}/g, '/') ||
          `/cases/${c.industryCaseId}`,
        picUrl: thumb,
        thumbnail: (c.thumbnail && c.thumbnail.trim()) || null,
        specLine: spec,
        excerpt:
          spec?.slice(0, 160) ||
          c.metaDescription?.trim().slice(0, 160) ||
          null,
      };
    });
  }

  private newsSearchBracket(q: string): Brackets {
    const n = `%${q}%`;
    return new Brackets((qb) => {
      qb.where('n.title LIKE :n', { n })
        .orWhere('n.summary LIKE :n', { n })
        .orWhere('n.metaTitle LIKE :n', { n })
        .orWhere('n.metaDescription LIKE :n', { n });
    });
  }

  private buildNumberedPagination(
    basePath: string,
    q: string,
    tab: SearchTab,
    currentPage: number,
    totalItems: number,
    pageSize: number,
    isDomestic: boolean,
  ): Record<string, unknown> | null {
    const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
    const cp = Math.min(Math.max(1, currentPage), totalPages);
    if (totalItems === 0 || totalPages <= 1) return null;

    const makeUrl = (p: number) => this.buildSearchUrl(basePath, q, tab, p);
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

  private async resolveLang(pathLocale: string) {
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
    return {
      lang,
      langId,
      locale,
      isDomestic,
      basePath,
      codes,
      effectivePathLocale,
    };
  }

  private async renderSearch(
    pathLocale: string,
    req: FastifyRequest,
    reply: FastifyReply,
    qIn: unknown,
    tabIn: unknown,
    pageIn: unknown,
  ) {
    const q = sanitizeSearchQuery(qIn);
    const tab = parseSearchTab(tabIn);
    const page = parsePage(pageIn);

    const {
      lang,
      langId,
      locale,
      isDomestic,
      basePath,
      codes,
      effectivePathLocale,
    } = await this.resolveLang(pathLocale);

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
    const categoryTree = this.annotateProductCategoryTreeForFilters(
      this.buildProductNavTreeFromLayout(layoutData, basePath),
      [],
      basePath,
    );
    const commonData = await this.buildCommonPageData(
      langId || 0,
      basePath,
      layoutData,
    );

    const siteTitle = this.getWebsiteTitle(layoutData, isDomestic);
    const searchTexts = this.pickSearchPageTexts(
      layoutData,
      isDomestic,
      locale,
    );
    const productListCardTabs = this.pickProductListCardTabs(layoutData);
    const getAQuoteLabel = this.pickGetAQuoteLabel(layoutData);
    const dateLocale = intlLocaleForNews(lang.code);
    const readMoreLabel =
      this.getTextFromConfig(
        layoutData.configByKey['readmore'],
        'title',
      )?.trim() || (isDomestic ? '阅读全文' : 'Read More');
    const pageTitle = !q
      ? `${searchTexts.headlineSearchPrefix} — ${siteTitle}`
      : isDomestic
        ? `${searchTexts.headlineSearchPrefix}：${q} — ${siteTitle}`
        : `${searchTexts.headlineSearchPrefix}: ${q} — ${siteTitle}`;

    let productTotal = 0;
    let industryCaseTotal = 0;
    let newsTotal = 0;

    let products: ReturnType<
      WebsiteSearchController['buildProductSearchRows']
    > = [];
    /** 模板仍用 `solutions` 变量名；数据来自 `industry_case`，链接 `/cases/:id` */
    let solutions: Array<{
      title: string;
      url: string;
      picUrl: string;
      excerpt: string | null;
      thumbnail?: string | null;
      specLine?: string | null;
    }> = [];
    let newsItems: Array<{
      title: string;
      url: string;
      picUrl: string;
      thumbUrl: string;
      excerpt: string | null;
      publishAtFormatted: string;
    }> = [];

    let pagination: Record<string, unknown> | null = null;
    let showMoreProducts = false;
    let showMoreSolutions = false;
    let showMoreNews = false;

    if (q) {
      productTotal = await this.productRepo
        .createQueryBuilder('p')
        .where('p.langId = :langId', { langId })
        .andWhere('p.status = :st', { st: Status.Normal })
        .andWhere(this.productSearchBracket(q))
        .getCount();

      industryCaseTotal = await this.industryCaseRepo
        .createQueryBuilder('ic')
        .where('ic.langId = :langId', { langId })
        .andWhere('ic.status = :st', { st: Status.Normal })
        .andWhere(this.industryCaseSearchBracket(q))
        .getCount();

      newsTotal = await this.newsRepo
        .createQueryBuilder('n')
        .where('n.langId = :langId', { langId })
        .andWhere('n.status = :st', { st: Status.Normal })
        .andWhere(this.newsSearchBracket(q))
        .getCount();

      if (tab === 'all') {
        const [pRows, caseRows, nRows] = await Promise.all([
          this.productRepo
            .createQueryBuilder('p')
            .where('p.langId = :langId', { langId })
            .andWhere('p.status = :st', { st: Status.Normal })
            .andWhere(this.productSearchBracket(q))
            .orderBy('p.id', 'DESC')
            .take(ALL_PREVIEW)
            .getMany(),
          this.industryCaseRepo
            .createQueryBuilder('ic')
            .where('ic.langId = :langId', { langId })
            .andWhere('ic.status = :st', { st: Status.Normal })
            .andWhere(this.industryCaseSearchBracket(q))
            .orderBy('ic.isTop', 'DESC')
            .addOrderBy('ic.sort', 'ASC')
            .addOrderBy('ic.id', 'DESC')
            .take(ALL_PREVIEW)
            .getMany(),
          this.newsRepo
            .createQueryBuilder('n')
            .where('n.langId = :langId', { langId })
            .andWhere('n.status = :st', { st: Status.Normal })
            .andWhere(this.newsSearchBracket(q))
            .orderBy('n.publishAt', 'DESC')
            .addOrderBy('n.id', 'DESC')
            .take(ALL_PREVIEW)
            .getMany(),
        ]);
        products = this.buildProductSearchRows(pRows, basePath);
        solutions = this.buildIndustryCaseSearchRows(caseRows, basePath);
        newsItems = nRows.map((n) => {
          const urlId = n.newsId && n.newsId > 0 ? n.newsId : n.id;
          const thumbUrl = n.thumbUrl || '/images/products/placeholder.jpg';
          return {
            title: n.title,
            url: `${basePath}/news/${urlId}`,
            picUrl: thumbUrl,
            thumbUrl,
            excerpt: n.summary?.trim().slice(0, 160) || null,
            publishAtFormatted: formatNewsDate(n.publishAt, dateLocale),
          };
        });
        showMoreProducts = productTotal > products.length;
        showMoreSolutions = industryCaseTotal > solutions.length;
        showMoreNews = newsTotal > newsItems.length;
      } else if (tab === 'products') {
        const skip = (page - 1) * PAGE_SIZE;
        const pRows = await this.productRepo
          .createQueryBuilder('p')
          .where('p.langId = :langId', { langId })
          .andWhere('p.status = :st', { st: Status.Normal })
          .andWhere(this.productSearchBracket(q))
          .orderBy('p.id', 'DESC')
          .skip(skip)
          .take(PAGE_SIZE)
          .getMany();
        products = this.buildProductSearchRows(pRows, basePath);
        pagination = this.buildNumberedPagination(
          basePath,
          q,
          tab,
          page,
          productTotal,
          PAGE_SIZE,
          isDomestic,
        );
      } else if (tab === 'usecases') {
        const skip = (page - 1) * PAGE_SIZE;
        const caseRows = await this.industryCaseRepo
          .createQueryBuilder('ic')
          .where('ic.langId = :langId', { langId })
          .andWhere('ic.status = :st', { st: Status.Normal })
          .andWhere(this.industryCaseSearchBracket(q))
          .orderBy('ic.isTop', 'DESC')
          .addOrderBy('ic.sort', 'ASC')
          .addOrderBy('ic.id', 'DESC')
          .skip(skip)
          .take(PAGE_SIZE)
          .getMany();
        solutions = this.buildIndustryCaseSearchRows(caseRows, basePath);
        pagination = this.buildNumberedPagination(
          basePath,
          q,
          tab,
          page,
          industryCaseTotal,
          PAGE_SIZE,
          isDomestic,
        );
      } else if (tab === 'news') {
        const skip = (page - 1) * PAGE_SIZE;
        const nRows = await this.newsRepo
          .createQueryBuilder('n')
          .where('n.langId = :langId', { langId })
          .andWhere('n.status = :st', { st: Status.Normal })
          .andWhere(this.newsSearchBracket(q))
          .orderBy('n.publishAt', 'DESC')
          .addOrderBy('n.id', 'DESC')
          .skip(skip)
          .take(PAGE_SIZE)
          .getMany();
        newsItems = nRows.map((n) => {
          const urlId = n.newsId && n.newsId > 0 ? n.newsId : n.id;
          const thumbUrl = n.thumbUrl || '/images/products/placeholder.jpg';
          return {
            title: n.title,
            url: `${basePath}/news/${urlId}`,
            picUrl: thumbUrl,
            thumbUrl,
            excerpt: n.summary?.trim().slice(0, 160) || null,
            publishAtFormatted: formatNewsDate(n.publishAt, dateLocale),
          };
        });
        pagination = this.buildNumberedPagination(
          basePath,
          q,
          tab,
          page,
          newsTotal,
          PAGE_SIZE,
          isDomestic,
        );
      }
    }

    const totalMatches =
      tab === 'all'
        ? productTotal + industryCaseTotal + newsTotal
        : tab === 'products'
          ? productTotal
          : tab === 'usecases'
            ? industryCaseTotal
            : newsTotal;

    const tabAll = tab === 'all';
    const tabProducts = tab === 'products';
    const tabUsecases = tab === 'usecases';
    const tabNews = tab === 'news';

    (req as any)[LOCALE_KEY] = locale;

    const contactFormCsrfToken = await (reply as any).generateCsrf?.();

    return (reply as any).view('website/search', {
      locale,
      title: pageTitle,
      description: this.getWebsiteDescription(layoutData, isDomestic),
      keywords: this.getWebsiteKeywords(layoutData, isDomestic),
      langId,
      isDomestic,
      basePath,
      localeCodes: codes,
      pathLocale: effectivePathLocale,
      logoUrl,
      navItems,
      categoryTree,
      websiteTitle: siteTitle,
      searchQuery: q,
      searchTab: tab,
      totalMatches,
      productTotal,
      industryCaseTotal,
      newsTotal,
      products,
      solutions,
      newsItems,
      pagination,
      tabAll,
      tabProducts,
      tabUsecases,
      tabNews,
      urlSearchAll: this.buildSearchUrl(basePath, q, 'all', 1),
      urlSearchProducts: this.buildSearchUrl(basePath, q, 'products', 1),
      urlSearchUsecases: this.buildSearchUrl(basePath, q, 'usecases', 1),
      urlSearchNews: this.buildSearchUrl(basePath, q, 'news', 1),
      showMoreProducts,
      showMoreSolutions,
      showMoreNews,
      readMoreLabel,
      productListCardTabs,
      getAQuoteLabel,
      pageViewPageType: 'search-results',
      ...commonData,
      ...searchTexts,
      contactFormCsrfToken: contactFormCsrfToken ?? '',
    });
  }

  @Get('search')
  async searchDefault(
    @Query('q') q: unknown,
    @Query('tab') tab: unknown,
    @Query('page') page: unknown,
    @Req() req: FastifyRequest,
    @Res() reply: FastifyReply,
  ) {
    return this.renderSearch('', req, reply, q, tab, page);
  }

  @Get(':locale/search')
  async searchLocale(
    @Param('locale') localeParam: string,
    @Query('q') q: unknown,
    @Query('tab') tab: unknown,
    @Query('page') page: unknown,
    @Req() req: FastifyRequest,
    @Res() reply: FastifyReply,
  ) {
    return this.renderSearch(
      (localeParam || '').toLowerCase(),
      req,
      reply,
      q,
      tab,
      page,
    );
  }
}
