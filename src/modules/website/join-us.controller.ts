import { Controller, Get, Post, Param, Req, Res } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import type { FastifyReply, FastifyRequest } from 'fastify';
import type { Config } from '../../entities/config.entity';
import { LangService } from '../../i18n/lang.service';
import { WebsiteLayoutService } from './website-layout.service';
import {
  BaseWebsiteController,
  LOCALE_KEY,
  type WebsitePageContext,
} from './base-website.controller';
import type { LayoutCachePayload, MenuTreeItem } from './website-layout.types';
import { OverseasRecruit } from '../../entities/overseas-recruit.entity';
import { Status } from '../../common/entities/base.entity';
import { MailService } from '../mail/mail.service';
import { SystemConfig } from '../../entities/system-config.entity';
import { pipeline } from 'stream/promises';
import { createWriteStream, existsSync, mkdirSync } from 'fs';
import { join, extname } from 'path';
import { randomBytes } from 'crypto';

function normalizePicUrl(url: string): string | null {
  const u = url.trim();
  if (!u) return null;
  if (u.startsWith('http://') || u.startsWith('https://')) return u;
  return u.startsWith('/') ? u : `/${u}`;
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
  'join-us-texts',
  /** 联系表单各字段 label */
  'contact-us-labels',
  /** 联系表单提交按钮 */
  'submit',
];

@Controller()
export class JoinUsController extends BaseWebsiteController {
  constructor(
    langService: LangService,
    websiteLayoutService: WebsiteLayoutService,
    @InjectRepository(OverseasRecruit)
    private readonly recruitRepo: Repository<OverseasRecruit>,
    @InjectRepository(SystemConfig)
    private readonly systemConfigRepo: Repository<SystemConfig>,
    private readonly mailService: MailService,
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
    return isDomestic ? '加入我们' : 'Join Us';
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

  private getJoinUsTexts(
    layoutData: LayoutCachePayload,
  ): Record<string, string> {
    const texts: Record<string, string> = {};
    const config = layoutData.configByKey['join-us-texts'];
    if (config?.content && Array.isArray(config.content)) {
      config.content.forEach((item: any, index: number) => {
        if (item.content) {
          texts[`text_${index}`] = item.content;
        }
      });
    }
    return texts;
  }

  private expectedJoinUsPath(basePath: string): string {
    const p = (basePath || '').replace(/\/+$/, '');
    return p ? `${p}/join-us` : '/join-us';
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

  private findMenuForJoinUsPage(
    tree: MenuTreeItem[],
    basePath: string,
    targetPath: string,
  ): MenuTreeItem | null {
    const target = this.normalizePathForCompare(targetPath);
    for (const m of tree) {
      if (m.children?.length) {
        const found = this.findMenuForJoinUsPage(
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

  private resolveJoinUsBannerFromMenus(
    menus: MenuTreeItem[],
    basePath: string,
  ): { imageUrl: string | null; title: string | null; desc: string | null } {
    const expected = this.expectedJoinUsPath(basePath);
    const node = this.findMenuForJoinUsPage(menus, basePath, expected);
    if (!node) {
      return { imageUrl: null, title: null, desc: null };
    }
    return {
      imageUrl: normalizePicUrl(node.bannerUrl?.trim() ?? '') || null,
      title: node.bannerTitle?.trim() || null,
      desc: node.bannerDesc?.trim() || null,
    };
  }

  @Get('join-us')
  async joinUsPage(@Req() req: FastifyRequest, @Res() reply: FastifyReply) {
    return this.handleJoinUsPage(req, reply, '');
  }

  @Get(':locale/join-us')
  async joinUsPageLocale(
    @Param('locale') localeParam: string,
    @Req() req: FastifyRequest,
    @Res() reply: FastifyReply,
  ) {
    return this.handleJoinUsPage(req, reply, (localeParam || '').toLowerCase());
  }

  private async handleJoinUsPage(
    req: FastifyRequest,
    reply: FastifyReply,
    pathLocale: string,
  ) {
    const lang = await this.langService.findByCodeForRoute(pathLocale || 'en');
    if (!lang) {
      return reply.code(404).type('text/plain').send('Not found');
    }

    const layoutData = await this.getLayoutData(lang.id, {
      configKeys: LAYOUT_CONFIG_KEYS,
    });
    const texts = this.getJoinUsTexts(layoutData);
    const langCode = (lang.code || 'en').toLowerCase();
    const isDomestic = langCode === 'cn';
    const basePath = lang.code === 'en' ? '' : `/${lang.code}`;

    const csrfToken = await (reply as any).generateCsrf?.();

    // Build common page data
    const commonData = await this.buildCommonPageData(
      lang.id,
      basePath,
      layoutData,
    );

    // Build nav items
    const navItems = this.buildNavItemsFromLayout(
      layoutData,
      basePath,
      isDomestic,
    );

    // Get logo
    const logoUrl = this.getLogoUrlFromConfig(
      layoutData.configByKey['logo'] ?? null,
    );

    // Get banner from menu
    const banner = this.resolveJoinUsBannerFromMenus(
      layoutData.menus,
      basePath,
    );

    // 从 menu 表获取 SEO 信息
    const menus = layoutData.menus;
    const expectedJoinUsPath = this.expectedJoinUsPath(basePath);
    const joinUsMenuNode = this.findMenuForJoinUsPage(
      menus,
      basePath,
      expectedJoinUsPath,
    );
    let documentTitle: string;
    let description: string | null;
    let keywords: string | null;
    if (joinUsMenuNode) {
      documentTitle =
        (joinUsMenuNode.metaTitle && joinUsMenuNode.metaTitle.trim()) ||
        joinUsMenuNode.name;
      description =
        (joinUsMenuNode.metaDescription &&
          joinUsMenuNode.metaDescription.trim()) ||
        null;
      keywords =
        (joinUsMenuNode.metaKeywords && joinUsMenuNode.metaKeywords.trim()) ||
        null;
    } else {
      documentTitle = this.getWebsiteTitle(layoutData, isDomestic);
      description = this.getWebsiteDescription(layoutData, isDomestic);
      keywords = this.getWebsiteKeywords(layoutData, isDomestic);
    }

    const ctx: WebsitePageContext & {
      texts: Record<string, string>;
      csrfToken: string;
      bannerImageUrl: string | null;
      bannerTitle: string | null;
    } = {
      locale: langCode,
      title: documentTitle,
      description,
      keywords,
      localeCodes: (await this.langService.getLocaleCodes()) || ['en', 'cn'],
      pathLocale,
      basePath,
      langId: lang.id,
      isDomestic,
      logoUrl,
      navItems,
      viewName: 'website/join-us',
      pageViewPageType: 'join-us',
      csrfToken: typeof csrfToken === 'string' ? csrfToken : '',
      texts,
      bannerImageUrl: banner.imageUrl,
      bannerTitle: banner.title,
      ...commonData,
    };

    return (reply as any).view('website/join-us', ctx);
  }

  @Post('join-us')
  async submitJoinUs(@Req() req: FastifyRequest, @Res() reply: FastifyReply) {
    return this.handleJoinUsSubmit(req, reply, '');
  }

  @Post(':locale/join-us')
  async submitJoinUsLocale(
    @Param('locale') localeParam: string,
    @Req() req: FastifyRequest,
    @Res() reply: FastifyReply,
  ) {
    return this.handleJoinUsSubmit(
      req,
      reply,
      (localeParam || '').toLowerCase(),
    );
  }

  private async handleJoinUsSubmit(
    req: FastifyRequest,
    reply: FastifyReply,
    pathLocale: string,
  ) {
    const asJson = this.wantsJsonResponse(req);
    const lang = await this.langService.findByCodeForRoute(pathLocale || 'en');
    if (!lang) {
      if (asJson) {
        return reply
          .code(404)
          .type('application/json')
          .send({ ok: false, message: 'Not found' });
      }
      return reply.code(404).type('text/plain').send('Not found');
    }

    const layoutData = await this.getLayoutData(lang.id, {
      configKeys: LAYOUT_CONFIG_KEYS,
    });
    const texts = this.getJoinUsTexts(layoutData);
    const langCode = (lang.code || 'en').toLowerCase();
    const isDomestic = langCode === 'cn';

    const basePath = lang.code === 'en' ? '' : `/${lang.code}`;

    // Parse multipart form data with file handling
    let formData: Record<string, unknown> = {};
    let uploadedFiles: { fileName: string; fileUrl: string }[] = [];
    const contentType = req.headers['content-type'] || '';
    if (contentType.includes('multipart/form-data')) {
      const parsed = await this.parseMultipartFormWithFiles(req);
      formData = parsed.fields;
      uploadedFiles = parsed.files;
    } else {
      formData = (req.body as Record<string, unknown>) || {};
    }

    const companyName = this.trimField(formData.companyName, 255);
    const city = this.trimField(formData.city, 128);
    const email = this.trimField(formData.email, 255);
    const phone = this.trimField(formData.phone, 64);
    const message = this.trimField(formData.message, 65535);

    // 验证必填字段
    if (
      !companyName ||
      !city ||
      !email ||
      !this.isValidEmail(email) ||
      !phone ||
      !message
    ) {
      const msgInvalid = isDomestic
        ? '请填写所有必填字段。'
        : 'Please fill in all required fields.';
      if (asJson) {
        return reply
          .code(400)
          .type('application/json')
          .send({ ok: false, message: msgInvalid });
      }
      return reply.redirect(`${basePath}/join-us?error=invalid`, 303);
    }

    // 保存到数据库
    const recruit = this.recruitRepo.create({
      companyName,
      city,
      email,
      phone,
      message,
      qualificationFiles: uploadedFiles.length > 0 ? uploadedFiles : null,
      langId: lang.id,
      status: Status.Normal,
    });
    await this.recruitRepo.save(recruit);

    // 发送邮件通知
    try {
      // 获取系统配置中的招募邮箱地址 (id = 8)
      const recruitEmailConfig = await this.systemConfigRepo.findOne({
        where: { id: 8 },
      });
      const recruitEmail = recruitEmailConfig?.value?.trim() || '';

      const protocol = (req as any).protocol || 'http';
      const hostname = (req as any).hostname || 'localhost';
      const port =
        (req as any).port || (req as any).headers?.host?.split(':')[1] || '';
      const baseUrl =
        port && port !== '80' && port !== '443'
          ? `${protocol}://${hostname}:${port}`
          : `${protocol}://${hostname}`;

      await this.mailService.sendJoinUsEmail({
        recruitId: recruit.id,
        companyName,
        email,
        city,
        phone,
        message,
        qualificationFiles: uploadedFiles,
        createdAt: recruit.createdAt,
        baseUrl,
        toEmail: recruitEmail,
      });
    } catch (error) {
      console.error('发送加入我们邮件失败:', error);
    }

    const msgSuccess =
      texts['text_8'] ||
      (isDomestic ? '申请已提交。' : 'Application submitted.');

    if (asJson) {
      const csrfToken = await (reply as any).generateCsrf?.();
      return reply.type('application/json').send({
        ok: true,
        message: msgSuccess,
        csrfToken: typeof csrfToken === 'string' ? csrfToken : '',
      });
    }

    return reply.redirect(`${basePath}/join-us?success=1`, 303);
  }

  private wantsJsonResponse(req: FastifyRequest): boolean {
    const accept = (req.headers.accept || '').toLowerCase();
    return accept.includes('application/json');
  }

  private trimField(value: unknown, maxLength: number): string | null {
    if (typeof value !== 'string') return null;
    const trimmed = value.trim();
    if (!trimmed) return null;
    return trimmed.slice(0, maxLength);
  }

  private isValidEmail(email: string): boolean {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  }

  private async parseMultipartFormWithFiles(req: FastifyRequest): Promise<{
    fields: Record<string, unknown>;
    files: { fileName: string; fileUrl: string }[];
  }> {
    const fields: Record<string, unknown> = {};
    const files: { fileName: string; fileUrl: string }[] = [];

    try {
      const parts = (req as any).parts?.();
      if (!parts) {
        return {
          fields: (req.body as Record<string, unknown>) || {},
          files: [],
        };
      }

      for await (const part of parts) {
        if (part.type === 'field') {
          const value = await part.value;
          fields[part.fieldname] = value;
        } else if (part.type === 'file') {
          // Save file to disk
          const fileInfo = await this.saveUploadedFile(part);
          if (fileInfo) {
            files.push(fileInfo);
          }
        }
      }
    } catch (error) {
      console.error('Parse multipart form error:', error);
    }

    return { fields, files };
  }

  private async saveUploadedFile(
    part: any,
  ): Promise<{ fileName: string; fileUrl: string } | null> {
    try {
      const originalName = part.filename as string;
      const fileStream = part.file as NodeJS.ReadableStream;

      // Create upload directory
      const now = new Date();
      const yyyyMM = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`;
      const uploadDir = join(
        process.cwd(),
        'public',
        'uploads',
        'qualifications',
        yyyyMM,
      );
      if (!existsSync(uploadDir)) {
        mkdirSync(uploadDir, { recursive: true });
      }

      // Generate safe filename
      const ext = extname(originalName || '').toLowerCase();
      const safeExt = ext && ext.length <= 12 ? ext : '';
      const savedName = `${Date.now()}-${randomBytes(8).toString('hex')}${safeExt}`;
      const diskPath = join(uploadDir, savedName);

      // Save file
      await pipeline(fileStream, createWriteStream(diskPath));

      // Return file info
      const fileUrl = `/uploads/qualifications/${yyyyMM}/${savedName}`;
      return {
        fileName: originalName || savedName,
        fileUrl: fileUrl,
      };
    } catch (error) {
      console.error('Save uploaded file error:', error);
      return null;
    }
  }
}
