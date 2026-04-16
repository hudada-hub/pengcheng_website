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
import { getResourceNotFoundCopy } from '../../common/utils/website-not-found-messages';
import type { LayoutCachePayload, MenuTreeItem } from './website-layout.types';
import { ActivityCalendarService } from './activity-calendar.service';
import type { Config } from '../../entities/config.entity';

const ACTIVITY_CALENDAR_SEGMENT = 'activity-calendar';

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
  'activity-texts',
  /** 搜索页文案（后台「搜索页文字」，key_name `seach-page-texts`） */
  'seach-page-texts',
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

function formatActivityDateRange(
  start: Date | null | undefined,
  end: Date | null | undefined,
  localeTag: string,
): string {
  if (!start) return '';
  try {
    const s = new Date(start);
    const e = end ? new Date(end) : null;
    if (!e || s.getTime() === e.getTime()) {
      return new Intl.DateTimeFormat(localeTag, {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      }).format(s);
    }
    const fmt = new Intl.DateTimeFormat(localeTag, {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
    if (
      typeof (
        fmt as Intl.DateTimeFormat & {
          formatRange?: (a: Date, b: Date) => string;
        }
      ).formatRange === 'function'
    ) {
      return (
        fmt as Intl.DateTimeFormat & {
          formatRange: (a: Date, b: Date) => string;
        }
      ).formatRange(s, e);
    }
    const a = new Intl.DateTimeFormat(localeTag, {
      day: 'numeric',
      month: 'long',
    }).format(s);
    const b = new Intl.DateTimeFormat(localeTag, {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    }).format(e);
    return `${a} – ${b}`;
  } catch {
    return String(start);
  }
}

@Controller()
export class ActivityCalendarController extends BaseWebsiteController {
  constructor(
    langService: LangService,
    websiteLayoutService: WebsiteLayoutService,
    private readonly activityCalendarService: ActivityCalendarService,
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
   * 活动日历列表/详情不读全站 website-*。activity_calendar 表暂无 meta 字段，列表用栏目名，详情用活动标题。
   */
  getWebsiteTitle(
    _layoutData: LayoutCachePayload,
    isDomestic: boolean,
  ): string {
    return isDomestic ? '品牌活动' : 'Brand Events';
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

  private intlLocaleForActivityCalendar(langCode: string): string {
    const c = (langCode || 'en').toLowerCase();
    if (c === 'cn' || c === 'zh') return 'zh-CN';
    if (c === 'jp' || c === 'ja') return 'ja-JP';
    if (c === 'kr' || c === 'ko') return 'ko-KR';
    if (c === 'de') return 'de-DE';
    if (c === 'fr') return 'fr-FR';
    if (c === 'it') return 'it-IT';
    return 'en-US';
  }

  private buildActivityCalendarListPath(
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
    return `${basePath}/${ACTIVITY_CALENDAR_SEGMENT}${qs ? `?${qs}` : ''}`;
  }

  private expectedActivityCalendarListPublicPath(basePath: string): string {
    const p = (basePath || '').replace(/\/+$/, '');
    return p
      ? `${p}/${ACTIVITY_CALENDAR_SEGMENT}`
      : `/${ACTIVITY_CALENDAR_SEGMENT}`;
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

  /**
   * 活动日历列表文案配置：key_name = activity-texts（is_array=1）
   * 下标：0=Visit Event、1=Event Details（按钮）、2=Event Details（弹窗标题）
   */
  private getActivityCalendarTexts(
    cfg: Config | null,
    isZh: boolean,
  ): {
    visitEvent: string;
    eventDetails: string;
    modalTitle: string;
    modalDate: string;
    modalLocation: string;
    modalClose: string;
  } {
    const fallback = {
      visitEvent: isZh ? '访问活动' : 'Visit activity',
      eventDetails: isZh ? '活动详情' : 'Event details',
      modalTitle: isZh ? '活动详情' : 'Event details',
      modalDate: isZh ? '日期' : 'Date',
      modalLocation: isZh ? '地点' : 'Location',
      modalClose: isZh ? '关闭' : 'Close',
    };
    if (!cfg || !Array.isArray(cfg.content)) return fallback;

    const rows = cfg.content as Record<string, unknown>[];
    const pick = (idx: number, def: string) => {
      const row = rows[idx];
      if (!row || typeof row !== 'object') return def;
      const c = typeof row.content === 'string' ? row.content.trim() : '';
      if (c) return c;
      const t = typeof row.title === 'string' ? row.title.trim() : '';
      if (t) return t;
      const d =
        typeof row.description === 'string' ? row.description.trim() : '';
      if (d) return d;
      return def;
    };

    const detailsText = pick(1, fallback.eventDetails);
    return {
      visitEvent: pick(0, fallback.visitEvent),
      eventDetails: detailsText,
      modalTitle: pick(2, detailsText || fallback.modalTitle),
      modalDate: fallback.modalDate,
      modalLocation: fallback.modalLocation,
      modalClose: fallback.modalClose,
    };
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

  private async getActivityCalendarListPagePayload(
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
    const dateLocale = this.intlLocaleForActivityCalendar(lang.code);
    const isZh = lang.code === 'cn';

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
      this.activityCalendarService.listDistinctYears(langId || 0),
      this.getLayoutData(langId || 0, { configKeys: LAYOUT_CONFIG_KEYS }),
    ]);

    const monthsForYear =
      year != null
        ? await this.activityCalendarService.listDistinctMonthsForYear(
            langId || 0,
            year,
          )
        : [];

    const total = await this.activityCalendarService.countFiltered({
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
    const rows = await this.activityCalendarService.findPage(filters);

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
    const activityTextCfg = layoutData.configByKey['activity-texts'] ?? null;
    const activityTexts = this.getActivityCalendarTexts(activityTextCfg, isZh);

    const cardItems = rows.map((ev) => {
      const urlId =
        ev.activityCalendarId != null && ev.activityCalendarId > 0
          ? ev.activityCalendarId
          : ev.id;
      const ext = (ev.url || '').trim();
      return {
        title: ev.title || (isZh ? '未命名活动' : 'Untitled'),
        thumbUrl: ev.thumbUrl,
        dateRangeFormatted: formatActivityDateRange(
          ev.eventDateStart,
          ev.eventDateEnd,
          dateLocale,
        ),
        location: ev.location || '',
        contentHtml: ev.content || '',
        externalUrl: ext || null,
        hasExternal: !!ext,
        detailUrl: `${basePath}/${ACTIVITY_CALENDAR_SEGMENT}/${urlId}`,
        urlId,
      };
    });

    const mkListPath = (o: {
      year?: number | null;
      month?: number | null;
      page?: number;
    }) => this.buildActivityCalendarListPath(basePath, { ...o, pageSize });

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

    const allEventsUrl = mkListPath({ year: null, month: null, page: 1 });
    const monthClearUrl =
      year != null ? mkListPath({ year, month: null, page: 1 }) : allEventsUrl;

    const menus = layoutData.menus || [];
    const menuActivity = this.findMenuByPublicPath(
      menus,
      basePath,
      this.expectedActivityCalendarListPublicPath(basePath),
    );
    const pageHeadingFromMenu = menuActivity?.bannerTitle?.trim() || '';
    const pageHeadingDefault = isZh ? '活动日历' : 'Activity Calendar33';
    const seoTitleFromMenu = menuActivity?.metaTitle?.trim() || '';
    const seoDescriptionFromMenu = menuActivity?.metaDescription?.trim() || '';
    const seoKeywordsFromMenu = menuActivity?.metaKeywords?.trim() || '';

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
      viewName: 'website/activity-calendar',
      pageViewPageType: 'activity-calendar',
      cardItems,
      yearOptions,
      monthOptions,
      selectedYear: year,
      selectedMonth: month,
      allEventsUrl,
      monthClearUrl,
      pagination,
      labels: {
        pageHeading: pageHeadingFromMenu || pageHeadingDefault,
        filterTitle: isZh ? '筛选' : 'Filter',
        filterYear: isZh ? '年份' : 'Year',
        filterMonth: isZh ? '月份' : 'Month',
        allYears: isZh ? '全部' : 'All',
        allMonths: isZh ? '全部' : 'All',
        visitEvent: activityTexts.visitEvent,
        eventDetails: activityTexts.eventDetails,
        modalTitle: activityTexts.modalTitle,
        modalDate: activityTexts.modalDate,
        modalLocation: activityTexts.modalLocation,
        modalClose: activityTexts.modalClose,
        empty: isZh ? '暂无活动' : 'No activities yet.',
        prev: isZh ? '上一页' : 'Previous',
        next: isZh ? '下一页' : 'Next',
        pageOf: isZh ? '第' : 'Page',
      },
      ...commonData,
    };
  }

  @Get(ACTIVITY_CALENDAR_SEGMENT)
  async activityCalendarListRoot(
    @Req() req: FastifyRequest,
    @Res() reply: FastifyReply,
  ) {
    const ctx = await this.getActivityCalendarListPagePayload('', req);
    (req as any)[LOCALE_KEY] = ctx.locale;
    return (reply as any).view(ctx.viewName, ctx);
  }

  @Get(`:locale/${ACTIVITY_CALENDAR_SEGMENT}`)
  async activityCalendarListLocale(
    @Param('locale') localeParam: string,
    @Req() req: FastifyRequest,
    @Res() reply: FastifyReply,
  ) {
    const pathLocale = (localeParam || '').toLowerCase();
    const ctx = await this.getActivityCalendarListPagePayload(pathLocale, req);
    (req as any)[LOCALE_KEY] = ctx.locale;
    return (reply as any).view(ctx.viewName, ctx);
  }

  private async getActivityCalendarDetailPayload(
    pathLocale: string,
    paramId: number,
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
    const dateLocale = this.intlLocaleForActivityCalendar(lang.code);
    const isZh = lang.code === 'cn';

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

    const listPath = `${basePath}/${ACTIVITY_CALENDAR_SEGMENT}`;

    const event = await this.activityCalendarService.findPublishedDetail(
      langId || 0,
      paramId,
    );
    if (!event) {
      const rf = getResourceNotFoundCopy(lang.code, 'activity');
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
        listUrl: listPath,
        notFoundHint: rf.hint,
        notFoundBackLabel: rf.back,
        notFoundBodyClass: 'g-activity-calendar-detail-page',
        notFoundStylesheets: ['/css/global/events-global.css'],
        pageViewPageType: 'activity-calendar-not-found',
        ...commonData404,
      };
    }

    const pageTitle = event.title || (isZh ? '活动详情' : 'Activity details');
    const ext = (event.url || '').trim();

    return {
      notFound: false,
      viewName: 'website/activity-calendar-detail',
      locale,
      langId,
      isDomestic,
      basePath,
      localeCodes: codes,
      pathLocale: effectivePathLocale,
      title: pageTitle,
      description: null,
      keywords: null,
      logoUrl: logoUrl404,
      navItems: navItems404,
      categoryTree: categoryTree404,
      listUrl: listPath,
      event,
      dateRangeFormatted: formatActivityDateRange(
        event.eventDateStart,
        event.eventDateEnd,
        dateLocale,
      ),
      externalUrl: ext || null,
      hasExternal: !!ext,
      labels: {
        backToList: isZh ? '返回活动日历' : 'Back to activity calendar',
        visitEvent: isZh ? '访问活动' : 'Visit activity',
      },
      pageViewPageType: 'activity-calendar-detail',
      ...commonData404,
    };
  }

  private renderActivityCalendarDetail(
    reply: FastifyReply,
    ctx: Record<string, unknown>,
  ) {
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

  @Get(`${ACTIVITY_CALENDAR_SEGMENT}/:eventId`)
  async activityCalendarDetailRoot(
    @Param('eventId') eventIdParam: string,
    @Req() req: FastifyRequest,
    @Res() reply: FastifyReply,
  ) {
    const id = Number.parseInt(eventIdParam, 10);
    if (!Number.isFinite(id) || id < 1) {
      return (reply as any).code(404).send('Not found');
    }
    const ctx = await this.getActivityCalendarDetailPayload('', id);
    (req as any)[LOCALE_KEY] = ctx.locale;
    return this.renderActivityCalendarDetail(reply, ctx);
  }

  @Get(`:locale/${ACTIVITY_CALENDAR_SEGMENT}/:eventId`)
  async activityCalendarDetailLocale(
    @Param('locale') localeParam: string,
    @Param('eventId') eventIdParam: string,
    @Req() req: FastifyRequest,
    @Res() reply: FastifyReply,
  ) {
    const id = Number.parseInt(eventIdParam, 10);
    if (!Number.isFinite(id) || id < 1) {
      return (reply as any).code(404).send('Not found');
    }
    const pathLocale = (localeParam || '').toLowerCase();
    const ctx = await this.getActivityCalendarDetailPayload(pathLocale, id);
    (req as any)[LOCALE_KEY] = ctx.locale;
    return this.renderActivityCalendarDetail(reply, ctx);
  }
}
