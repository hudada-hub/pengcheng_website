import {
  Controller,
  Get,
  Logger,
  Param,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import type { FastifyReply, FastifyRequest } from 'fastify';
import type { Menu } from '../../entities/menu.entity';
import type { ProductCategory } from '../../entities/product-category.entity';
import type { Config } from '../../entities/config.entity';
import { News } from '../../entities/news.entity';
import { ActivityCalendar } from '../../entities/activity-calendar.entity';
import { LangService } from '../../i18n/lang.service';
import { WebsiteLayoutService } from './website-layout.service';
import {
  BaseWebsiteController,
  LOCALE_KEY,
  type WebsitePageContext,
} from './base-website.controller';
import type { LayoutCachePayload } from './website-layout.types';
import { Product } from 'src/entities/product.entity';
import { Solution } from '../../entities/solution.entity';
import { IndustryCase } from '../../entities/industry-case.entity';
import { ContactMessage } from '../../entities/contact-message.entity';
import { Status } from '../../common/entities/base.entity';
import { CsrfGuard } from '../../common/guards/csrf.guard';
import { WebsiteNotFoundViewService } from './website-not-found-view.service';
import { MailService } from '../mail/mail.service';

const DEFAULT_CODES = ['en', 'cn', 'jp'];
/** 业务领域区块：与 `business-areas` 配置 content 数组下标默认对应的详情配置 key（可再在 JSON 条目中写 keyName 覆盖） */
const BUSINESS_AREA_DETAIL_KEYS = [
  'motive-battery',
  'energy-storage',
  'construction-machinery',
] as const;

const LAYOUT_CONFIG_KEYS = [
  'logo',
  'website-title',
  'website-description',
  'website-keywords',
  'home-carousel',
  'advantage',
  'our-customers',
  'business-areas',
  'motive-battery',
  'energy-storage',
  'construction-machinery',
  'about-us',
  'contact-us',
  /** 首页联系表单各字段 label，is_array=1，每项 content 为文案 */
  'contact-us-labels',
  /** 首页联系表单提交按钮，type 1，content.content */
  'submit',
  /** 首页留言 AJAX 提交成功右上角提示，type 1，content.content */
  'contact-us-success-text',
  'followus',
  'footer-aboutus',
  'footer-phone',
  'footer-beian',
  /** 首页轮播 CTA 文案（type 1，content JSON 的 content / title） */
  'learn-more',
  /** 首页 About「阅读更多」文案（type 1，content JSON 的 content） */
  'readmore',
  /** 新闻与活动标题（type 1，content JSON 的 content） */
  'news-events',
  /** 搜索页文案（后台「搜索页文字」，key_name `seach-page-texts`） */
  'seach-page-texts',
];

@Controller()
export class HomeController extends BaseWebsiteController {
  constructor(
    langService: LangService,
    websiteLayoutService: WebsiteLayoutService,
    private readonly websiteNotFoundViewService: WebsiteNotFoundViewService,
    private readonly mailService: MailService,
    @InjectRepository(News)
    private readonly newsRepo: Repository<News>,
    @InjectRepository(ActivityCalendar)
    private readonly activityCalendarRepo: Repository<ActivityCalendar>,
    @InjectRepository(ContactMessage)
    private readonly contactMessageRepo: Repository<ContactMessage>,
    @InjectRepository(Product)
    private readonly productRepo: Repository<Product>,
    @InjectRepository(Solution)
    private readonly solutionRepo: Repository<Solution>,
    @InjectRepository(IndustryCase)
    private readonly industryCaseRepo: Repository<IndustryCase>,
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
    return this.websiteLayoutService.getLayoutData(langId, options);
  }

  getWebsiteTitle(
    layoutData: LayoutCachePayload,
    _isDomestic: boolean,
  ): string {
    const cfg = layoutData.configByKey['website-title'] ?? null;
    return this.getTextFromConfig(cfg, 'title') ?? '鹏成官网';
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

  /** 从配置中解析轮播图项 */
  getCarouselItems(config: Config | null): Array<{
    picUrl: string;
    title: string;
    description: string;
    url: string;
  }> {
    if (!config) return [];
    const content = config.content;
    if (!content) return [];
    const items = Array.isArray(content) ? content : [content];
    return items
      .filter((item) => item && typeof item === 'object')
      .map((item) => ({
        picUrl: (item as any).pic1Url || (item as any).picUrl || '',
        title: (item as any).title || '',
        description: (item as any).description || '',
        url: (item as any).url || '',
      }))
      .filter((item) => item.picUrl);
  }

  /** 从配置中解析优势展示项 */
  getAdvantageItems(config: Config | null): Array<{
    picUrl: string;
    pic1Url: string;
    title: string;
    subtitle: string;
    description: string;
    subDescription: string;
    url: string;
  }> {
    if (!config) return [];
    const content = config.content;
    if (!content) return [];
    const items = Array.isArray(content) ? content : [content];
    return items
      .filter((item) => item && typeof item === 'object')
      .map((item) => ({
        picUrl: (item as any).pic1Url || (item as any).picUrl || '',
        pic1Url: (item as any).pic1Url || '',
        title: (item as any).title || '',
        subtitle: (item as any).subtitle || '',
        description: (item as any).description || '',
        subDescription: (item as any).subDescription || '',
        url: (item as any).url || '',
      }))
      .filter((item) => item.picUrl);
  }

  /** 从配置中解析关于我们数据；readmore 为配置 key `readmore`（可选） */
  getAboutUs(
    config: Config | null,
    readmoreConfig: Config | null = null,
  ): {
    title: string;
    description: string;
    bgPicUrl: string;
    videoUrl: string;
    readMoreLabel: string;
    stats: Array<{
      value: string;
      label: string;
    }>;
  } {
    const readMoreLabel =
      this.getTextFromConfig(readmoreConfig, 'title')?.trim() ||
      this.getTextFromConfig(readmoreConfig, 'description')?.trim() ||
      'Read more';
    if (!config) {
      return {
        title: '',
        description: '',
        bgPicUrl: '',
        videoUrl: '',
        readMoreLabel,
        stats: [],
      };
    }
    const content = config.content;
    const items = Array.isArray(content) ? content : [];
    return {
      title: config.title || '',
      description: config.description || '',
      bgPicUrl: config.bgPicUrl || '',
      videoUrl: config.videoUrl || '',
      readMoreLabel,
      stats: items
        .filter((item) => item && typeof item === 'object')
        .map((item) => ({
          value: (item as any).title || '',
          label: (item as any).description || '',
        }))
        .filter((item) => item.value),
    };
  }

  /** 从配置中解析业务区域数据 */
  getBusinessArea(config: Config | null): {
    title: string;
    description: string;
    bgPicUrl: string;
    items: Array<{
      picUrl: string;
      title: string;
      content: string;
      url: string;
    }>;
  } {
    if (!config) {
      return { title: '', description: '', bgPicUrl: '', items: [] };
    }
    const content = config.content;
    const items = Array.isArray(content) ? content : [];
    return {
      title: config.title || '',
      description: config.description || '',
      bgPicUrl: config.bgPicUrl || '',
      items: items
        .filter((item) => item && typeof item === 'object')
        .map((item) => ({
          picUrl: (item as any).pic1Url || (item as any).picUrl || '',
          title: (item as any).title || '',
          content: (item as any).content || '',
          url: (item as any).url || '',
        }))
        .filter((item) => item.picUrl),
    };
  }

  /**
   * 首页「业务领域与应用场景」：区块标题与 Tab 文案来自 config `business-areas`（数组 content）；
   * 各 Tab 下详情仍来自 motive-battery / energy-storage / construction-machinery 等配置，
   * 默认按下标对应；可在 content 条目中设 `keyName` 指定详情配置的 key_name。
   */
  buildBusinessAreasSection(
    metaConfig: Config | null,
    configByKey: Record<string, Config | null>,
    productCategories: ProductCategory[] = [],
  ): {
    sectionTitle: string;
    areas: Array<{
      key: string;
      label: string;
      data: ReturnType<HomeController['getBusinessArea']>;
    }>;
  } {
    const sectionTitle = (metaConfig?.title ?? '').trim();
    const areas: Array<{
      key: string;
      label: string;
      data: ReturnType<HomeController['getBusinessArea']>;
    }> = [];

    // 从 config 的 content 字段获取标签
    if (metaConfig?.content) {
      const raw = Array.isArray(metaConfig.content) ? metaConfig.content : [];
      raw.forEach((row, index) => {
        if (!row || typeof row !== 'object') return;
        const o = row as Record<string, unknown>;
        const label = String(o.content ?? o.title ?? '').trim();
        if (!label) return;

        const keyNameRaw = o.keyName ?? o.detailKey;
        const detailKey =
          typeof keyNameRaw === 'string' && keyNameRaw.trim()
            ? keyNameRaw.trim()
            : (BUSINESS_AREA_DETAIL_KEYS[index] ?? `business-area-${index}`);

        const tabKeyRaw = o.key;
        const key =
          typeof tabKeyRaw === 'string' && tabKeyRaw.trim()
            ? tabKeyRaw.trim()
            : /^[a-z0-9-]+$/i.test(detailKey)
              ? detailKey
              : `ba-${index}`;

        areas.push({
          key,
          label,
          data: this.getBusinessArea(configByKey[detailKey] ?? null),
        });
      });
    }

    return { sectionTitle, areas };
  }

  /** 从配置中解析客户 Logo 列表 */
  getCustomerLogos(config: Config | null): Array<{
    url: string;
    name: string;
    active: boolean;
  }> {
    if (!config) return [];
    const content = config.content;
    if (!content) return [];
    const items = Array.isArray(content) ? content : [content];
    return items
      .filter((item) => item && typeof item === 'object')
      .map((item, index) => ({
        url: (item as any).pic1Url || (item as any).picUrl || '',
        name: (item as any).title || `Customer ${index + 1}`,
        active: index === 0, // 第一个默认激活
      }))
      .filter((item) => item.url);
  }

  /** 查询置顶新闻列表（按发布时间倒序，取前10条） */
  async getNewsList(langId: number): Promise<
    Array<{
      id: number;
      newsUrlId: number;
      title: string;
      thumbUrl: string | null;
      publishAt: Date | null;
      summary: string | null;
    }>
  > {
    const news = await this.newsRepo.find({
      where: { langId, status: 1, isTop: 1 },
      order: { publishAt: 'DESC' },
      take: 10,
    });
    return news.map((n) => ({
      id: n.id,
      newsUrlId: n.newsId && n.newsId > 0 ? n.newsId : n.id,
      title: n.title,
      thumbUrl: n.thumbUrl,
      publishAt: n.publishAt,
      summary: n.summary,
    }));
  }

  /** 查询置顶活动日历列表（按开始日期倒序，取前10条） */
  async getActivityCalendarList(langId: number): Promise<
    Array<{
      id: number;
      activityUrlId: number;
      title: string;
      location: string | null;
      eventDateStart: Date | null;
      eventDateEnd: Date | null;
      url: string | null;
    }>
  > {
    const activities = await this.activityCalendarRepo.find({
      where: { langId, status: 1, isTop: 1 },
      order: { eventDateStart: 'DESC' },
      take: 10,
    });
    return activities.map((a) => ({
      id: a.id,
      activityUrlId:
        a.activityCalendarId != null && a.activityCalendarId > 0
          ? a.activityCalendarId
          : a.id,
      title: a.title || '',
      location: a.location,
      eventDateStart: a.eventDateStart,
      eventDateEnd: a.eventDateEnd,
      url: a.url,
    }));
  }

  private trimContactField(v: unknown, maxLen: number): string | null {
    if (v == null) return null;
    const s = String(v).trim().replace(/\0/g, '');
    if (!s) return null;
    return s.length > maxLen ? s.slice(0, maxLen) : s;
  }

  private isPlausibleEmail(s: string): boolean {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
  }

  /** 提交后跳回同站 Referer，避免开放重定向 */
  private safeContactRedirectTarget(
    req: FastifyRequest,
    basePath: string,
  ): string {
    const fallback =
      `${(basePath || '').replace(/\/+$/, '')}/`.replace(/\/{2,}/g, '/') || '/';
    const raw = req.headers.referer;
    if (typeof raw !== 'string' || !raw.trim()) return fallback;
    try {
      const u = new URL(raw.trim());
      const host = req.headers.host;
      if (host && u.host === host) {
        return u.pathname + u.search + u.hash;
      }
    } catch {
      /* ignore */
    }
    return fallback;
  }

  @Post('contact')
  @UseGuards(CsrfGuard)
  async submitContactDefault(
    @Req() req: FastifyRequest,
    @Res() reply: FastifyReply,
  ) {
    return this.handleContactFormPost(req, reply, '');
  }

  @Post(':locale/contact')
  @UseGuards(CsrfGuard)
  async submitContactLocale(
    @Param('locale') localeParam: string,
    @Req() req: FastifyRequest,
    @Res() reply: FastifyReply,
  ) {
    return this.handleContactFormPost(
      req,
      reply,
      (localeParam || '').toLowerCase(),
    );
  }

  /** 首页联系表 AJAX 提交：请求 JSON 时返回 JSON、不整页跳转 */
  private wantsContactJsonResponse(req: FastifyRequest): boolean {
    const accept = (req.headers.accept || '').toLowerCase();
    return accept.includes('application/json');
  }

  private async handleContactFormPost(
    req: FastifyRequest,
    reply: FastifyReply,
    pathLocale: string,
  ) {
    const asJson = this.wantsContactJsonResponse(req);
    const lang = await this.langService.findByCodeForRoute(pathLocale || 'en');
    if (!lang) {
      if (asJson)
        return reply
          .code(404)
          .type('application/json')
          .send({ ok: false, message: 'Not found' });
      return reply.code(404).type('text/plain').send('Not found');
    }
    const langCode = (lang.code || 'en').toLowerCase();
    const isZh = langCode === 'cn';
    const successLayout = await this.websiteLayoutService.getLayoutData(
      lang.id,
      {
        configKeys: ['contact-us-success-text'],
      },
    );
    const msgSuccess = this.getContactUsSuccessText(successLayout, langCode);
    const msgInvalid = isZh
      ? '请填写有效的姓名与邮箱。'
      : 'Please enter a valid name and email address.';

    const basePath = lang.code === 'en' ? '' : `/${lang.code}`;
    const body = (req.body as Record<string, unknown>) || {};
    // 支持 fullName 或 firstName + lastName
    let fullName = this.trimContactField(body.fullName, 128);
    if (!fullName) {
      const firstName = this.trimContactField(body.firstName, 64) || '';
      const lastName = this.trimContactField(body.lastName, 64) || '';
      fullName = `${firstName} ${lastName}`.trim() || null;
    }
    const email = this.trimContactField(body.email, 128);
    const redirectTo = this.safeContactRedirectTarget(req, basePath);
    if (!fullName || !email || !this.isPlausibleEmail(email)) {
      if (asJson) {
        return reply
          .code(400)
          .type('application/json')
          .send({ ok: false, message: msgInvalid });
      }
      const sep = redirectTo.includes('?') ? '&' : '?';
      return reply.redirect(`${redirectTo}${sep}contact=invalid`, 303);
    }
    const session = (
      req as FastifyRequest & { session?: { memberId?: number } }
    ).session;
    const memberId = session?.memberId;
    const row = this.contactMessageRepo.create({
      fullName,
      email,
      nation: this.trimContactField(body.nation, 128),
      locationCity: this.trimContactField(body.location, 255),
      phoneNumber: this.trimContactField(body.phone, 64),
      message: this.trimContactField(body.question, 65535),
      userId: typeof memberId === 'number' && memberId > 0 ? memberId : null,
      sourceUrl: this.trimContactField(body.sourceUrl, 512),
      status: Status.Normal,
    });
    await this.contactMessageRepo.save(row);

    // 发送邮件通知销售
    try {
      // 从请求中获取 baseUrl（包含端口号）
      const protocol = (req as any).protocol || 'http';
      const hostname = (req as any).hostname || 'localhost';
      const port =
        (req as any).port || (req as any).headers?.host?.split(':')[1] || '';
      const baseUrl =
        port && port !== '80' && port !== '443'
          ? `${protocol}://${hostname}:${port}`
          : `${protocol}://${hostname}`;
      await this.mailService.sendContactEmail({
        contactId: row.id,
        fullName: row.fullName || '',
        email: row.email || '',
        nation: row.nation,
        locationCity: row.locationCity,
        phoneNumber: row.phoneNumber,
        message: row.message,
        createdAt: row.createdAt,
        baseUrl,
      });
    } catch (error) {
      console.error('发送联系表单邮件失败:', error);
    }

    if (asJson) {
      const csrfToken = await (reply as any).generateCsrf?.();
      return reply.type('application/json').send({
        ok: true,
        message: msgSuccess,
        csrfToken: typeof csrfToken === 'string' ? csrfToken : '',
      });
    }
    const sep = redirectTo.includes('?') ? '&' : '?';
    return reply.redirect(`${redirectTo}${sep}contact=ok`, 303);
  }

  /**
   * 单段 URL 不是已配置语言代码时返回 404（避免 `@Get(':locale')` 误渲染首页）。
   * 文案与导航按站点默认语言。
   */
  private async buildUnknownLocaleNotFoundViewData(): Promise<
    Record<string, unknown>
  > {
    return this.websiteNotFoundViewService.buildGenericNotFoundPayload(null);
  }

  /** 首页视图上下文：解析语言、拉取布局数据、组装 navItems 与 SEO。 */
  private async getHomeViewContext(
    pathLocale: string,
  ): Promise<WebsitePageContext> {
    const localeCodes = await this.langService.getLocaleCodes();
    const codes = localeCodes.length > 0 ? localeCodes : DEFAULT_CODES;

    const defaultLocale = 'en';
    const effectivePathLocale = pathLocale || '';
    const dataLocale =
      effectivePathLocale === ''
        ? codes.includes(defaultLocale)
          ? defaultLocale
          : codes[0] || 'en'
        : this.normalizeLocaleForData(effectivePathLocale);

    const defaultLang = await this.langService.getDefault();
    const lang =
      (await this.langService.findByCode(dataLocale)) ||
      (effectivePathLocale
        ? await this.langService.findByCodeForRoute(effectivePathLocale)
        : null) ||
      defaultLang;
    const langId = lang?.id;
    const locale = lang?.code ?? dataLocale ?? defaultLocale;
    /**
     * 链接前缀必须与解析后的语言一致。`/contact` 等路径会被 `@Get(':locale')` 误收，
     * 若仍用 URL 首段作 basePath，会错误生成 `/contact/products` 等导航链接。
     */
    const resolvedLangCode = (lang?.code || defaultLocale).toLowerCase();
    const basePath = resolvedLangCode === 'en' ? '' : `/${resolvedLangCode}`;
    const isDomestic = this.isDomesticTemplateLocale(effectivePathLocale);
    const viewName = 'website/home';

    const layoutData = langId
      ? await this.getLayoutData(langId, {
          configKeys: LAYOUT_CONFIG_KEYS,
          includeProducts: true,
        })
      : ({
          menus: [] as (Menu & { children?: Menu[] })[],
          productCategories: [] as ProductCategory[],
          products: [] as Product[],
          configByKey: {} as Record<string, Config | null>,
        } as LayoutCachePayload);

    const logoCfg = layoutData.configByKey['logo'] ?? null;
    const logoUrl = this.getLogoUrlFromConfig(logoCfg);
    const englishLogoUrl = await this.getEnglishLogoUrlFromConfig(logoCfg, langId ?? 0);

    const title = this.getWebsiteTitle(layoutData, isDomestic);
    const description = this.getWebsiteDescription(layoutData, isDomestic);
    const keywords = this.getWebsiteKeywords(layoutData, isDomestic);

    // 构建分类树，传入产品数据，产品会挂载到对应层级
    const navItems = this.buildNavItemsFromLayout(
      layoutData,
      basePath,
      isDomestic,
    );

    const homeCarousel = layoutData.configByKey['home-carousel'] ?? null;
    const carouselItems = this.getCarouselItems(homeCarousel);
    const learnMoreCfg = layoutData.configByKey['learn-more'] ?? null;
    const heroLearnMoreLabel =
      this.getTextFromConfig(learnMoreCfg, 'title')?.trim() || 'Learn More';
    const advantageConfig = layoutData.configByKey['advantage'] ?? null;
    const advantageItems = this.getAdvantageItems(advantageConfig);

    const ourCustomersConfig = layoutData.configByKey['our-customers'] ?? null;
    const customerLogos = this.getCustomerLogos(ourCustomersConfig);
    const ourCustomersTitle = ourCustomersConfig?.title || 'OUR CUSTOMERS';
    // 将 Logo 分成两行，每行最多 7 个（首页轮播为 2 行网格，列顺序与 about-us 一致）
    const customerLogosRow1 = customerLogos.slice(0, 7);
    const customerLogosRow2 = customerLogos.slice(7, 14);
    const customerLogosGrid: typeof customerLogos = [];
    const rowPairs = Math.max(
      customerLogosRow1.length,
      customerLogosRow2.length,
    );
    for (let i = 0; i < rowPairs; i++) {
      const a = customerLogosRow1[i];
      const b = customerLogosRow2[i];
      if (a) customerLogosGrid.push(a);
      if (b) customerLogosGrid.push(b);
    }

    const businessAreasMeta = layoutData.configByKey['business-areas'] ?? null;
    const { sectionTitle: businessAreasTitle, areas: businessAreas } =
      this.buildBusinessAreasSection(
        businessAreasMeta,
        layoutData.configByKey,
        layoutData.productCategories,
      );

    // 关于我们数据
    const aboutUsConfig = layoutData.configByKey['about-us'] ?? null;
    const readmoreConfig = layoutData.configByKey['readmore'] ?? null;
    const aboutUs = this.getAboutUs(aboutUsConfig, readmoreConfig);
    const aboutUsEnglishTitle = await this.getEnglishTitleFromConfig(aboutUsConfig, langId ?? 0, 'about-us');
    console.log('[DEBUG] aboutUsEnglishTitle result:', { 
      aboutUsExists: !!aboutUsConfig,
      aboutUsEnglishTitle 
    });

    const ourCustomersEnglishTitle = await this.getEnglishTitleFromConfig(ourCustomersConfig, langId ?? 0, 'our-customers');

    const businessAreasEnglishTitle = await this.getEnglishTitleFromConfig(businessAreasMeta, langId ?? 0, 'business-areas');

    // 新闻和活动配置
    const newsEventsConfig = layoutData.configByKey['news-events'] ?? null;
    Logger.log(newsEventsConfig)
    
    const newsEventsTitle = this.getTextFromConfig(newsEventsConfig, 'content')?.trim() ;
    Logger.log(newsEventsTitle,"xxxxxx")
    const newsEventsEnglishTitle = await this.getEnglishTitleFromConfig(newsEventsConfig, langId ?? 0, 'news-events');

    const isZhContact = resolvedLangCode === 'cn';
    const contactUsSuccessText = this.getContactUsSuccessText(
      layoutData,
      resolvedLangCode,
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

    // 新闻和活动数据
    const newsList = langId ? await this.getNewsList(langId) : [];
    const activities = langId ? await this.getActivityCalendarList(langId) : [];

    // 构建公共的头部和尾部数据
    const commonData = await this.buildCommonPageData(
      langId || 0,
      basePath,
      layoutData,
    );

    return {
      locale,
      title,
      description,
      keywords,
      localeCodes: codes,
      pathLocale: effectivePathLocale,
      basePath,
      langId,
      isDomestic,
      logoUrl,
      englishLogoUrl,
      navItems,
      carouselItems,
      heroLearnMoreLabel,
      advantageItems,
      customerLogos,
      customerLogosRow1,
      customerLogosRow2,
      customerLogosGrid,
      ourCustomersTitle,
      businessAreasTitle,
      businessAreas,
      aboutUs,
      aboutUsEnglishTitle: aboutUsEnglishTitle ?? undefined,
      ourCustomersEnglishTitle: ourCustomersEnglishTitle ?? undefined,
      businessAreasEnglishTitle: businessAreasEnglishTitle ?? undefined,
      newsEventsTitle,
      newsEventsEnglishTitle: newsEventsEnglishTitle ?? undefined,
      newsList,
      activities,
      contactUsSuccessText,
      contactToastInvalid,
      contactToastNetwork,
      contactToastForbidden,
      contactToastErrTitle,
      viewName,
      pageViewPageType: isDomestic ? undefined : 'home',
      ...commonData,
    };
  }

  /** 传给首页 Handlebars 的字段（须与 getHomeViewContext 输出一致，避免遗漏导致 partial 取不到 @root 变量） */
  private homeViewTemplateData(
    ctx: WebsitePageContext,
  ): Record<string, unknown> {
    const data: Record<string, unknown> = {
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
      carouselItems: ctx.carouselItems,
      heroLearnMoreLabel: ctx.heroLearnMoreLabel,
      advantageItems: ctx.advantageItems,
      businessAreas: ctx.businessAreas,
      aboutUs: ctx.aboutUs,
      footerAboutUs: ctx.footerAboutUs,
      footerPhone: ctx.footerPhone,
      footerBeian: ctx.footerBeian,
      followUs: ctx.followUs,
      customerLogos: ctx.customerLogos,
      customerLogosRow1: ctx.customerLogosRow1,
      customerLogosRow2: ctx.customerLogosRow2,
      customerLogosGrid: ctx.customerLogosGrid,
      ourCustomersTitle: ctx.ourCustomersTitle,
      businessAreasTitle: ctx.businessAreasTitle,
      aboutUsEnglishTitle: ctx.aboutUsEnglishTitle,
      ourCustomersEnglishTitle: ctx.ourCustomersEnglishTitle,
      businessAreasEnglishTitle: ctx.businessAreasEnglishTitle,
      newsEventsTitle: ctx.newsEventsTitle,
      newsEventsEnglishTitle: ctx.newsEventsEnglishTitle,
      newsList: ctx.newsList,
      activities: ctx.activities,
      contactUs: ctx.contactUs,
      contactUsFormLabels: ctx.contactUsFormLabels,
      contactUsSubmitLabel: ctx.contactUsSubmitLabel,
      contactUsSuccessText: ctx.contactUsSuccessText,
      contactToastInvalid: ctx.contactToastInvalid,
      contactToastNetwork: ctx.contactToastNetwork,
      contactToastForbidden: ctx.contactToastForbidden,
      contactToastErrTitle: ctx.contactToastErrTitle,
      pageViewPageType: ctx.pageViewPageType,
      loginRegister: ctx.loginRegister,
      fixedFourIcons: ctx.fixedFourIcons,
      cartTexts: ctx.cartTexts,
      inquiryPriceFormTexts: ctx.inquiryPriceFormTexts,
      navLangs: ctx.navLangs,
    };
    return data;
  }

  @Get('sitemap.xml')
  async sitemap(@Res() reply: FastifyReply) {
    const baseUrl = process.env.SITE_URL || 'https://example.com';
    const langs = await this.langService.findAll();

    // 获取所有启用的动态内容
    const [products, solutions, cases, news] = await Promise.all([
      this.productRepo.find({
        where: { status: Status.Normal },
        select: ['id', 'productId', 'langId', 'updatedAt'],
      }),
      this.solutionRepo.find({
        where: { status: Status.Normal },
        select: ['id', 'solutionId', 'langId', 'updatedAt'],
      }),
      this.industryCaseRepo.find({
        where: { status: Status.Normal },
        select: ['id', 'industryCaseId', 'langId', 'updatedAt'],
      }),
      this.newsRepo.find({
        where: { status: Status.Normal },
        select: ['id', 'newsId', 'langId', 'updatedAt'],
      }),
    ]);

    // 按语言ID分组内容
    const productsByLang = this.groupByLangId(products);
    const solutionsByLang = this.groupByLangId(solutions);
    const casesByLang = this.groupByLangId(cases);
    const newsByLang = this.groupByLangId(news);

    // 构建URL条目
    const urlEntries: string[] = [];

    // 静态页面
    const staticPages = [
      { path: '/', priority: '1.0', changefreq: 'daily' },
      { path: '/download', priority: '0.8', changefreq: 'monthly' },
      { path: '/news', priority: '0.8', changefreq: 'weekly' },
      { path: '/activity-calendar', priority: '0.7', changefreq: 'monthly' },
      { path: '/service', priority: '0.8', changefreq: 'monthly' },
      { path: '/warranty', priority: '0.8', changefreq: 'monthly' },
      { path: '/about-us', priority: '0.9', changefreq: 'monthly' },
      { path: '/products', priority: '0.9', changefreq: 'weekly' },
      { path: '/solutions', priority: '0.9', changefreq: 'weekly' },
      { path: '/cases', priority: '0.9', changefreq: 'weekly' },
    ];

    // 为每种语言生成静态页面
    for (const lang of langs) {
      for (const page of staticPages) {
        const path =
          lang.code === 'en' ? page.path : `/${lang.code}${page.path}`;
        const alternateLinks = this.buildAlternateLinks(path, langs, baseUrl);
        urlEntries.push(
          this.buildUrlEntry(
            baseUrl + path,
            page.priority,
            page.changefreq,
            alternateLinks,
          ),
        );
      }
    }

    // 动态内容：产品详情页
    for (const [langId, langProducts] of Object.entries(productsByLang)) {
      const lang = langs.find((l) => l.id === parseInt(langId));
      if (!lang) continue;

      for (const product of langProducts) {
        const path =
          lang.code === 'en'
            ? `/products/${product.productId}`
            : `/${lang.code}/products/${product.productId}`;
        const alternateLinks = this.buildAlternateLinks(path, langs, baseUrl);
        const lastmod = product.updatedAt
          ? this.formatDate(product.updatedAt)
          : null;
        urlEntries.push(
          this.buildUrlEntry(
            baseUrl + path,
            '0.8',
            'monthly',
            alternateLinks,
            lastmod,
          ),
        );
      }
    }

    // 动态内容：解决方案详情页
    for (const [langId, langSolutions] of Object.entries(solutionsByLang)) {
      const lang = langs.find((l) => l.id === parseInt(langId));
      if (!lang) continue;

      for (const solution of langSolutions) {
        const path =
          lang.code === 'en'
            ? `/solutions/${solution.solutionId}`
            : `/${lang.code}/solutions/${solution.solutionId}`;
        const alternateLinks = this.buildAlternateLinks(path, langs, baseUrl);
        const lastmod = solution.updatedAt
          ? this.formatDate(solution.updatedAt)
          : null;
        urlEntries.push(
          this.buildUrlEntry(
            baseUrl + path,
            '0.8',
            'monthly',
            alternateLinks,
            lastmod,
          ),
        );
      }
    }

    // 动态内容：案例详情页
    for (const [langId, langCases] of Object.entries(casesByLang)) {
      const lang = langs.find((l) => l.id === parseInt(langId));
      if (!lang) continue;

      for (const caseItem of langCases) {
        const path =
          lang.code === 'en'
            ? `/cases/${caseItem.industryCaseId}`
            : `/${lang.code}/cases/${caseItem.industryCaseId}`;
        const alternateLinks = this.buildAlternateLinks(path, langs, baseUrl);
        const lastmod = caseItem.updatedAt
          ? this.formatDate(caseItem.updatedAt)
          : null;
        urlEntries.push(
          this.buildUrlEntry(
            baseUrl + path,
            '0.7',
            'monthly',
            alternateLinks,
            lastmod,
          ),
        );
      }
    }

    // 动态内容：新闻详情页
    for (const [langId, langNews] of Object.entries(newsByLang)) {
      const lang = langs.find((l) => l.id === parseInt(langId));
      if (!lang) continue;

      for (const newsItem of langNews) {
        const path =
          lang.code === 'en'
            ? `/news/${newsItem.newsId}`
            : `/${lang.code}/news/${newsItem.newsId}`;
        const alternateLinks = this.buildAlternateLinks(path, langs, baseUrl);
        const lastmod = newsItem.updatedAt
          ? this.formatDate(newsItem.updatedAt)
          : null;
        urlEntries.push(
          this.buildUrlEntry(
            baseUrl + path,
            '0.6',
            'monthly',
            alternateLinks,
            lastmod,
          ),
        );
      }
    }

    // 生成XML
    const xml = [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">',
      ...urlEntries,
      '</urlset>',
    ].join('\n');

    return reply.type('application/xml').send(xml);
  }

  // 辅助方法：按语言ID分组
  private groupByLangId<T extends { langId: number }>(
    items: T[],
  ): Record<number, T[]> {
    return items.reduce(
      (acc, item) => {
        if (!acc[item.langId]) {
          acc[item.langId] = [];
        }
        acc[item.langId].push(item);
        return acc;
      },
      {} as Record<number, T[]>,
    );
  }

  // 辅助方法：构建多语言链接
  private buildAlternateLinks(
    path: string,
    langs: any[],
    baseUrl: string,
  ): string {
    const links: string[] = [];

    // 提取路径中的语言代码（如果有）
    const pathParts = path.split('/').filter(Boolean);
    const hasLangPrefix =
      pathParts.length > 0 && langs.some((lang) => lang.code === pathParts[0]);
    const currentLang = hasLangPrefix ? pathParts[0] : 'en';
    const pathWithoutLang = hasLangPrefix
      ? '/' + pathParts.slice(1).join('/')
      : path;

    for (const lang of langs) {
      let langPath: string;

      if (lang.code === 'en') {
        // 英文版本：如果没有语言前缀就使用原路径，否则移除语言前缀
        langPath = pathWithoutLang;
      } else {
        // 其他语言：添加对应的语言前缀
        langPath = `/${lang.code}${pathWithoutLang}`;
      }

      links.push(
        `<xhtml:link rel="alternate" hreflang="${lang.code === 'cn' ? 'cn' : lang.code}" href="${baseUrl}${langPath}" />`,
      );
    }

    return links.join('\n      ');
  }

  // 辅助方法：构建URL条目
  private buildUrlEntry(
    loc: string,
    priority: string,
    changefreq: string,
    alternateLinks?: string,
    lastmod?: string | null,
  ): string {
    const parts = [
      `  <url>`,
      `    <loc>${loc}</loc>`,
      alternateLinks ? `    ${alternateLinks}` : null,
      lastmod ? `    <lastmod>${lastmod}</lastmod>` : null,
      `    <changefreq>${changefreq}</changefreq>`,
      `    <priority>${priority}</priority>`,
      `  </url>`,
    ].filter(Boolean);

    return parts.join('\n');
  }

  // 辅助方法：格式化日期为ISO字符串
  private formatDate(date: Date | string): string {
    const d = date instanceof Date ? date : new Date(date);
    return d.toISOString().split('T')[0]; // YYYY-MM-DD格式
  }

  @Get('robots.txt')
  async robotsTxt(@Res() reply: FastifyReply) {
    const baseUrl = process.env.SITE_URL || 'https://example.com';
    const robotsContent = [
      'User-agent: *',
      'Allow: /',
      '',
      `Sitemap: ${baseUrl}/sitemap.xml`,
      '',
    ].join('\n');

    return reply.type('text/plain').send(robotsContent);
  }

  /** 悬浮询价表单等非首页场景拉取 CSRF（默认语言路径无前缀） */
  @Get('contact-form-meta')
  async contactFormMetaDefault(
    @Req() req: FastifyRequest,
    @Res() reply: FastifyReply,
  ) {
    const token = (await (reply as any).generateCsrf?.()) ?? '';
    return reply.type('application/json').send({ csrfToken: token });
  }

  @Get(':locale/contact-form-meta')
  async contactFormMetaLocale(
    @Req() req: FastifyRequest,
    @Res() reply: FastifyReply,
  ) {
    const token = (await (reply as any).generateCsrf?.()) ?? '';
    return reply.type('application/json').send({ csrfToken: token });
  }

  @Get()
  async index(@Req() req: FastifyRequest, @Res() reply: FastifyReply) {
    const ctx = await this.getHomeViewContext('');
    const contactFormCsrfToken = await (reply as any).generateCsrf?.();
    (req as any)[LOCALE_KEY] = ctx.locale;
    return (reply as any).view(ctx.viewName, {
      ...this.homeViewTemplateData(ctx),
      contactFormCsrfToken: contactFormCsrfToken ?? '',
    });
  }

  @Get(':locale')
  async indexWithLocale(
    @Param('locale') localeParam: string,
    @Req() req: FastifyRequest,
    @Res() reply: FastifyReply,
  ) {
    const pathLocale = (localeParam || '').toLowerCase();
    const langResolved = await this.langService.findByCodeForRoute(pathLocale);
    if (!langResolved) {
      const payload = await this.buildUnknownLocaleNotFoundViewData();
      const contactFormCsrfToken = await (reply as any).generateCsrf?.();
      (req as any)[LOCALE_KEY] = payload.locale;
      return (reply as any).code(404).view('website/not-found', {
        ...payload,
        contactFormCsrfToken: contactFormCsrfToken ?? '',
      });
    }

    const ctx = await this.getHomeViewContext(langResolved.code);
    const contactFormCsrfToken = await (reply as any).generateCsrf?.();
    (req as any)[LOCALE_KEY] = ctx.locale;
    return (reply as any).view(ctx.viewName, {
      ...this.homeViewTemplateData(ctx),
      contactFormCsrfToken: contactFormCsrfToken ?? '',
    });
  }
}
