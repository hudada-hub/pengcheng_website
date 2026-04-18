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
import { parseGlobalMapFromConfigs } from './global-map-layout';

/** 常见 6 项锚条（WHO / CULTURE / MILESTONES / PARTNER / INNOVATIVE / GLOBAL），跳过 lead-energy、battery、customers */
const ABOUT_US_SIX_ANCHOR_KEYS = [
  'who',
  'culture',
  'history',
  'partner',
  'innovative',
  'map',
] as const;

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
  /** 首页同款联系表单：label / 提交按钮 / 成功提示 */
  'contact-us-labels',
  'submit',
  'contact-us-success-text',
  'about-us-banner',
  /** 搜索页文案（后台「搜索页文字」，key_name `seach-page-texts`） */
  'seach-page-texts',
  /** is_array=1：content/title 为锚点文案；linkUrl 可选填区块键 who|lead|culture|history|partner|innovative|battery|customers|map（与页面顺序一致，未填则按顺序自动对应下一区块） */
  'about-us-anchor',
  /** type 1：标题、正文 description、图 bg_pic_url；content.content 为副标题（如 ENEROC） */
  'about-us-whoarwe',
  /** type 5 is_array：title / description + 数组项 title=标签、content=数值、pic1Url=图标 */
  'about-us-lead-energy',
  /** type 8 is_array：企业文化项 title、content、description、pic1Url（图标默认）、pic2Url（图标悬停）、pic3Url（背景默认）、pic4Url（背景悬停）；title=Mission 为中间高亮列 */
  'about-us-culture',
  /** type 8 is_array：title=Milestones、description=History；项 content=年份、title=卡片标题、description=正文 */
  'about-us-history',
  /** type 8 单条 content JSON：title=合作方名、content=右侧说明句、description=正文、pic1Url=蓝框内 logo；可选 slideTitle=右侧灰条大标题、slideWatermark=右下叠字 */
  'about-us-partner',
  /** type 10 is_array：title、description（首句+正文）；数组项 title=左列、description=右列；bg 右侧图 */
  'about-us-innovative',
  /** type 5 is_array：title、description；项 title、content、pic1Url；bg 主图、link_url 可选纹理层 */
  'about-us-battery',
  /** type 2 is_array：每项 pic1Url 为客户 Logo；title + description 为区块文案 */
  'about-us-customers',
  /** type 8：title/description + content 图例与补充；配合 about-us-map-data */
  'about-us-map',
  /** type 10 is_array：title=城市名、description=经度,纬度；content/subDescription 为 hq 表示总部 */
  'about-us-map-data',
];

function trimStr(v: unknown): string {
  return typeof v === 'string' ? v.trim() : '';
}

/** 副标题逐字渲染；首个字母 n/N 用主题色高亮（如 ENEROC） */
function splitAboutUsBrandSubtitle(
  subtitle: string,
): { char: string; accent: boolean }[] {
  const s = subtitle.trim();
  if (!s) return [];
  let accented = false;
  return Array.from(s).map((char) => {
    const accent = !accented && /[Nn]/.test(char);
    if (accent) accented = true;
    return { char, accent };
  });
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

/** 与锚点导航 slug 规则一致，保证 id 与 #who-are-we 一致 */
function slugifyAboutSectionId(label: string): string {
  const base = label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return base || 'section';
}

/** 解析统计项 content：如 18GWh、150+、200+Millions、500 */
function parseLeadEnergyStatValue(raw: string): {
  main: string;
  sup: string;
  suffix: string;
} {
  const s = trimStr(raw);
  if (!s) return { main: '', sup: '', suffix: '' };
  const gwh = s.match(/^(\d+(?:\.\d+)?)\s*(GWh)$/i);
  if (gwh) return { main: gwh[1], sup: '', suffix: 'GWh' };
  const plus = s.match(/^(\d+)\+(.*)$/);
  if (plus) {
    return { main: plus[1], sup: '+', suffix: plus[2].trim() };
  }
  return { main: s, sup: '', suffix: '' };
}

@Controller()
export class AboutUsController extends BaseWebsiteController {
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
    return isDomestic ? '关于我们' : 'About Us';
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

  private expectedAboutUsPath(basePath: string): string {
    const p = (basePath || '').replace(/\/+$/, '');
    return p ? `${p}/about-us` : '/about-us';
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

  private findMenuForAboutUsPage(
    tree: MenuTreeItem[],
    basePath: string,
    targetPath: string,
  ): MenuTreeItem | null {
    const target = this.normalizePathForCompare(targetPath);
    for (const m of tree) {
      if (m.children?.length) {
        const found = this.findMenuForAboutUsPage(
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

  private parseAboutUsBanner(cfg: Config | null): {
    bannerImageUrl: string | null;
    bannerTitle: string;
    bannerSubtitle: string;
    breadcrumbHomeLabel: string;
    breadcrumbCurrentLabel: string;
  } {
    const fallbackTitle = 'About Us';
    if (!isActiveConfig(cfg)) {
      return {
        bannerImageUrl: null,
        bannerTitle: fallbackTitle,
        bannerSubtitle: '',
        breadcrumbHomeLabel: 'Home',
        breadcrumbCurrentLabel: fallbackTitle,
      };
    }
    const contentObj =
      cfg.content &&
      typeof cfg.content === 'object' &&
      !Array.isArray(cfg.content)
        ? cfg.content
        : null;
    const bannerTitle = trimStr(cfg.title) || fallbackTitle;
    const bannerSubtitle = trimStr(cfg.description);
    const breadcrumbHomeLabel = trimStr(contentObj?.title) || 'Home';
    const breadcrumbCurrentLabel =
      trimStr(contentObj?.description) || bannerTitle;
    const bgUrl = normalizePicUrl(trimStr(cfg.bgPicUrl ?? ''));
    return {
      bannerImageUrl: bgUrl,
      bannerTitle,
      bannerSubtitle,
      breadcrumbHomeLabel,
      breadcrumbCurrentLabel,
    };
  }

  /** 锚点文案 + 可选 linkUrl（区块键或实际 section id） */
  private extractAboutUsAnchorRows(
    cfg: Config | null,
  ): Array<{ label: string; target: string }> {
    if (!isActiveConfig(cfg)) return [];
    const raw = cfg.content;
    const arr = Array.isArray(raw) ? raw : [];
    const out: Array<{ label: string; target: string }> = [];
    for (const item of arr) {
      if (!item || typeof item !== 'object') continue;
      const o = item as Record<string, unknown>;
      const label =
        trimStr(o.content) || trimStr(o.title) || trimStr(o.description);
      if (!label) continue;
      const target = trimStr(o.linkUrl ?? '').replace(/^#/, '');
      out.push({ label, target });
    }
    return out;
  }

  private buildAboutUsAnchorItems(
    rows: Array<{ label: string; target: string }>,
    s: {
      whoAreWe: { sectionId: string; hasContent: boolean };
      leadEnergy: { sectionId: string; hasContent: boolean };
      culture: { sectionId: string; hasContent: boolean };
      history: { sectionId: string; hasContent: boolean };
      partner: { sectionId: string; hasContent: boolean };
      innovative: { sectionId: string; hasContent: boolean };
      battery: { sectionId: string; hasContent: boolean };
      customers: { sectionId: string; hasContent: boolean };
      globalMap: { sectionId: string; hasContent: boolean };
    },
  ): Array<{ id: string; label: string }> {
    type Chain = { keys: string[]; id: string };
    const chain: Chain[] = [];
    const add = (keys: string[], id: string, has: boolean) => {
      if (has && id) chain.push({ keys, id });
    };
    add(['who'], s.whoAreWe.sectionId, s.whoAreWe.hasContent);
    add(
      ['lead', 'lead-energy'],
      s.leadEnergy.sectionId,
      s.leadEnergy.hasContent,
    );
    add(['culture'], s.culture.sectionId, s.culture.hasContent);
    add(['history'], s.history.sectionId, s.history.hasContent);
    add(['partner'], s.partner.sectionId, s.partner.hasContent);
    add(['innovative'], s.innovative.sectionId, s.innovative.hasContent);
    add(['battery'], s.battery.sectionId, s.battery.hasContent);
    add(['customers'], s.customers.sectionId, s.customers.hasContent);
    add(['map', 'global-map'], s.globalMap.sectionId, s.globalMap.hasContent);

    console.log('Chain:', chain);
    console.log('Rows:', rows);

    const orderedIds = chain.map((c) => c.id);
    const targetToId = new Map<string, string>();
    for (const { keys, id } of chain) {
      for (const k of keys) {
        if (!targetToId.has(k)) targetToId.set(k, id);
      }
    }

    console.log('Target to ID:', targetToId);
    console.log('Ordered IDs:', orderedIds);

    // 直接使用 queue 机制，不依赖于固定的六个锚点顺序
    let queue = [...orderedIds];
    const usedOut = new Set<string>();
    const result: Array<{ id: string; label: string }> = [];

    for (const row of rows) {
      const t = row.target.trim().toLowerCase();
      let id: string | null = null;
      if (t) {
        if (targetToId.has(t)) id = targetToId.get(t)!;
        else if (orderedIds.includes(t)) id = t;
      }
      if (id) {
        queue = queue.filter((x) => x !== id);
      } else if (queue.length) {
        id = queue.shift()!;
      }
      if (!id || usedOut.has(id)) continue;
      usedOut.add(id);
      result.push({ id, label: row.label });
    }

    console.log('Result:', result);
    return result;
  }

  private parseAboutUsWhoAreWe(cfg: Config | null): {
    sectionId: string;
    title: string;
    subtitle: string;
    brandLetters: { char: string; accent: boolean }[];
    body: string;
    imageUrl: string | null;
    hasContent: boolean;
  } {
    if (!isActiveConfig(cfg)) {
      return {
        sectionId: 'who-are-we',
        title: '',
        subtitle: '',
        brandLetters: [],
        body: '',
        imageUrl: null,
        hasContent: false,
      };
    }
    const contentObj =
      cfg.content &&
      typeof cfg.content === 'object' &&
      !Array.isArray(cfg.content)
        ? cfg.content
        : null;
    const title = trimStr(cfg.title);
    const body = trimStr(cfg.description);
    const subtitle = trimStr(contentObj?.content) || trimStr(contentObj?.title);
    const brandLetters = splitAboutUsBrandSubtitle(subtitle);
    const imageUrl = normalizePicUrl(trimStr(cfg.bgPicUrl ?? ''));
    const sectionId = slugifyAboutSectionId(title || 'who are we');
    const hasContent = !!(title || body || imageUrl || subtitle);
    return {
      sectionId,
      title,
      subtitle,
      brandLetters,
      body,
      imageUrl,
      hasContent,
    };
  }

  private parseAboutUsLeadEnergy(
    cfg: Config | null,
    locale: string,
  ): {
    sectionId: string;
    title: string;
    intro: string;
    keyNumbersLabel: string;
    stats: Array<{
      iconUrl: string | null;
      label: string;
      valueMain: string;
      valueSup: string;
      valueSuffix: string;
      /** 数字滚动目标，非数字时为 null */
      animTarget: number | null;
      /** Handlebars #if animTarget 对 0 为假，用此字段控制是否滚动 */
      useCounter: boolean;
    }>;
    hasContent: boolean;
  } {
    if (!isActiveConfig(cfg)) {
      return {
        sectionId: 'lead-energy-revolution',
        title: '',
        intro: '',
        keyNumbersLabel: locale === 'cn' ? '关键数据' : 'Key Numbers',
        stats: [],
        hasContent: false,
      };
    }
    const title = trimStr(cfg.title);
    const intro = trimStr(cfg.description);
    const keyNumbersLabel = locale === 'cn' ? '关键数据' : 'Key Numbers';
    const raw = cfg.content;
    const arr = Array.isArray(raw) ? raw : [];
    const stats: Array<{
      iconUrl: string | null;
      label: string;
      valueMain: string;
      valueSup: string;
      valueSuffix: string;
      animTarget: number | null;
      useCounter: boolean;
    }> = [];
    for (const item of arr) {
      if (!item || typeof item !== 'object') continue;
      const o = item as Record<string, unknown>;
      const label = trimStr(o.title);
      const valueRaw = trimStr(o.content);
      const pic = normalizePicUrl(trimStr(o.pic1Url ?? ''));
      if (!label && !valueRaw && !pic) continue;
      const v = parseLeadEnergyStatValue(valueRaw);
      const animNum = parseFloat(
        String(v.main).replace(/\s/g, '').replace(/,/g, '.'),
      );
      const animTarget = Number.isFinite(animNum) ? animNum : null;
      stats.push({
        iconUrl: pic,
        label: label || '—',
        valueMain: v.main,
        valueSup: v.sup,
        valueSuffix: v.suffix,
        animTarget,
        useCounter: animTarget !== null,
      });
    }
    const sectionId = slugifyAboutSectionId(title || 'lead energy revolution');
    const hasContent = !!(title || intro || stats.length);
    return { sectionId, title, intro, keyNumbersLabel, stats, hasContent };
  }

  /** Vision / Value 与 Mission 中间列：兼容 mission、misión、使命 等 */
  private isAboutUsCultureMissionTitle(itemTitle: string): boolean {
    const s = trimStr(itemTitle);
    if (!s) return false;
    if (s.includes('使命')) return true;
    const n = s
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');
    return n === 'mission' || n === 'mision';
  }

  private parseAboutUsCulture(cfg: Config | null): {
    sectionId: string;
    title: string;
    intro: string;
    bgUrl: string | null;
    items: Array<{
      itemTitle: string;
      text: string;
      iconUrl: string | null;
      iconHoverUrl: string | null;
      bgUrl: string | null;
      bgHoverUrl: string | null;
      isMission: boolean;
      slideSwap: boolean;
    }>;
    hasContent: boolean;
  } {
    if (!isActiveConfig(cfg)) {
      return {
        sectionId: 'corporate-culture',
        title: '',
        intro: '',
        bgUrl: null,
        items: [],
        hasContent: false,
      };
    }
    const title = trimStr(cfg.title);
    const intro = trimStr(cfg.description);
    const bgUrl = normalizePicUrl(trimStr(cfg.bgPicUrl ?? ''));
    const raw = cfg.content;
    const arr = Array.isArray(raw) ? raw : [];
    const items: Array<{
      itemTitle: string;
      text: string;
      iconUrl: string | null;
      iconHoverUrl: string | null;
      bgUrl: string | null;
      bgHoverUrl: string | null;
      isMission: boolean;
      slideSwap: boolean;
    }> = [];
    for (const row of arr) {
      if (!row || typeof row !== 'object') continue;
      const o = row as Record<string, unknown>;
      const itemTitle = trimStr(o.title);
      const text = trimStr(o.content) || trimStr(o.description);
      const iconUrl = normalizePicUrl(trimStr(o.pic1Url ?? '')) || null;
      const iconHoverUrl = normalizePicUrl(trimStr(o.pic2Url ?? '')) || null;
      const bgPic3 = normalizePicUrl(trimStr(o.pic3Url ?? '')) || null;
      const bgPic4 = normalizePicUrl(trimStr(o.pic4Url ?? '')) || null;
      if (!itemTitle && !text && !iconUrl && !bgPic3) continue;
      const isMission = this.isAboutUsCultureMissionTitle(itemTitle);
      let itemBgUrl: string | null;
      let itemBgHoverUrl: string | null;
      if (isMission) {
        itemBgUrl = bgPic3 || '/images/global/culture04.png';
        itemBgHoverUrl = null;
      } else {
        itemBgUrl = bgPic3 || '/images/global/culture03.png';
        /* pic4Url 未配时仍输出第二张图，悬浮才能切换背景（与参考稿双图一致；可用仓库内另一张占位） */
        itemBgHoverUrl = bgPic4 || '/images/global/culture04.png';
      }
      const slideSwap = !isMission;
      items.push({
        itemTitle: itemTitle || '—',
        text,
        iconUrl,
        iconHoverUrl,
        bgUrl: itemBgUrl,
        bgHoverUrl: itemBgHoverUrl,
        isMission,
        slideSwap,
      });
    }
    const sectionId = slugifyAboutSectionId(title || 'corporate culture');
    const hasContent = !!(title || intro || bgUrl || items.length);
    return { sectionId, title, intro, bgUrl, items, hasContent };
  }

  private parseAboutUsHistory(cfg: Config | null): {
    sectionId: string;
    title: string;
    subtitle: string;
    items: Array<{
      year: string;
      cardTitle: string;
      cardBody: string;
      isTop: boolean;
    }>;
    hasContent: boolean;
  } {
    if (!isActiveConfig(cfg)) {
      return {
        sectionId: 'milestones',
        title: '',
        subtitle: '',
        items: [],
        hasContent: false,
      };
    }
    const title = trimStr(cfg.title);
    const subtitle = trimStr(cfg.description);
    const raw = cfg.content;
    const arr = Array.isArray(raw) ? raw : [];
    const tmp: Array<{
      year: string;
      yearNum: number;
      cardTitle: string;
      cardBody: string;
    }> = [];
    for (const row of arr) {
      if (!row || typeof row !== 'object') continue;
      const o = row as Record<string, unknown>;
      const yearRaw = trimStr(o.content);
      const cardTitle = trimStr(o.title);
      const cardBody = trimStr(o.description);
      const digits = yearRaw.replace(/\D/g, '');
      const yearNum = digits ? parseInt(digits.slice(0, 4), 10) : 0;
      if (!yearRaw && !cardTitle && !cardBody) continue;
      tmp.push({
        year: yearRaw || '—',
        yearNum: Number.isFinite(yearNum) ? yearNum : 0,
        cardTitle: cardTitle || '—',
        cardBody,
      });
    }
    tmp.sort((a, b) => {
      if (a.yearNum !== b.yearNum) return a.yearNum - b.yearNum;
      return a.year.localeCompare(b.year);
    });
    const asc = tmp.map((x, i) => ({
      year: x.year,
      cardTitle: x.cardTitle,
      cardBody: x.cardBody,
      isTop: i % 2 === 0,
    }));
    const items = asc
      .slice()
      .reverse()
      .map((x, i) => ({
        year: x.year,
        cardTitle: x.cardTitle,
        cardBody: x.cardBody,
        isTop: i % 2 === 0,
      }));
    const sectionId = slugifyAboutSectionId(title || 'milestones');
    const hasContent = items.length > 0;
    return { sectionId, title, subtitle, items, hasContent };
  }

  private parseAboutUsPartner(cfg: Config | null): {
    sectionId: string;
    headlineSmall: string;
    headlineLarge: string;
    heroImageUrl: string | null;
    partnerName: string;
    partnerTagline: string;
    bodyParagraphs: string[];
    boxLogoUrl: string | null;
    /** 右侧灰底大标题条文案（content JSON 可选 slideTitle / itemTitle） */
    slideTitle: string;
    /** 右侧底部大字叠字（content JSON 可选 slideWatermark） */
    slideWatermark: string;
    hasContent: boolean;
  } {
    if (!isActiveConfig(cfg)) {
      return {
        sectionId: 'our-strong-partner',
        headlineSmall: '',
        headlineLarge: '',
        heroImageUrl: null,
        partnerName: '',
        partnerTagline: '',
        bodyParagraphs: [],
        boxLogoUrl: null,
        slideTitle: '',
        slideWatermark: '',
        hasContent: false,
      };
    }
    const headlineSmall = trimStr(cfg.title);
    const headlineLarge = trimStr(cfg.description);
    const heroImageUrl = normalizePicUrl(trimStr(cfg.bgPicUrl ?? ''));
    const raw = cfg.content;
    const obj =
      raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : null;
    const partnerName = trimStr(obj?.title);
    const partnerTagline = trimStr(obj?.content);
    /** 右侧灰条标题：兼容 hand-written slideTitle / itemTitle，以及 type 12 的 subtitle（如 Inversor） */
    let slideTitle = trimStr(
      typeof obj?.slideTitle === 'string' ? obj.slideTitle : '',
    );
    if (!slideTitle)
      slideTitle = trimStr(
        typeof obj?.itemTitle === 'string' ? obj.itemTitle : '',
      );
    if (!slideTitle)
      slideTitle = trimStr(
        typeof obj?.subtitle === 'string' ? obj.subtitle : '',
      );
    /** 右侧叠字大字：默认可用 type 12 的 subDescription；仍优先 slideWatermark */
    let slideWatermark = trimStr(
      typeof obj?.slideWatermark === 'string' ? obj.slideWatermark : '',
    );
    if (!slideWatermark)
      slideWatermark = trimStr(
        typeof obj?.subDescription === 'string' ? obj.subDescription : '',
      );
    const bodyRaw = trimStr(obj?.description);
    const boxLogoUrl = normalizePicUrl(trimStr(obj?.pic1Url ?? ''));
    let bodyParagraphs: string[] = [];
    if (bodyRaw) {
      bodyParagraphs = bodyRaw
        .split(/\n\s*\n/)
        .map((p) => p.trim())
        .filter(Boolean);
      if (bodyParagraphs.length === 0) bodyParagraphs = [bodyRaw];
    }
    const headCombined = `${headlineSmall} ${headlineLarge}`.trim();
    const sectionId = slugifyAboutSectionId(
      headCombined || 'our strong partner',
    );
    const hasContent = !!(
      headlineSmall ||
      headlineLarge ||
      heroImageUrl ||
      partnerName ||
      partnerTagline ||
      bodyParagraphs.length ||
      boxLogoUrl ||
      slideTitle ||
      slideWatermark
    );
    return {
      sectionId,
      headlineSmall,
      headlineLarge,
      heroImageUrl,
      partnerName,
      partnerTagline,
      bodyParagraphs,
      boxLogoUrl,
      slideTitle,
      slideWatermark,
      hasContent,
    };
  }

  /** description 首句（至首个「. 」）为橙色引导，其余为灰色正文 */
  private splitInnovativeIntro(raw: string): { lead: string; rest: string } {
    const s = trimStr(raw);
    if (!s) return { lead: '', rest: '' };
    const idx = s.indexOf('. ');
    if (idx === -1) return { lead: '', rest: s };
    return { lead: s.slice(0, idx + 1).trim(), rest: s.slice(idx + 2).trim() };
  }

  private parseAboutUsInnovative(cfg: Config | null): {
    sectionId: string;
    title: string;
    lead: string;
    rest: string;
    heroImageUrl: string | null;
    rows: Array<{ label: string; desc: string }>;
    hasContent: boolean;
  } {
    if (!isActiveConfig(cfg)) {
      return {
        sectionId: 'innovative-r-d',
        title: '',
        lead: '',
        rest: '',
        heroImageUrl: null,
        rows: [],
        hasContent: false,
      };
    }
    const title = trimStr(cfg.title);
    const descRaw = trimStr(cfg.description);
    const { lead, rest } = this.splitInnovativeIntro(descRaw);
    const heroImageUrl = normalizePicUrl(trimStr(cfg.bgPicUrl ?? ''));
    const raw = cfg.content;
    const arr = Array.isArray(raw) ? raw : [];
    const rows: Array<{ label: string; desc: string }> = [];
    for (const row of arr) {
      if (!row || typeof row !== 'object') continue;
      const o = row as Record<string, unknown>;
      const label = trimStr(o.title);
      const desc = trimStr(o.description);
      if (!label && !desc) continue;
      rows.push({ label: label || '—', desc });
    }
    const sectionId = slugifyAboutSectionId(title || 'innovative r&d');
    const hasContent = !!(title || descRaw || heroImageUrl || rows.length);
    return { sectionId, title, lead, rest, heroImageUrl, rows, hasContent };
  }

  /** 展示用标题：单词首字母大写 */
  private toDisplayTitleWords(raw: string): string {
    const s = trimStr(raw);
    if (!s) return '';
    return s
      .split(/\s+/)
      .map((w) =>
        w ? w.charAt(0).toUpperCase() + w.slice(1).toLowerCase() : '',
      )
      .join(' ');
  }

  private parseAboutUsBattery(cfg: Config | null): {
    sectionId: string;
    displayTitle: string;
    intro: string;
    heroImageUrl: string | null;
    patternImageUrl: string | null;
    items: Array<{ itemTitle: string; text: string; iconUrl: string | null }>;
    hasContent: boolean;
  } {
    if (!isActiveConfig(cfg)) {
      return {
        sectionId: 'forklift-battery',
        displayTitle: '',
        intro: '',
        heroImageUrl: null,
        patternImageUrl: null,
        items: [],
        hasContent: false,
      };
    }
    const rawTitle = trimStr(cfg.title);
    const displayTitle = this.toDisplayTitleWords(rawTitle);
    const intro = trimStr(cfg.description);
    const heroImageUrl = normalizePicUrl(trimStr(cfg.bgPicUrl ?? ''));
    const patternImageUrl = normalizePicUrl(trimStr(cfg.linkUrl ?? ''));
    const raw = cfg.content;
    const arr = Array.isArray(raw) ? raw : [];
    const items: Array<{
      itemTitle: string;
      text: string;
      iconUrl: string | null;
    }> = [];
    for (const row of arr) {
      if (!row || typeof row !== 'object') continue;
      const o = row as Record<string, unknown>;
      const itemTitle = trimStr(o.title);
      const text = trimStr(o.content) || trimStr(o.description);
      const iconUrl = normalizePicUrl(trimStr(o.pic1Url ?? ''));
      if (!itemTitle && !text && !iconUrl) continue;
      items.push({
        itemTitle: itemTitle || '—',
        text,
        iconUrl,
      });
    }
    const sectionId = slugifyAboutSectionId(rawTitle || 'forklift battery');
    const hasContent = !!(
      rawTitle ||
      intro ||
      heroImageUrl ||
      patternImageUrl ||
      items.length
    );
    return {
      sectionId,
      displayTitle,
      intro,
      heroImageUrl,
      patternImageUrl,
      items,
      hasContent,
    };
  }

  private parseAboutUsCustomers(cfg: Config | null): {
    sectionId: string;
    title: string;
    intro: string;
    logos: string[];
    hasContent: boolean;
  } {
    if (!isActiveConfig(cfg)) {
      return {
        sectionId: 'our-customers',
        title: '',
        intro: '',
        logos: [],
        hasContent: false,
      };
    }
    const title = trimStr(cfg.title);
    const intro = trimStr(cfg.description);
    const raw = cfg.content;
    const arr = Array.isArray(raw) ? raw : [];
    const logos: string[] = [];
    for (const row of arr) {
      if (!row || typeof row !== 'object') continue;
      const o = row as Record<string, unknown>;
      const u = normalizePicUrl(trimStr(o.pic1Url ?? ''));
      if (u) logos.push(u);
    }
    const sectionId = slugifyAboutSectionId(title || 'our customers');
    const hasContent = !!(title || intro || logos.length);
    return { sectionId, title, intro, logos, hasContent };
  }

  private async getAboutUsPagePayload(pathLocale: string) {
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

    const bannerCfg = layoutData.configByKey['about-us-banner'] ?? null;
    const banner = this.parseAboutUsBanner(bannerCfg);

    const anchorCfg = layoutData.configByKey['about-us-anchor'] ?? null;
    const aboutUsAnchorRows = this.extractAboutUsAnchorRows(anchorCfg);

    const whoAreWeCfg = layoutData.configByKey['about-us-whoarwe'] ?? null;
    const whoAreWe = this.parseAboutUsWhoAreWe(whoAreWeCfg);

    const leadEnergyCfg =
      layoutData.configByKey['about-us-lead-energy'] ?? null;
    const leadEnergy = this.parseAboutUsLeadEnergy(leadEnergyCfg, locale);

    const cultureCfg = layoutData.configByKey['about-us-culture'] ?? null;
    const culture = this.parseAboutUsCulture(cultureCfg);

    const historyCfg = layoutData.configByKey['about-us-history'] ?? null;
    const history = this.parseAboutUsHistory(historyCfg);

    const partnerCfg = layoutData.configByKey['about-us-partner'] ?? null;
    const partner = this.parseAboutUsPartner(partnerCfg);

    const innovativeCfg = layoutData.configByKey['about-us-innovative'] ?? null;
    const innovative = this.parseAboutUsInnovative(innovativeCfg);

    const batteryCfg = layoutData.configByKey['about-us-battery'] ?? null;
    const battery = this.parseAboutUsBattery(batteryCfg);

    const customersCfg = layoutData.configByKey['about-us-customers'] ?? null;
    const customers = this.parseAboutUsCustomers(customersCfg);

    const globalMap = parseGlobalMapFromConfigs(
      layoutData.configByKey['about-us-map'] ?? null,
      layoutData.configByKey['about-us-map-data'] ?? null,
    );
    const mapZh = locale === 'cn';

    const aboutUsAnchorItems = this.buildAboutUsAnchorItems(aboutUsAnchorRows, {
      whoAreWe,
      leadEnergy,
      culture,
      history,
      partner,
      innovative,
      battery,
      customers,
      globalMap,
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

    const resolvedLangCode = lang.code;
    const contactUsSuccessText = this.getContactUsSuccessText(
      layoutData,
      resolvedLangCode,
    );
    const isZhContact = resolvedLangCode === 'cn';
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

    const menus = layoutData.menus || [];
    const expectedPath = this.expectedAboutUsPath(basePath);
    const menuNode = this.findMenuForAboutUsPage(menus, basePath, expectedPath);
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
        banner.bannerTitle || this.getWebsiteTitle(layoutData, isDomestic);
      metaDesc = banner.bannerSubtitle?.trim() || null;
      metaKw = null;
    }

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
      viewName: 'website/about-us',
      pageViewPageType: 'about-us',
      bannerImageUrl: banner.bannerImageUrl,
      aboutUsBannerTitle: banner.bannerTitle,
      aboutUsBannerSubtitle: banner.bannerSubtitle,
      aboutUsBreadcrumbHomeLabel: banner.breadcrumbHomeLabel,
      aboutUsBreadcrumbCurrentLabel: banner.breadcrumbCurrentLabel,
      aboutUsAnchorItems,
      hasAboutUsAnchorNav: aboutUsAnchorItems.length > 0,
      aboutUsWhoAreWeSectionId: whoAreWe.sectionId,
      aboutUsWhoAreWeTitle: whoAreWe.title,
      aboutUsWhoAreWeSubtitle: whoAreWe.subtitle,
      aboutUsWhoAreWeBrandLetters: whoAreWe.brandLetters,
      aboutUsWhoAreWeBody: whoAreWe.body,
      aboutUsWhoAreWeImageUrl: whoAreWe.imageUrl,
      hasAboutUsWhoAreWe: whoAreWe.hasContent,
      aboutUsLeadEnergySectionId: leadEnergy.sectionId,
      aboutUsLeadEnergyTitle: leadEnergy.title,
      aboutUsLeadEnergyIntro: leadEnergy.intro,
      aboutUsLeadEnergyKeyNumbersLabel: leadEnergy.keyNumbersLabel,
      aboutUsLeadEnergyStats: leadEnergy.stats,
      hasAboutUsLeadEnergy: leadEnergy.hasContent,
      aboutUsCultureSectionId: culture.sectionId,
      aboutUsCultureTitle: culture.title,
      aboutUsCultureIntro: culture.intro,
      aboutUsCultureBgUrl: culture.bgUrl,
      aboutUsCultureItems: culture.items,
      hasAboutUsCulture: culture.hasContent,
      aboutUsHistorySectionId: history.sectionId,
      aboutUsHistoryTitle: history.title,
      aboutUsHistorySubtitle: history.subtitle,
      aboutUsHistoryItems: history.items,
      hasAboutUsHistory: history.hasContent,
      aboutUsPartnerSectionId: partner.sectionId,
      aboutUsPartnerHeadlineSmall: partner.headlineSmall,
      aboutUsPartnerHeadlineLarge: partner.headlineLarge,
      aboutUsPartnerHeroImageUrl: partner.heroImageUrl,
      aboutUsPartnerName: partner.partnerName,
      aboutUsPartnerTagline: partner.partnerTagline,
      aboutUsPartnerBodyParagraphs: partner.bodyParagraphs,
      aboutUsPartnerBoxLogoUrl: partner.boxLogoUrl,
      aboutUsPartnerSlideTitle: partner.slideTitle,
      aboutUsPartnerSlideWatermark: partner.slideWatermark,
      hasAboutUsPartner: partner.hasContent,
      aboutUsInnovativeSectionId: innovative.sectionId,
      aboutUsInnovativeTitle: innovative.title,
      aboutUsInnovativeLead: innovative.lead,
      aboutUsInnovativeRest: innovative.rest,
      aboutUsInnovativeHeroUrl: innovative.heroImageUrl,
      aboutUsInnovativeRows: innovative.rows,
      hasAboutUsInnovative: innovative.hasContent,
      aboutUsBatterySectionId: battery.sectionId,
      aboutUsBatteryDisplayTitle: battery.displayTitle,
      aboutUsBatteryIntro: battery.intro,
      aboutUsBatteryHeroUrl: battery.heroImageUrl,
      aboutUsBatteryPatternUrl: battery.patternImageUrl,
      aboutUsBatteryItems: battery.items,
      hasAboutUsBattery: battery.hasContent,
      aboutUsCustomersSectionId: customers.sectionId,
      aboutUsCustomersTitle: customers.title,
      aboutUsCustomersIntro: customers.intro,
      aboutUsCustomerLogos: customers.logos,
      hasAboutUsCustomers: customers.hasContent,
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
        (mapZh ? '全球销售与服务网络' : 'Global sales and service network'),
      globalMapLegendAria: mapZh ? '图例' : 'Map legend',
      globalMapErrNoEcharts: mapZh ? '图表库未加载' : 'ECharts unavailable',
      globalMapErrLoad: mapZh ? '地图加载失败' : 'Map failed to load',
      globalMapLoadingText: mapZh ? '加载地图中…' : 'Loading map…',
      contactUsSuccessText,
      contactToastInvalid,
      contactToastNetwork,
      contactToastForbidden,
      contactToastErrTitle,
      ...commonData,
    };
  }

  @Get('about-us')
  async aboutUsRoot(@Req() req: FastifyRequest, @Res() reply: FastifyReply) {
    const ctx = await this.getAboutUsPagePayload('');
    (req as any)[LOCALE_KEY] = ctx.locale;
    const contactFormCsrfToken = await (reply as any).generateCsrf?.();
    return (reply as any).view(ctx.viewName, {
      ...ctx,
      contactFormCsrfToken: contactFormCsrfToken ?? '',
    });
  }

  @Get(':locale/about-us')
  async aboutUsLocale(
    @Param('locale') localeParam: string,
    @Req() req: FastifyRequest,
    @Res() reply: FastifyReply,
  ) {
    const pathLocale = (localeParam || '').toLowerCase();
    const ctx = await this.getAboutUsPagePayload(pathLocale);
    (req as any)[LOCALE_KEY] = ctx.locale;
    const contactFormCsrfToken = await (reply as any).generateCsrf?.();
    return (reply as any).view(ctx.viewName, {
      ...ctx,
      contactFormCsrfToken: contactFormCsrfToken ?? '',
    });
  }
}
