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
import type { LayoutCachePayload } from './website-layout.types';

const USER_AGREEMENT_CONFIG_KEY = 'user-agreement';

const LAYOUT_CONFIG_KEYS = [USER_AGREEMENT_CONFIG_KEY];

function trimStr(v: unknown): string {
  return typeof v === 'string' ? v.trim() : '';
}

function isActiveConfig(c: Config | null | undefined): c is Config {
  return !!c && c.status === Status.Normal;
}

@Controller()
export class UserAgreementPageController extends BaseWebsiteController {
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
    return isDomestic ? '用户协议' : 'User Agreement';
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

  /** type 13 富文本：HTML 存于 content JSON 的 content 字段 */
  private parseUserAgreementHtml(cfg: Config | null): string {
    if (!isActiveConfig(cfg)) return '';
    const raw = cfg.content;
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return '';
    const o = raw;
    return trimStr(o.content);
  }

  private async getUserAgreementPayload(pathLocale: string) {
    const lang = await this.langService.findByCodeForRoute(pathLocale || 'en');
    if (!lang) throw new NotFoundException();

    const langId = lang.id;
    const locale =
      lang.code === 'cn' ? 'cn' : lang.code === 'en' ? 'en' : lang.code;
    const isDomestic = lang.code === 'cn';
    const effectivePathLocale =
      pathLocale || (lang.code === 'en' ? '' : lang.code);

    const layoutData = await this.getLayoutData(langId || 0, {
      configKeys: LAYOUT_CONFIG_KEYS,
    });
    const cfg = layoutData.configByKey[USER_AGREEMENT_CONFIG_KEY] ?? null;

    if (!isActiveConfig(cfg)) {
      throw new NotFoundException();
    }

    const userAgreementHtml = this.parseUserAgreementHtml(cfg);

    const rawJson =
      cfg.content &&
      typeof cfg.content === 'object' &&
      !Array.isArray(cfg.content)
        ? cfg.content
        : null;
    const entityTitle = trimStr(cfg.title);
    const metaDesc =
      trimStr(cfg.description) ||
      (rawJson ? trimStr(rawJson.description) : '') ||
      null;

    /** 浏览器标题仅用配置表 title，与后台「标题」字段一致 */
    const documentTitle =
      entityTitle || this.getWebsiteTitle(layoutData, isDomestic);

    return {
      locale,
      langId,
      isDomestic,
      pathLocale: effectivePathLocale,
      title: documentTitle,
      description: metaDesc,
      keywords: null as string | null,
      userAgreementHtml,
      viewName: 'website/user-agreement',
      pageViewPageType: 'user-agreement',
    };
  }

  @Get('user-agreement')
  async userAgreementRoot(
    @Req() req: FastifyRequest,
    @Res() reply: FastifyReply,
  ) {
    const ctx = await this.getUserAgreementPayload('');
    (req as any)[LOCALE_KEY] = ctx.locale;
    return (reply as any).view(ctx.viewName, ctx);
  }

  @Get(':locale/user-agreement')
  async userAgreementLocale(
    @Param('locale') localeParam: string,
    @Req() req: FastifyRequest,
    @Res() reply: FastifyReply,
  ) {
    const pathLocale = (localeParam || '').toLowerCase();
    const ctx = await this.getUserAgreementPayload(pathLocale);
    (req as any)[LOCALE_KEY] = ctx.locale;
    return (reply as any).view(ctx.viewName, ctx);
  }
}
