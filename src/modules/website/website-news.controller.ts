import {
  Controller,
  Get,
  NotFoundException,
  Param,
  Req,
  Res,
} from '@nestjs/common';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { LangService } from '../../i18n/lang.service';
import { WebsiteLayoutService } from './website-layout.service';
import { BaseWebsiteController, LOCALE_KEY } from './base-website.controller';
import type { LayoutCachePayload, MenuTreeItem } from './website-layout.types';
import { WebsiteNewsService } from './website-news.service';
import type { Config } from '../../entities/config.entity';
import { getResourceNotFoundCopy } from '../../common/utils/website-not-found-messages';

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
  /** 搜索页文案（后台「搜索页文字」，key_name `seach-page-texts`） */
  'seach-page-texts',
  /** 分享配置 */
  'share-types',
  /** 联系表单各字段 label */
  'contact-us-labels',
  /** 联系表单提交按钮 */
  'submit',
];

function parseIntQuery(
  q: Record<string, unknown> | undefined,
  key: string,
): number | null {
  if (!q) return null;
  const raw = q[key];
  if (raw == null || raw === '') return null;
  const s = String(Array.isArray(raw) ? raw[0] : raw).trim();
  if (!s) return null;
  const n = Number.parseInt(s, 10);
  return Number.isFinite(n) ? n : null;
}

function normalizeMenuBannerPicUrl(url: string): string | null {
  const u = url.trim();
  if (!u) return null;
  if (u.startsWith('http://') || u.startsWith('https://')) return u;
  return u.startsWith('/') ? u : `/${u}`;
}

function stripHtml(html: string | null | undefined, maxLen: number): string {
  if (!html) return '';
  const t = String(html)
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (t.length <= maxLen) return t;
  return t.slice(0, maxLen).trimEnd() + '…';
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

@Controller()
export class WebsiteNewsController extends BaseWebsiteController {
  constructor(
    langService: LangService,
    websiteLayoutService: WebsiteLayoutService,
    private readonly websiteNewsService: WebsiteNewsService,
  ) {
    super(langService, websiteLayoutService);
  }

  async getLayoutData(
    langId: number,
    options?: { configKeys?: string[]; includeProducts?: boolean },
  ): Promise<LayoutCachePayload> {
    return this.websiteLayoutService.getLayoutData(langId, options);
  }

  /**
   * 新闻列表不读全站 website-*；详情仅用 news 表 meta_*（不用 summary 回填 description）。
   */
  getWebsiteTitle(
    _layoutData: LayoutCachePayload,
    isDomestic: boolean,
  ): string {
    return isDomestic ? '新闻' : 'News';
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

  private expectedNewsListPublicPath(basePath: string): string {
    const p = (basePath || '').replace(/\/+$/, '');
    return p ? `${p}/news` : '/news';
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

  private normalizePathForMenuCompare(path: string): string {
    const s = path.replace(/\/+$/, '');
    return s || '/';
  }

  private findMenuByPublicPath(
    tree: MenuTreeItem[],
    basePath: string,
    targetPath: string,
  ): MenuTreeItem | null {
    const target = this.normalizePathForMenuCompare(targetPath);
    for (const m of tree) {
      const abs = this.normalizePathForMenuCompare(
        this.menuLinkToPublicPath(m.linkUrl, basePath),
      );
      if (abs && abs === target) return m;
      if (m.children?.length) {
        const found = this.findMenuByPublicPath(
          m.children,
          basePath,
          targetPath,
        );
        if (found) return found;
      }
    }
    return null;
  }

  private intlLocaleForNews(langCode: string): string {
    const c = (langCode || 'en').toLowerCase();
    if (c === 'cn' || c === 'zh') return 'zh-CN';
    if (c === 'jp' || c === 'ja') return 'ja-JP';
    if (c === 'kr' || c === 'ko') return 'ko-KR';
    if (c === 'de') return 'de-DE';
    if (c === 'fr') return 'fr-FR';
    if (c === 'it') return 'it-IT';
    return 'en-US';
  }

  private buildNewsListPath(
    basePath: string,
    opts: {
      year?: number | null;
      month?: number | null;
      page?: number;
      pageSize?: number;
    },
  ): string {
    const p = new URLSearchParams();
    if (opts.year != null && opts.year > 0) p.set('year', String(opts.year));
    if (opts.month != null && opts.month >= 1 && opts.month <= 12)
      p.set('month', String(opts.month));
    if (opts.page != null && opts.page > 1) p.set('page', String(opts.page));
    if (opts.pageSize != null && opts.pageSize !== 9)
      p.set('pageSize', String(opts.pageSize));
    const qs = p.toString();
    return `${basePath}/news${qs ? `?${qs}` : ''}`;
  }

  private async getNewsListPagePayload(
    pathLocale: string,
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
      .then((l) => l.map((x) => x.code));
    const effectivePathLocale =
      pathLocale || (lang.code === 'en' ? '' : lang.code);
    const dateLocale = this.intlLocaleForNews(lang.code);

    const q = req.query as Record<string, unknown> | undefined;
    let year = parseIntQuery(q, 'year');
    let month = parseIntQuery(q, 'month');
    if (year == null || year < 1900 || year > 2100) year = null;
    if (month == null || month < 1 || month > 12) month = null;
    if (month != null && year == null) month = null;

    let page = parseIntQuery(q, 'page') ?? 1;
    if (page < 1) page = 1;
    let pageSize = parseIntQuery(q, 'pageSize') ?? 9;
    pageSize = Math.min(36, Math.max(9, pageSize));

    const [years, layoutData] = await Promise.all([
      this.websiteNewsService.listDistinctYears(langId || 0),
      this.getLayoutData(langId || 0, { configKeys: LAYOUT_CONFIG_KEYS }),
    ]);

    const monthsForYear =
      year != null
        ? await this.websiteNewsService.listDistinctMonths(langId || 0, year)
        : [];

    const total = await this.websiteNewsService.countPublishedFiltered({
      langId: langId || 0,
      year,
      month,
      page: 1,
      pageSize,
    });
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    if (page > totalPages) page = totalPages;
    const filters = {
      langId: langId || 0,
      year,
      month,
      page,
      pageSize,
    };
    const rows = await this.websiteNewsService.findPublishedPage(filters);

    const listTitle = this.getWebsiteTitle(layoutData, isDomestic);
    const defaultDescription = this.getWebsiteDescription(
      layoutData,
      isDomestic,
    );
    const defaultKeywords = this.getWebsiteKeywords(layoutData, isDomestic);
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

    const cardItems = rows.map((n) => {
      const urlId = n.newsId && n.newsId > 0 ? n.newsId : n.id;
      const excerpt = stripHtml(n.summary, 180) || stripHtml(n.content, 180);
      return {
        title: n.title,
        thumbUrl: n.thumbUrl,
        publishAtFormatted: formatNewsDate(n.publishAt, dateLocale),
        excerpt,
        detailUrl: `${basePath}/news/${urlId}`,
        urlId,
      };
    });

    const mkListPath = (o: {
      year?: number | null;
      month?: number | null;
      page?: number;
    }) => this.buildNewsListPath(basePath, { ...o, pageSize });

    const pagination = this.buildWebsiteListPagination({
      currentPage: page,
      totalPages,
      totalItems: total,
      makeUrl: (p) => mkListPath({ year, month, page: p }),
      isDomestic,
    });

    const yearOptions = years.map((y) => ({
      value: y,
      label: String(y),
      selected: year === y,
      url: mkListPath({ year: y, month: null, page: 1 }),
    }));

    const monthOptions = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((m) => ({
      value: m,
      label: String(m),
      selected: month === m,
      disabled: year == null || !monthsForYear.includes(m),
      url: year != null ? mkListPath({ year, month: m, page: 1 }) : '',
    }));

    const allNewsUrl = mkListPath({ year: null, month: null, page: 1 });
    const monthClearUrl =
      year != null ? mkListPath({ year, month: null, page: 1 }) : allNewsUrl;

    const menus = layoutData.menus || [];
    const menuNews = this.findMenuByPublicPath(
      menus,
      basePath,
      this.expectedNewsListPublicPath(basePath),
    );
    const rawBanner = menuNews?.bannerUrl?.trim() ?? '';
    const newsBannerUrl = rawBanner
      ? normalizeMenuBannerPicUrl(rawBanner)
      : null;
    const newsBannerTitle = menuNews?.bannerTitle?.trim() || null;
    const seoTitleFromMenu = menuNews?.metaTitle?.trim() || '';
    const seoDescriptionFromMenu = menuNews?.metaDescription?.trim() || '';
    const seoKeywordsFromMenu = menuNews?.metaKeywords?.trim() || '';

    return {
      locale,
      langId,
      isDomestic,
      basePath,
      localeCodes: codes,
      pathLocale: effectivePathLocale,
      title: seoTitleFromMenu || listTitle,
      description: seoDescriptionFromMenu || defaultDescription,
      keywords: seoKeywordsFromMenu || defaultKeywords,
      logoUrl,
      navItems,
      categoryTree,
      viewName: 'website/news',
      pageViewPageType: 'news',
      cardItems,
      yearOptions,
      monthOptions,
      selectedYear: year,
      selectedMonth: month,
      allNewsUrl,
      monthClearUrl,
      pagination,
      newsBannerUrl,
      newsBannerTitle,
      labels: {
        newsHeading: locale === 'zh-CN' ? '新闻' : 'NEWS',
        filterTitle: locale === 'zh-CN' ? '筛选' : 'Filter',
        filterYear: locale === 'zh-CN' ? '年份' : 'Year',
        filterMonth: locale === 'zh-CN' ? '月份' : 'Month',
        allYears: locale === 'zh-CN' ? '全部' : 'All',
        allMonths: locale === 'zh-CN' ? '全部' : 'All',
        readMore:
          this.getTextFromConfig(
            layoutData.configByKey['readmore'],
            'title',
          )?.trim() || (locale === 'zh-CN' ? '阅读全文' : 'Read More'),
        empty: locale === 'zh-CN' ? '暂无新闻' : 'No news yet.',
        prev: locale === 'zh-CN' ? '上一页' : 'Previous',
        next: locale === 'zh-CN' ? '下一页' : 'Next',
        pageOf: locale === 'zh-CN' ? '第' : 'Page',
      },
      ...commonData,
    };
  }

  @Get('news')
  async newsListRoot(@Req() req: FastifyRequest, @Res() reply: FastifyReply) {
    const ctx = await this.getNewsListPagePayload('', req);
    (req as any)[LOCALE_KEY] = ctx.locale;
    return (reply as any).view(ctx.viewName, ctx);
  }

  @Get(':locale/news')
  async newsListLocale(
    @Param('locale') localeParam: string,
    @Req() req: FastifyRequest,
    @Res() reply: FastifyReply,
  ) {
    const pathLocale = (localeParam || '').toLowerCase();
    const ctx = await this.getNewsListPagePayload(pathLocale, req);
    (req as any)[LOCALE_KEY] = ctx.locale;
    return (reply as any).view(ctx.viewName, ctx);
  }

  private parseShareTypesForNews(
    cfg: unknown,
  ): Array<{ type: string; label: string; iconUrl: string }> {
    if (!cfg || !Array.isArray(cfg)) return [];
    return cfg
      .map((item: unknown) => {
        const it = item as Record<string, string | null | undefined>;
        const type = (it?.title ?? it?.content ?? '').toLowerCase().trim();
        const label = (it?.content ?? it?.title ?? '').trim();
        const iconUrl = (it?.pic1Url ?? '').trim();
        if (!type) return null;
        return { type, label, iconUrl };
      })
      .filter(
        (x): x is { type: string; label: string; iconUrl: string } =>
          x !== null,
      );
  }

  private async getNewsDetailPayload(
    pathLocale: string,
    paramId: number,
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
      .then((l) => l.map((x) => x.code));
    const effectivePathLocale =
      pathLocale || (lang.code === 'en' ? '' : lang.code);
    const dateLocale = this.intlLocaleForNews(lang.code);

    const layoutData404 = await this.getLayoutData(langId || 0, {
      configKeys: LAYOUT_CONFIG_KEYS,
    });
    const logoUrl404 = this.getLogoUrlFromConfig(
      layoutData404.configByKey['logo'] ?? null,
    );
    const navItems404 = this.buildNavItemsFromLayout(
      layoutData404,
      basePath,
      isDomestic,
    );
    const categoryTree404 = this.buildProductNavTreeFromLayout(
      layoutData404,
      basePath,
    );
    const commonData404 = await this.buildCommonPageData(
      langId || 0,
      basePath,
      layoutData404,
    );

    const news = await this.websiteNewsService.findPublishedDetail(
      langId || 0,
      paramId,
    );
    if (!news) {
      const rf = getResourceNotFoundCopy(lang.code, 'news');
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
        logoUrl: logoUrl404,
        navItems: navItems404,
        categoryTree: categoryTree404,
        listUrl: `${basePath}/news`,
        notFoundHint: rf.hint,
        notFoundBackLabel: rf.back,
        notFoundBodyClass: 'g-news-detail-page',
        notFoundStylesheets: ['/css/global/news-global.css'],
        pageViewPageType: 'news-not-found',
        ...commonData404,
      };
    }

    const logoUrl = logoUrl404;
    const navItems = navItems404;
    const categoryTree = categoryTree404;
    const commonData = commonData404;

    // 分享配置：当前语言无配置时兜底 cn
    const shareTypesCfg = layoutData404.configByKey['share-types'] ?? null;
    const shareTypesParsed = this.parseShareTypesForNews(
      (shareTypesCfg as { content?: unknown })?.content,
    );
    let shareModalTitle = (
      (shareTypesCfg as { title?: string | null })?.title ?? ''
    ).trim();
    let shareTypes = shareTypesParsed;

    if (shareTypes.length === 0 && lang.code !== 'cn') {
      const cnLang = await this.langService.findByCode('cn');
      if (cnLang) {
        const cnLayoutData = await this.websiteLayoutService.getLayoutData(
          cnLang.id,
          { configKeys: ['share-types'], includeProducts: false },
        );
        const cnCfg = cnLayoutData.configByKey['share-types'] ?? null;
        if (cnCfg) {
          const cnParsed = this.parseShareTypesForNews(
            (cnCfg as { content?: unknown })?.content,
          );
          if (cnParsed.length > 0) {
            shareTypes = cnParsed;
            shareModalTitle = (
              (cnCfg as { title?: string | null })?.title ?? ''
            ).trim();
          }
        }
      }
    }

    // 上一条 / 下一条
    const adjacent = await this.websiteNewsService.findAdjacentNews(
      langId || 0,
      news.newsId,
    );
    const newsBaseUrl = `${(basePath || '').replace(/\/+$/, '')}/news`;
    const newsPrev = adjacent.prev
      ? {
          title: adjacent.prev.title,
          url: `${newsBaseUrl}/${adjacent.prev.newsId}`,
        }
      : null;
    const newsNext = adjacent.next
      ? {
          title: adjacent.next.title,
          url: `${newsBaseUrl}/${adjacent.next.newsId}`,
        }
      : null;

    // 分享页面 URL
    const envBase = (process.env.SITE_URL || '').trim().replace(/\/+$/, '');
    const newsPath = `${newsBaseUrl}/${news.newsId}`.replace(/\/{2,}/g, '/');
    let sharePageUrl: string;
    if (envBase) {
      sharePageUrl = `${envBase}${newsPath.startsWith('/') ? newsPath : `/${newsPath}`}`;
    } else {
      const rawProto = req.headers['x-forwarded-proto'];
      const proto =
        typeof rawProto === 'string' && rawProto.trim()
          ? rawProto.split(',')[0].trim()
          : 'http';
      const host = (req.headers.host as string) || 'localhost';
      sharePageUrl = `${proto}://${host}${newsPath.startsWith('/') ? newsPath : `/${newsPath}`}`;
    }

    const pageTitle = (news.metaTitle && news.metaTitle.trim()) || news.title;
    const description =
      (news.metaDescription && news.metaDescription.trim()) || null;
    const keywords = (news.metaKeywords && news.metaKeywords.trim()) || null;

    return {
      notFound: false,
      viewName: 'website/news-detail',
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
      listUrl: `${basePath}/news`,
      news,
      publishAtFormatted: formatNewsDate(news.publishAt, dateLocale),
      pageViewPageType: 'news-detail',
      shareTypes,
      shareModalTitle,
      newsPrev,
      newsNext,
      sharePageUrl,
      ...commonData,
    };
  }

  private renderNewsDetail(reply: FastifyReply, ctx: Record<string, unknown>) {
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

  @Get('news/:newsId')
  async newsDetailRoot(
    @Param('newsId') newsIdParam: string,
    @Req() req: FastifyRequest,
    @Res() reply: FastifyReply,
  ) {
    const id = Number.parseInt(newsIdParam, 10);
    if (!Number.isFinite(id) || id < 1) {
      return (reply as any).code(404).send('Not found');
    }
    const ctx = await this.getNewsDetailPayload('', id, req);
    (req as any)[LOCALE_KEY] = ctx.locale;
    return this.renderNewsDetail(reply, ctx);
  }

  @Get(':locale/news/:newsId')
  async newsDetailLocale(
    @Param('locale') localeParam: string,
    @Param('newsId') newsIdParam: string,
    @Req() req: FastifyRequest,
    @Res() reply: FastifyReply,
  ) {
    const id = Number.parseInt(newsIdParam, 10);
    if (!Number.isFinite(id) || id < 1) {
      return (reply as any).code(404).send('Not found');
    }
    const pathLocale = (localeParam || '').toLowerCase();
    const ctx = await this.getNewsDetailPayload(pathLocale, id, req);
    (req as any)[LOCALE_KEY] = ctx.locale;
    return this.renderNewsDetail(reply, ctx);
  }
}
