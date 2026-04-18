import {
  Controller,
  Get,
  NotFoundException,
  Param,
  Req,
  Res,
} from '@nestjs/common';
import type { FastifyReply, FastifyRequest } from 'fastify';
import type { Config } from '../../entities/config.entity';
import { Status } from '../../common/entities/base.entity';
import { LangService } from '../../i18n/lang.service';
import { WebsiteLayoutService } from './website-layout.service';
import { BaseWebsiteController, LOCALE_KEY } from './base-website.controller';
import { parseGlobalMapFromConfigs } from './global-map-layout';
import type { LayoutCachePayload, MenuTreeItem } from './website-layout.types';

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
  'service-philosophy',
  'service-content',
  /** 搜索页文案（后台「搜索页文字」，key_name `seach-page-texts`） */
  'seach-page-texts',
  /** 地图配置 */
  'about-us-map',
  'about-us-map-data',
  /** 联系表单各字段 label */
  'contact-us-labels',
  /** 联系表单提交按钮 */
  'submit',
];

function trimStr(v: unknown): string {
  return typeof v === 'string' ? v.trim() : '';
}

function normalizePicUrl(url: string): string | null {
  const u = url.trim();
  if (!u) return null;
  if (u.startsWith('http://') || u.startsWith('https://')) return u;
  return u.startsWith('/') ? u : `/${u}`;
}

function isActiveConfig(c: Config | null | undefined): c is Config {
  return !!c && c.status === Status.Normal;
}

/** 英文数字词 → 阿拉伯数字（仅常见项，便于统计动效解析） */
function normalizePhilosophyStatValue(raw: string): string {
  const t = raw.trim().toLowerCase();
  const map: Record<string, string> = {
    twenty: '20',
    thirty: '30',
    forty: '40',
    fifty: '50',
    sixty: '60',
    seventy: '70',
    eighty: '80',
    ninety: '90',
    hundred: '100',
  };
  return map[t] ?? raw.trim();
}

/** 服务宗旨 type=12 单项：description=数字，bigTitle=+/GWh 等，subtitle=如 Millions */
export type ServicePhilosophyStatVm = {
  value: string;
  label: string;
  suffix: string;
  subSuffix: string;
  suffixIsSup: boolean;
  /** 数字左侧、右侧纵向排列 suffix（如 +）与 subSuffix（如 Millions），对齐设计稿 */
  stackSuffixColumn: boolean;
};

export type ServicePhilosophyVm = {
  title: string;
  lead: string;
  stats: ServicePhilosophyStatVm[];
};

export type ServiceContentCardVm = {
  imageLeft: boolean;
  themeDark: boolean;
  pic1Url: string | null;
  bigTitle: string;
  mode: 'dual' | 'single' | 'first';
  title: string;
  description: string;
  subtitle: string;
  subDescription: string;
  body: string;
};

@Controller()
export class ServicePageController extends BaseWebsiteController {
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

  /**
   * 服务页 SEO 不读全站 website-*；由菜单树中指向 /service 的 menu 行 meta_* 决定。
   */
  getWebsiteTitle(
    _layoutData: LayoutCachePayload,
    isDomestic: boolean,
  ): string {
    return isDomestic ? '服务' : 'Service';
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

  private expectedServiceListPath(basePath: string): string {
    const p = (basePath || '').replace(/\/+$/, '');
    return p ? `${p}/service` : '/service';
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

  private findMenuForServicePage(
    tree: MenuTreeItem[],
    basePath: string,
    targetPath: string,
  ): MenuTreeItem | null {
    const target = this.normalizePathForCompare(targetPath);
    for (const m of tree) {
      if (m.children?.length) {
        const found = this.findMenuForServicePage(
          m.children,
          basePath,
          targetPath,
        );
        if (found) return found;
      }
      const abs = this.normalizePathForCompare(
        this.menuLinkToPublicPath(m.linkUrl, basePath),
      );
      if (abs && abs === target) return m;
    }
    return null;
  }

  private resolveServiceBannerFromMenus(
    menus: MenuTreeItem[],
    basePath: string,
  ): { imageUrl: string | null; title: string | null; desc: string | null } {
    const expected = this.expectedServiceListPath(basePath);
    const node = this.findMenuForServicePage(menus, basePath, expected);
    if (!node) {
      return { imageUrl: null, title: null, desc: null };
    }
    return {
      imageUrl: normalizePicUrl(node.bannerUrl?.trim() ?? '') || null,
      title: node.bannerTitle?.trim() || null,
      desc: node.bannerDesc?.trim() || null,
    };
  }

  private parsePhilosophy(cfg: Config | null): ServicePhilosophyVm | null {
    if (!isActiveConfig(cfg)) return null;
    const title = trimStr(cfg.title);
    const lead = trimStr(cfg.description);
    const raw = cfg.content;
    const arr = Array.isArray(raw) ? raw : [];
    const stats = arr
      .filter((item) => item && typeof item === 'object')
      .map((item) => {
        const o = item as Record<string, unknown>;
        const value = normalizePhilosophyStatValue(trimStr(o.description));
        const suffix = trimStr(o.bigTitle);
        const subSuffix = trimStr(o.subtitle);
        const suffixIsSup =
          !!suffix &&
          suffix !== '+' &&
          /^[A-Za-z][A-Za-z0-9.%]{0,11}$/.test(suffix);
        const stackSuffixColumn = !!(subSuffix && suffix && !suffixIsSup);
        return {
          value,
          label: trimStr(o.title),
          suffix,
          subSuffix,
          suffixIsSup,
          stackSuffixColumn,
        };
      })
      .filter((x) => x.value || x.label);
    if (!title && !lead && stats.length === 0) return null;
    return { title: title || '', lead, stats };
  }

  private parseServiceCards(cfg: Config | null): ServiceContentCardVm[] {
    if (!isActiveConfig(cfg)) return [];
    const raw = cfg.content;
    const arr = Array.isArray(raw) ? raw : [];
    const out: ServiceContentCardVm[] = [];
    let index = 0;
    for (const item of arr) {
      if (!item || typeof item !== 'object') continue;
      const o = item as Record<string, unknown>;
      const title = trimStr(o.title);
      const description = trimStr(o.description);
      const subtitle = trimStr(o.subtitle);
      const subDescription = trimStr(o.subDescription);
      const bigTitle = trimStr(o.bigTitle);
      const pic1Url = normalizePicUrl(trimStr(o.pic1Url));

      const hasSecond = !!(subtitle || subDescription);
      let mode: ServiceContentCardVm['mode'];
      let body = '';
      if (hasSecond) {
        mode = 'dual';
      } else if (!description && !subtitle && !subDescription && title) {
        mode = 'single';
        body = title;
      } else {
        mode = 'first';
      }

      const hasContent =
        !!bigTitle ||
        !!pic1Url ||
        (mode === 'dual' &&
          (!!title || !!description || !!subtitle || !!subDescription)) ||
        (mode === 'single' && (!!bigTitle || !!body)) ||
        (mode === 'first' && (!!title || !!description));
      if (!hasContent) continue;

      const imageLeft = index % 2 === 0;
      const themeDark = index % 2 === 0;
      out.push({
        imageLeft,
        themeDark,
        pic1Url,
        bigTitle: bigTitle || '—',
        mode,
        title: mode === 'single' ? '' : title,
        description: mode === 'single' ? '' : description,
        subtitle,
        subDescription,
        body,
      });
      index += 1;
    }
    return out;
  }

  private async getServicePagePayload(pathLocale: string) {
    const lang = await this.langService.findByCodeForRoute(pathLocale || 'en');
    if (!lang) throw new NotFoundException();

    const langId = lang.id;
    const locale =
      lang.code === 'cn' ? 'cn' : lang.code === 'en' ? 'en' : lang.code;
    const isDomestic = lang.code === 'cn';
    const basePath = lang.code === 'en' ? '' : `/${lang.code}`;
    const codes = await this.langService
      .findAll()
      .then((l) => l.map((x) => x.code));
    const effectivePathLocale =
      pathLocale || (lang.code === 'en' ? '' : lang.code);

    const layoutData = await this.getLayoutData(langId || 0, {
      configKeys: LAYOUT_CONFIG_KEYS,
    });

    const philosophyCfg = layoutData.configByKey['service-philosophy'] ?? null;
    const contentCfg = layoutData.configByKey['service-content'] ?? null;

    const philosophy = this.parsePhilosophy(philosophyCfg);
    const serviceCards = this.parseServiceCards(contentCfg);

    // 解析地图数据
    const mapCfg = layoutData.configByKey['about-us-map'] ?? null;
    const mapDataCfg = layoutData.configByKey['about-us-map-data'] ?? null;
    const globalMap = parseGlobalMapFromConfigs(mapCfg, mapDataCfg);

    const pageTitleFromConfig = trimStr(contentCfg?.title);
    const pageHeading =
      pageTitleFromConfig || (locale === 'cn' ? '服务说明' : 'Service');
    const serviceSectionHeading =
      pageTitleFromConfig ||
      (locale === 'cn' ? '服务内容' : 'Service Content');

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

    const menus = layoutData.menus || [];
    const expectedServicePath = this.expectedServiceListPath(basePath);
    const menuNode = this.findMenuForServicePage(
      menus,
      basePath,
      expectedServicePath,
    );
    let documentTitle: string;
    let metaDesc: string | null;
    let metaKw: string | null;
    if (menuNode) {
      documentTitle =
        (menuNode.metaTitle && menuNode.metaTitle.trim()) || menuNode.name;
      metaDesc =
        (menuNode.metaDescription && menuNode.metaDescription.trim()) || null;
      metaKw = (menuNode.metaKeywords && menuNode.metaKeywords.trim()) || null;
    } else {
      documentTitle = this.getWebsiteTitle(layoutData, isDomestic);
      metaDesc = null;
      metaKw = null;
    }

    const menuBanner = this.resolveServiceBannerFromMenus(menus, basePath);
    const bannerImageUrl = menuBanner.imageUrl;
    const serviceBannerHeading = menuBanner.title || pageHeading;
    const serviceBannerDesc = menuBanner.desc || '';

    const mapZh = locale === 'cn';

    return {
      locale,
      langId,
      isDomestic,
      basePath,
      localeCodes: codes,
      pathLocale: effectivePathLocale,
      title: documentTitle,
      description: metaDesc,
      keywords: metaKw,
      logoUrl,
      navItems,
      categoryTree,
      viewName: 'website/service',
      pageViewPageType: 'service',
      bannerImageUrl,
      serviceBannerHeading,
      serviceBannerDesc,
      philosophy,
      serviceSectionHeading,
      serviceCards,
      hasServiceCards: serviceCards.length > 0,
      // 地图相关数据
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
        (mapZh ? '全球销售服务网络' : 'Global Sales Service Network'),
      globalMapLegendAria: mapZh ? '图例' : 'Map legend',
      globalMapErrNoEcharts: mapZh ? '图表库未加载' : 'ECharts unavailable',
      globalMapErrLoad: mapZh ? '地图加载失败' : 'Map failed to load',
      globalMapLoadingText: mapZh ? '加载地图中…' : 'Loading map…',
      ...commonData,
    };
  }

  @Get('service')
  async serviceRoot(@Req() req: FastifyRequest, @Res() reply: FastifyReply) {
    const ctx = await this.getServicePagePayload('');
    (req as any)[LOCALE_KEY] = ctx.locale;
    return (reply as any).view(ctx.viewName, ctx);
  }

  @Get(':locale/service')
  async serviceLocale(
    @Param('locale') localeParam: string,
    @Req() req: FastifyRequest,
    @Res() reply: FastifyReply,
  ) {
    const pathLocale = (localeParam || '').toLowerCase();
    const ctx = await this.getServicePagePayload(pathLocale);
    (req as any)[LOCALE_KEY] = ctx.locale;
    return (reply as any).view(ctx.viewName, ctx);
  }
}
