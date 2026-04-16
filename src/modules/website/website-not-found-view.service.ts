import { Injectable } from '@nestjs/common';
import type { Config } from '../../entities/config.entity';
import { LangService } from '../../i18n/lang.service';
import { getGenericNotFoundMessages } from '../../common/utils/website-not-found-messages';
import { BaseWebsiteController } from './base-website.controller';
import { WebsiteLayoutService } from './website-layout.service';
import type { LayoutCachePayload } from './website-layout.types';

const DEFAULT_CODES = ['en', 'cn', 'jp'];

/** 与首页 not-found 布局一致 */
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
  'contact-us-labels',
  'submit',
  'contact-us-success-text',
  'followus',
  'footer-aboutus',
  'footer-phone',
  'footer-beian',
  'learn-more',
  'readmore',
  /** 搜索页文案（后台「搜索页文字」，key_name `seach-page-texts`） */
  'seach-page-texts',
];

/**
 * 前台通用 404 页数据（无匹配路由、无效路径等）。
 * 根据 URL 首段解析语言；解析失败则用站点默认语言。
 */
@Injectable()
export class WebsiteNotFoundViewService extends BaseWebsiteController {
  constructor(
    langService: LangService,
    websiteLayoutService: WebsiteLayoutService,
  ) {
    super(langService, websiteLayoutService);
  }

  async getLayoutData(
    langId: number,
    options?: { configKeys?: string[]; includeProducts?: boolean },
  ): Promise<LayoutCachePayload> {
    return this.websiteLayoutService.getLayoutData(langId, options);
  }

  getWebsiteTitle(
    _layoutData: LayoutCachePayload,
    _isDomestic: boolean,
  ): string {
    return '';
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

  /**
   * @param pathLocaleFirstSegment URL 第一段（如 ja/products2 的 ja）；无则仅用默认语言
   */
  async buildGenericNotFoundPayload(
    pathLocaleFirstSegment: string | null,
  ): Promise<Record<string, unknown>> {
    const localeCodesList = await this.langService.getLocaleCodes();
    const codes = localeCodesList.length > 0 ? localeCodesList : DEFAULT_CODES;

    let lang = pathLocaleFirstSegment
      ? await this.langService.findByCodeForRoute(pathLocaleFirstSegment)
      : null;
    if (!lang) {
      lang = await this.langService.getDefault();
    }
    const langId = lang?.id ?? 0;
    const resolvedCode = (lang?.code || 'en').toLowerCase();
    const isDomestic = resolvedCode === 'cn';
    const locale =
      resolvedCode === 'cn'
        ? 'zh-CN'
        : resolvedCode === 'en'
          ? 'en'
          : resolvedCode;
    const basePath = resolvedCode === 'en' ? '' : `/${resolvedCode}`;
    const effectivePathLocale = resolvedCode === 'en' ? '' : resolvedCode;

    const copy = getGenericNotFoundMessages(resolvedCode);

    const layoutData = await this.getLayoutData(langId, {
      configKeys: LAYOUT_CONFIG_KEYS,
      includeProducts: true,
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
      langId,
      basePath,
      layoutData,
    );

    return {
      locale,
      title: copy.title,
      description: null,
      keywords: null,
      langId,
      isDomestic,
      logoUrl,
      navItems,
      categoryTree,
      basePath,
      localeCodes: codes,
      pathLocale: effectivePathLocale,
      listUrl: basePath || '/',
      notFoundHint: copy.notFoundHint,
      notFoundBackLabel: copy.notFoundBackLabel,
      notFoundBodyClass: '',
      pageViewPageType: 'invalid-path-not-found',
      ...commonData,
    };
  }
}
