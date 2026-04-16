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
import type { LayoutCachePayload, MenuTreeItem } from './website-layout.types';

const WARRANTY_CONFIG_KEY = 'warranty';

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
  WARRANTY_CONFIG_KEY,
  /** 搜索页文案（后台「搜索页文字」，key_name `seach-page-texts`） */
  'seach-page-texts',
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

@Controller()
export class WarrantyPageController extends BaseWebsiteController {
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
    isDomestic: boolean,
  ): string {
    return isDomestic ? '保修说明' : 'Warranty';
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

  private expectedWarrantyPath(basePath: string): string {
    const p = (basePath || '').replace(/\/+$/, '');
    return p ? `${p}/warranty` : '/warranty';
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

  private findMenuByPublicPath(
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

  private parseWarrantyContentHtml(cfg: Config | null): string {
    if (!isActiveConfig(cfg)) return '';
    const raw = cfg.content;
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return '';
    const o = raw;
    return trimStr(o.content);
  }

  private async getWarrantyPagePayload(pathLocale: string) {
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

    const layoutData = await this.getLayoutData(langId || 0, {
      configKeys: LAYOUT_CONFIG_KEYS,
    });
    const warrantyCfg = layoutData.configByKey[WARRANTY_CONFIG_KEY] ?? null;

    if (!isActiveConfig(warrantyCfg)) {
      throw new NotFoundException();
    }

    const warrantyHtml = this.parseWarrantyContentHtml(
      warrantyCfg as Config | null,
    );

    const rawJson =
      warrantyCfg.content &&
      typeof warrantyCfg.content === 'object' &&
      !Array.isArray(warrantyCfg.content)
        ? warrantyCfg.content
        : null;
    const jsonTitle = rawJson ? trimStr(rawJson.title) : '';
    const jsonBigTitle = rawJson ? trimStr(rawJson.bigTitle) : '';
    const jsonDesc = rawJson ? trimStr(rawJson.description) : '';

    const entityTitle = trimStr(warrantyCfg.title);
    const entityDesc = trimStr(warrantyCfg.description);

    const menus = layoutData.menus || [];
    const expectedPath = this.expectedWarrantyPath(basePath);
    const menuNode = this.findMenuByPublicPath(menus, basePath, expectedPath);

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
      documentTitle =
        entityTitle ||
        jsonTitle ||
        jsonBigTitle ||
        trimStr(warrantyCfg.name) ||
        this.getWebsiteTitle(layoutData, isDomestic);
      metaDesc = entityDesc || jsonDesc || null;
      metaKw = null;
    }

    if (!metaDesc && entityDesc) metaDesc = entityDesc;
    if (!metaDesc && jsonDesc) metaDesc = jsonDesc;

    const pageHeading = documentTitle;

    let bannerImageUrl: string | null = null;
    let serviceBannerHeading: string = pageHeading;
    let serviceBannerDesc: string = '';
    if (menuNode) {
      bannerImageUrl =
        normalizePicUrl(menuNode.bannerUrl?.trim() ?? '') || null;
      if (menuNode.bannerTitle?.trim())
        serviceBannerHeading = menuNode.bannerTitle.trim();
      if (menuNode.bannerDesc?.trim())
        serviceBannerDesc = menuNode.bannerDesc.trim();
    }

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
      viewName: 'website/warranty',
      pageViewPageType: 'warranty',
      pageHeading,
      warrantyHtml,
      hasWarrantyBody: !!warrantyHtml,
      bannerImageUrl,
      serviceBannerHeading,
      serviceBannerDesc,
      hasBanner: !!bannerImageUrl,
      ...commonData,
    };
  }

  @Get('warranty')
  async warrantyRoot(@Req() req: FastifyRequest, @Res() reply: FastifyReply) {
    const ctx = await this.getWarrantyPagePayload('');
    (req as any)[LOCALE_KEY] = ctx.locale;
    return (reply as any).view(ctx.viewName, ctx);
  }

  @Get(':locale/warranty')
  async warrantyLocale(
    @Param('locale') localeParam: string,
    @Req() req: FastifyRequest,
    @Res() reply: FastifyReply,
  ) {
    const pathLocale = (localeParam || '').toLowerCase();
    const ctx = await this.getWarrantyPagePayload(pathLocale);
    (req as any)[LOCALE_KEY] = ctx.locale;
    return (reply as any).view(ctx.viewName, ctx);
  }
}
