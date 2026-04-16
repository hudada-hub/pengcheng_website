import {
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { LangService } from '../../i18n/lang.service';
import { WebsiteLayoutService } from './website-layout.service';
import { BaseWebsiteController, LOCALE_KEY } from './base-website.controller';
import type { LayoutCachePayload } from './website-layout.types';
import { WebsiteDownloadService } from './website-download.service';

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
  'download-texts',
  /** 搜索页文案（后台「搜索页文字」，key_name `seach-page-texts`） */
  'seach-page-texts',
  /** 联系表单各字段 label */
  'contact-us-labels',
  /** 联系表单提交按钮 */
  'submit',
];

function parsePositiveInt(raw: unknown): number | null {
  if (raw == null || raw === '') return null;
  const s = String(Array.isArray(raw) ? raw[0] : raw).trim();
  if (!s) return null;
  const n = Number.parseInt(s, 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function parseDownloadQuery(req: FastifyRequest): {
  page: number | null;
  tabRowId: number | null;
  seriesRowId: number | null;
  fileTypeRowId: number | null;
  docLangId: number | null;
} {
  const q = req.query as Record<string, unknown> | undefined;
  return {
    page: parsePositiveInt(q?.page),
    tabRowId: parsePositiveInt(q?.tab),
    seriesRowId: parsePositiveInt(q?.series),
    fileTypeRowId: parsePositiveInt(q?.fileType),
    docLangId: parsePositiveInt(q?.docLang),
  };
}

function langBadge(code: string | undefined): string {
  const c = (code || '').toLowerCase();
  const map: Record<string, string> = {
    en: 'EN',
    zh: 'ZH',
    cn: 'ZH',
    de: 'DE',
    fr: 'FR',
    jp: 'JP',
    ja: 'JA',
    ko: 'KO',
    it: 'IT',
  };
  return (
    map[c] ||
    (c.length >= 2 ? c.slice(0, 2).toUpperCase() : (c || '—').toUpperCase())
  );
}

interface DownloadTexts {
  searchResults: string;
  fileName: string;
  fileType: string;
  productType: string;
  language: string;
  download: string;
  noFiles: string;
  resultsFound: string;
}

@Controller()
export class DownloadController extends BaseWebsiteController {
  constructor(
    langService: LangService,
    websiteLayoutService: WebsiteLayoutService,
    private readonly websiteDownloadService: WebsiteDownloadService,
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
   * 下载页 SEO 不读全站 website-*；由当前 Tab 对应 download_category 行的 meta_* 决定。
   */
  getWebsiteTitle(
    _layoutData: LayoutCachePayload,
    isDomestic: boolean,
  ): string {
    return isDomestic ? '下载' : 'Download';
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

  private parseDownloadTexts(
    config: unknown,
    isDomestic: boolean,
  ): DownloadTexts {
    const defaults: DownloadTexts = {
      searchResults: isDomestic ? '搜索结果：' : 'Search Results:',
      fileName: isDomestic ? '文件名' : 'File Name',
      fileType: isDomestic ? '文件类型' : 'File Type',
      productType: isDomestic ? '产品类型' : 'Product Type',
      language: isDomestic ? '语言' : 'Language',
      download: isDomestic ? '下载' : 'Download',
      noFiles: isDomestic ? '暂无文件' : 'No files found.',
      resultsFound: isDomestic ? '条结果' : 'results found',
    };

    if (!config || typeof config !== 'object') return defaults;
    const cfg = config as {
      content?: Array<{ content?: string; title?: string }>;
    };
    if (!Array.isArray(cfg.content)) return defaults;

    const texts = { ...defaults };
    const arr = cfg.content;

    // 根据配置表中的顺序解析
    // [0] Search Results:, [1] File Name, [2] File Type, [3] Product Type, [4] Language, [5] Download
    if (arr[0]?.content) texts.searchResults = arr[0].content;
    if (arr[1]?.content) texts.fileName = arr[1].content;
    if (arr[2]?.content) texts.fileType = arr[2].content;
    if (arr[3]?.content) texts.productType = arr[3].content;
    if (arr[4]?.content) texts.language = arr[4].content;
    if (arr[5]?.content) texts.download = arr[5].content;

    return texts;
  }

  private buildDownloadPath(
    basePath: string,
    parts: {
      page?: number | null;
      tab?: number | null;
      series?: number | null;
      fileType?: number | null;
      docLang?: number | null;
    },
    defaultDocLangId: number,
  ): string {
    const p = new URLSearchParams();
    if (parts.page != null && parts.page > 1) p.set('page', String(parts.page));
    if (parts.tab != null && parts.tab > 0) p.set('tab', String(parts.tab));
    if (parts.series != null && parts.series > 0)
      p.set('series', String(parts.series));
    if (parts.fileType != null && parts.fileType > 0)
      p.set('fileType', String(parts.fileType));
    if (
      parts.docLang != null &&
      parts.docLang > 0 &&
      parts.docLang !== defaultDocLangId
    ) {
      p.set('docLang', String(parts.docLang));
    }
    const qs = p.toString();
    return `${basePath}/download${qs ? `?${qs}` : ''}`;
  }

  private async getDownloadPagePayload(
    pathLocale: string,
    req: FastifyRequest,
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

    const q = parseDownloadQuery(req);
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

    const tabs = await this.websiteDownloadService.listTabCategories(
      langId || 0,
    );
    const seriesOpts = await this.websiteDownloadService.listSeriesForLang(
      langId || 0,
    );
    const fileTypeOpts = await this.websiteDownloadService.listFileTypesForLang(
      langId || 0,
    );
    const langOpts = await this.websiteDownloadService.listActiveLangs();

    const defaultDocLangId = langId || 0;
    let docLangId = q.docLangId ?? defaultDocLangId;
    if (!langOpts.some((l) => l.id === docLangId)) {
      docLangId = defaultDocLangId;
    }
    let activeTabRowId = q.tabRowId;
    if (
      tabs.length &&
      (activeTabRowId == null || !tabs.some((t) => t.id === activeTabRowId))
    ) {
      activeTabRowId = tabs[0].id;
    }

    const activeTab = tabs.find((t) => t.id === activeTabRowId) ?? null;
    const categoryGroupId = activeTab
      ? this.websiteDownloadService.categoryGroupId(activeTab)
      : null;

    let seriesGroupId: number | null = null;
    if (q.seriesRowId != null) {
      const row =
        seriesOpts.find((s) => s.id === q.seriesRowId) ??
        (await this.websiteDownloadService.findSeriesRowForLang(
          q.seriesRowId,
          langId || 0,
        ));
      seriesGroupId = row
        ? this.websiteDownloadService.seriesGroupId(row)
        : null;
    }

    let fileTypeGroupId: number | null = null;
    if (q.fileTypeRowId != null) {
      const row =
        fileTypeOpts.find((f) => f.id === q.fileTypeRowId) ??
        (await this.websiteDownloadService.findFileTypeRowForLang(
          q.fileTypeRowId,
          langId || 0,
        ));
      fileTypeGroupId = row
        ? this.websiteDownloadService.fileTypeGroupId(row)
        : null;
    }

    const invalidSeriesFilter = q.seriesRowId != null && seriesGroupId === null;
    const invalidFileTypeFilter =
      q.fileTypeRowId != null && fileTypeGroupId === null;

    const PAGE_SIZE = 10;
    const currentPage = Math.max(1, q.page ?? 1);

    const downloadsResult =
      invalidSeriesFilter || invalidFileTypeFilter
        ? { rows: [], total: 0 }
        : await this.websiteDownloadService.findPublicDownloads({
            docLangId,
            categoryGroupId,
            seriesGroupId,
            fileTypeGroupId,
            page: currentPage,
            pageSize: PAGE_SIZE,
          });

    const downloads = downloadsResult.rows;
    const totalDownloads = downloadsResult.total;
    const totalPages = Math.max(1, Math.ceil(totalDownloads / PAGE_SIZE));

    const dl = (parts: {
      page?: number | null;
      tab?: number | null;
      series?: number | null;
      fileType?: number | null;
      docLang?: number | null;
    }) => this.buildDownloadPath(basePath, parts, defaultDocLangId);

    const tabLinks = tabs.map((t) => ({
      id: t.id,
      name: t.name,
      url: dl({
        tab: t.id,
        series: q.seriesRowId,
        fileType: q.fileTypeRowId,
        docLang: docLangId,
      }),
      active: t.id === activeTabRowId,
    }));

    const seriesLinks = [
      {
        id: null as number | null,
        name: null,
        url: dl({
          tab: activeTabRowId,
          series: null,
          fileType: q.fileTypeRowId,
          docLang: docLangId,
        }),
        active: q.seriesRowId == null,
      },
      ...seriesOpts.map((s) => ({
        id: s.id,
        name: s.name,
        url: dl({
          tab: activeTabRowId,
          series: s.id,
          fileType: q.fileTypeRowId,
          docLang: docLangId,
        }),
        active: q.seriesRowId === s.id,
      })),
    ];

    const fileTypeLinks = [
      {
        id: null as number | null,
        name: null,
        url: dl({
          tab: activeTabRowId,
          series: q.seriesRowId,
          fileType: null,
          docLang: docLangId,
        }),
        active: q.fileTypeRowId == null,
      },
      ...fileTypeOpts.map((f) => ({
        id: f.id,
        name: f.name,
        url: dl({
          tab: activeTabRowId,
          series: q.seriesRowId,
          fileType: f.id,
          docLang: docLangId,
        }),
        active: q.fileTypeRowId === f.id,
      })),
    ];

    const langLinks = langOpts.map((l) => ({
      id: l.id,
      name: l.langFullName || l.name,
      code: l.code,
      url: dl({
        tab: activeTabRowId,
        series: q.seriesRowId,
        fileType: q.fileTypeRowId,
        docLang: l.id,
      }),
      active: l.id === docLangId,
    }));

    const resultRows = downloads.map((d) => ({
      id: d.id,
      fileName: d.fileName,
      fileTypeLabel:
        d.downloadFileType?.name?.trim() ||
        (d.fileType && String(d.fileType).trim()) ||
        '—',
      productTypeLabel:
        d.series?.name?.trim() ||
        (d.productType && String(d.productType).trim()) ||
        '—',
      langBadge: langBadge(d.lang?.code),
      downloadUrl: d.downloadUrl,
    }));

    // 处理 download-texts 配置
    const downloadTextsConfig = layoutData.configByKey['download-texts'];
    const downloadTexts = this.parseDownloadTexts(
      downloadTextsConfig,
      isDomestic,
    );

    const fallbackTitle = this.getWebsiteTitle(layoutData, isDomestic);
    let documentTitle: string;
    let description: string | null;
    let keywords: string | null;
    if (activeTab) {
      documentTitle =
        (activeTab.metaTitle && activeTab.metaTitle.trim()) || activeTab.name;
      description =
        (activeTab.metaDescription && activeTab.metaDescription.trim()) || null;
      keywords =
        (activeTab.metaKeywords && activeTab.metaKeywords.trim()) || null;
    } else {
      documentTitle = fallbackTitle;
      description = null;
      keywords = null;
    }

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
      viewName: 'website/download',
      pageViewPageType: 'download',
      tabLinks,
      seriesLinks,
      fileTypeLinks,
      langLinks,
      resultRows,
      resultCount: resultRows.length,
      downloadTexts,
      pagination: this.buildWebsiteListPagination({
        currentPage,
        totalPages,
        totalItems: totalDownloads,
        makeUrl: (p) =>
          dl({
            page: p,
            tab: q.tabRowId,
            series: q.seriesRowId,
            fileType: q.fileTypeRowId,
            docLang: docLangId,
          }),
        isDomestic,
      }),
      ...commonData,
    };
  }

  @Get('download')
  async downloadPage(@Req() req: FastifyRequest, @Res() reply: FastifyReply) {
    const ctx = await this.getDownloadPagePayload('', req);
    (req as any)[LOCALE_KEY] = ctx.locale;
    return (reply as any).view(ctx.viewName, ctx);
  }

  @Get(':locale/download')
  async downloadPageLocale(
    @Param('locale') localeParam: string,
    @Req() req: FastifyRequest,
    @Res() reply: FastifyReply,
  ) {
    const pathLocale = (localeParam || '').toLowerCase();
    const ctx = await this.getDownloadPagePayload(pathLocale, req);
    (req as any)[LOCALE_KEY] = ctx.locale;
    return (reply as any).view(ctx.viewName, ctx);
  }

  /** 前台点击下载时上报：写入 download_file_record，并递增 download.download_count */
  @Post('api/download-file-record')
  async recordDownloadFile(
    @Req() req: FastifyRequest,
    @Body() body: { downloadId?: unknown; fromPageUrl?: unknown },
  ) {
    const rawId = body?.downloadId;
    const downloadRowId =
      typeof rawId === 'string'
        ? parseInt(rawId, 10)
        : typeof rawId === 'number'
          ? rawId
          : NaN;
    const fromPageUrl = this.websiteDownloadService.sanitizeFromPageUrl(
      body?.fromPageUrl,
    );
    const session = (
      req as FastifyRequest & { session?: { memberId?: number } }
    ).session;
    const memberId = session?.memberId;
    const userId =
      typeof memberId === 'number' && memberId > 0 ? memberId : null;
    const uaHdr = req.headers['user-agent'];
    const userAgent =
      typeof uaHdr === 'string'
        ? uaHdr
        : Array.isArray(uaHdr)
          ? (uaHdr[0] ?? null)
          : null;
    const result = await this.websiteDownloadService.recordPublicDownload({
      downloadRowId,
      fromPageUrl,
      userId,
      userAgent,
    });
    if (result.ok) return { ok: true };
    return { ok: false, reason: result.reason };
  }
}
