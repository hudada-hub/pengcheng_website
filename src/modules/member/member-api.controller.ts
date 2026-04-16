import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { CsrfGuard } from '../../common/guards/csrf.guard';
import { MemberService } from './member.service';
import { MemberCartService } from './member-cart.service';
import { MemberCartMergeGuestItemDto } from './dto/member-cart.dto';
import { WebsiteLayoutService } from '../website/website-layout.service';
import { LangService } from '../../i18n/lang.service';

function readBodyString(
  body: Record<string, unknown> | undefined,
  key: string,
): string {
  const v = body?.[key];
  return typeof v === 'string' ? v : v != null ? String(v) : '';
}

function readBodyNumber(
  body: Record<string, unknown> | undefined,
  key: string,
): number | undefined {
  const v = body?.[key];
  if (typeof v === 'number' && Number.isFinite(v)) {
    return v;
  }
  if (typeof v === 'string' && v.trim() !== '') {
    const n = Number(v);
    if (!Number.isNaN(n) && Number.isFinite(n)) {
      return n;
    }
  }
  return undefined;
}

function parseItemIdParam(raw: string): number | undefined {
  const n = parseInt(raw, 10);
  if (!Number.isFinite(n) || n <= 0) {
    return undefined;
  }
  return n;
}

function badRequestMessage(e: unknown): string {
  if (e instanceof BadRequestException) {
    const r = e.getResponse();
    if (typeof r === 'string') {
      return r;
    }
    if (typeof r === 'object' && r !== null && 'message' in r) {
      const m = (r as { message: string | string[] }).message;
      return Array.isArray(m) ? m.join(', ') : String(m);
    }
  }
  return '参数不合法';
}

function parseMergeGuestItems(raw: unknown): MemberCartMergeGuestItemDto[] {
  if (raw === undefined || raw === null) {
    return [];
  }
  if (!Array.isArray(raw)) {
    return [];
  }
  const out: MemberCartMergeGuestItemDto[] = [];
  for (const el of raw) {
    if (!el || typeof el !== 'object') {
      continue;
    }
    const o = el as Record<string, unknown>;
    const productId = readBodyNumber(o, 'productId');
    const qty = readBodyNumber(o, 'qty');
    if (productId != null && qty != null) {
      out.push({ productId, qty });
    }
  }
  return out;
}

function parseParamValueIds(body: Record<string, unknown>): number[] {
  const raw = body?.['paramValueIds'];
  if (!Array.isArray(raw)) {
    return [];
  }
  const out: number[] = [];
  for (const x of raw) {
    const n = typeof x === 'number' ? x : Number(x);
    if (Number.isFinite(n) && n > 0) {
      out.push(Math.floor(n));
    }
  }
  return [...new Set(out)];
}

@Controller('api/member')
export class MemberApiController {
  constructor(
    private readonly memberService: MemberService,
    private readonly memberCartService: MemberCartService,
    private readonly websiteLayoutService: WebsiteLayoutService,
    private readonly langService: LangService,
  ) {}

  /**
   * 从 config 获取 login-register 配置中的指定字段
   */
  private async getLoginRegisterText(
    langId: number,
    key: string,
    fallback: string,
  ): Promise<string> {
    try {
      const layoutData = await this.websiteLayoutService.getLayoutData(langId, {
        includeProducts: false,
      });
      const config = layoutData.configByKey?.['login-register'] as {
        content?: Array<{
          content?: string;
          title?: string;
          description?: string;
        }>;
      } | null;
      if (!config || !Array.isArray(config.content)) return fallback;
      const indexMap: Record<string, number> = {
        signInTitle: 0,
        passwordPlaceholder: 1,
        agreePrefix: 2,
        userAgreementText: 3,
        noAccount: 4,
        registerNow: 5,
        emailPlaceholder: 6,
        registerTitle: 7,
        confirmPasswordPlaceholder: 8,
        msgAgree: 9,
        msgMismatch: 10,
        invalidCredentials: 11,
      };
      const idx = indexMap[key];
      if (idx === undefined) return fallback;
      const row = config.content[idx];
      if (!row || typeof row !== 'object') return fallback;
      const c = typeof row.content === 'string' ? row.content.trim() : '';
      if (c) return c;
      const t = typeof row.title === 'string' ? row.title.trim() : '';
      if (t) return t;
      const d =
        typeof row.description === 'string' ? row.description.trim() : '';
      if (d) return d;
      return fallback;
    } catch {
      return fallback;
    }
  }

  @Get('bootstrap')
  async bootstrap(@Req() req: FastifyRequest, @Res() reply: FastifyReply) {
    const session = req.session;
    const csrfToken = (await (reply as any).generateCsrf?.()) ?? '';
    let member: { id: number; email: string } | null = null;
    const mid = session?.memberId;
    if (typeof mid === 'number' && mid > 0) {
      const u = await this.memberService.findPublicById(mid);
      if (u) {
        member = u;
      } else {
        session.memberId = undefined;
        session.memberEmail = undefined;
      }
    }
    return reply.type('application/json').send({ ok: true, member, csrfToken });
  }

  @Post('register')
  @UseGuards(CsrfGuard)
  async register(
    @Body() body: Record<string, string>,
    @Req() req: FastifyRequest,
    @Res() reply: FastifyReply,
  ) {
    const email = readBodyString(body, 'email');
    const password = readBodyString(body, 'password');
    const passwordConfirm = readBodyString(body, 'passwordConfirm');
    if (password !== passwordConfirm) {
      const csrfToken = (await (reply as any).generateCsrf?.()) ?? '';
      return reply
        .code(400)
        .type('application/json')
        .send({ ok: false, message: '两次输入的密码不一致', csrfToken });
    }
    const r = await this.memberService.register(email, password);
    if (!r.ok) {
      const csrfToken = (await (reply as any).generateCsrf?.()) ?? '';
      return reply
        .code(400)
        .type('application/json')
        .send({ ok: false, message: r.message, csrfToken });
    }
    const session = req.session;
    session.memberId = r.user.id;
    session.memberEmail = r.user.email;
    const csrfToken = (await (reply as any).generateCsrf?.()) ?? '';
    return reply.type('application/json').send({
      ok: true,
      message: '注册成功',
      member: { id: r.user.id, email: r.user.email },
      csrfToken,
    });
  }

  @Post('login')
  @UseGuards(CsrfGuard)
  async login(
    @Body() body: Record<string, string>,
    @Req() req: FastifyRequest,
    @Res() reply: FastifyReply,
  ) {
    const email = readBodyString(body, 'email');
    const password = readBodyString(body, 'password');
    const r = await this.memberService.login(email, password);
    if (!r.ok) {
      const csrfToken = (await (reply as any).generateCsrf?.()) ?? '';
      // 如果是凭证错误，从 config 读取错误消息
      let message = r.message;
      if (r.message === 'INVALID_CREDENTIALS') {
        const lang = await this.langService.findByCodeForRoute('');
        const langId = lang?.id ?? 2; // 默认英文
        message = await this.getLoginRegisterText(
          langId,
          'invalidCredentials',
          'Email or password is wrong',
        );
      }
      return reply
        .code(400)
        .type('application/json')
        .send({ ok: false, message, csrfToken });
    }
    const session = req.session;
    session.memberId = r.user.id;
    session.memberEmail = r.user.email;
    const csrfToken = (await (reply as any).generateCsrf?.()) ?? '';
    return reply.type('application/json').send({
      ok: true,
      message: '登录成功',
      member: { id: r.user.id, email: r.user.email },
      csrfToken,
    });
  }

  @Post('logout')
  @UseGuards(CsrfGuard)
  async logout(@Req() req: FastifyRequest, @Res() reply: FastifyReply) {
    const session = req.session;
    session.memberId = undefined;
    session.memberEmail = undefined;
    const csrfToken = (await (reply as any).generateCsrf?.()) ?? '';
    return reply.type('application/json').send({ ok: true, csrfToken });
  }

  @Get('cart/category/:categoryId/param-options')
  async getCartCategoryParamOptions(
    @Param('categoryId') categoryIdRaw: string,
    @Query('locale') localeQ: string | undefined,
    @Req() req: FastifyRequest,
    @Res() reply: FastifyReply,
  ) {
    const uid = this.requireMemberId(req);
    if (uid === null) {
      return reply
        .code(401)
        .type('application/json')
        .send({ ok: false, message: '请先登录' });
    }
    const categoryId = parseInt(categoryIdRaw, 10);
    if (!Number.isFinite(categoryId) || categoryId < 1) {
      return reply
        .code(400)
        .type('application/json')
        .send({ ok: false, message: 'categoryId 无效' });
    }
    if (localeQ === undefined || localeQ === null) {
      return reply
        .code(400)
        .type('application/json')
        .send({ ok: false, message: 'locale 必填' });
    }
    const locale = String(localeQ);
    try {
      const options = await this.memberCartService.getCategoryParamOptions(
        uid,
        categoryId,
        locale,
      );
      return reply.type('application/json').send({ ok: true, options });
    } catch (e) {
      if (e instanceof NotFoundException) {
        return reply
          .code(404)
          .type('application/json')
          .send({ ok: false, message: e.message });
      }
      return reply
        .code(400)
        .type('application/json')
        .send({ ok: false, message: badRequestMessage(e) });
    }
  }

  @Get('cart/item/:itemId/param-options')
  async getCartItemParamOptions(
    @Param('itemId') itemIdRaw: string,
    @Query('locale') localeQ: string | undefined,
    @Req() req: FastifyRequest,
    @Res() reply: FastifyReply,
  ) {
    const uid = this.requireMemberId(req);
    if (uid === null) {
      return reply
        .code(401)
        .type('application/json')
        .send({ ok: false, message: '请先登录' });
    }
    const itemId = parseItemIdParam(itemIdRaw);
    if (itemId === undefined) {
      return reply
        .code(400)
        .type('application/json')
        .send({ ok: false, message: 'itemId 无效' });
    }
    if (localeQ === undefined || localeQ === null) {
      return reply
        .code(400)
        .type('application/json')
        .send({ ok: false, message: 'locale 必填' });
    }
    const locale = String(localeQ);
    try {
      const options = await this.memberCartService.getItemParamOptions(
        uid,
        itemId,
        locale,
      );
      return reply.type('application/json').send({ ok: true, options });
    } catch (e) {
      if (e instanceof NotFoundException) {
        return reply
          .code(404)
          .type('application/json')
          .send({ ok: false, message: e.message });
      }
      return reply
        .code(400)
        .type('application/json')
        .send({ ok: false, message: badRequestMessage(e) });
    }
  }

  @Get('cart/count')
  async getCartCount(@Req() req: FastifyRequest, @Res() reply: FastifyReply) {
    const uid = this.requireMemberId(req);
    if (uid === null) {
      return reply
        .code(401)
        .type('application/json')
        .send({ ok: false, message: '请先登录' });
    }
    const count = await this.memberCartService.getItemCount(uid);
    return reply.type('application/json').send({ ok: true, count });
  }

  @Get('cart/items')
  async getCartItems(
    @Req() req: FastifyRequest,
    @Query('locale') localeQ: string | undefined,
    @Res() reply: FastifyReply,
  ) {
    const uid = this.requireMemberId(req);
    if (uid === null) {
      return reply
        .code(401)
        .type('application/json')
        .send({ ok: false, message: '请先登录' });
    }
    const locale =
      localeQ === undefined
        ? undefined
        : localeQ === null
          ? undefined
          : String(localeQ);
    const items = await this.memberCartService.getItems(uid, locale);
    return reply.type('application/json').send({ ok: true, items });
  }

  @Post('cart/items')
  @UseGuards(CsrfGuard)
  async postCartItem(
    @Body() body: Record<string, unknown>,
    @Req() req: FastifyRequest,
    @Res() reply: FastifyReply,
  ) {
    const uid = this.requireMemberId(req);
    if (uid === null) {
      const csrfToken = (await (reply as any).generateCsrf?.()) ?? '';
      return reply
        .code(401)
        .type('application/json')
        .send({ ok: false, message: '请先登录', csrfToken });
    }
    const productId = readBodyNumber(body, 'productId');
    const qtyDelta = readBodyNumber(body, 'qtyDelta');
    if (productId === undefined || qtyDelta === undefined) {
      const csrfToken = (await (reply as any).generateCsrf?.()) ?? '';
      return reply.code(400).type('application/json').send({
        ok: false,
        message: 'productId 与 qtyDelta 必填且须为有效数字',
        csrfToken,
      });
    }
    try {
      await this.memberCartService.addItem(uid, productId, qtyDelta);
    } catch (e) {
      const csrfToken = (await (reply as any).generateCsrf?.()) ?? '';
      return reply
        .code(400)
        .type('application/json')
        .send({ ok: false, message: badRequestMessage(e), csrfToken });
    }
    const csrfToken = (await (reply as any).generateCsrf?.()) ?? '';
    return reply.type('application/json').send({ ok: true, csrfToken });
  }

  @Patch('cart/items/:itemId')
  @UseGuards(CsrfGuard)
  async patchCartItem(
    @Param('itemId') itemIdRaw: string,
    @Body() body: Record<string, unknown>,
    @Req() req: FastifyRequest,
    @Res() reply: FastifyReply,
  ) {
    const uid = this.requireMemberId(req);
    if (uid === null) {
      const csrfToken = (await (reply as any).generateCsrf?.()) ?? '';
      return reply
        .code(401)
        .type('application/json')
        .send({ ok: false, message: '请先登录', csrfToken });
    }
    const itemId = parseItemIdParam(itemIdRaw);
    if (itemId === undefined) {
      const csrfToken = (await (reply as any).generateCsrf?.()) ?? '';
      return reply
        .code(400)
        .type('application/json')
        .send({ ok: false, message: 'itemId 无效', csrfToken });
    }
    const qty = readBodyNumber(body, 'qty');
    if (qty === undefined) {
      const csrfToken = (await (reply as any).generateCsrf?.()) ?? '';
      return reply
        .code(400)
        .type('application/json')
        .send({ ok: false, message: 'qty 必填且须为有效数字', csrfToken });
    }
    try {
      await this.memberCartService.updateQty(uid, itemId, qty);
    } catch (e) {
      const csrfToken = (await (reply as any).generateCsrf?.()) ?? '';
      return reply
        .code(400)
        .type('application/json')
        .send({ ok: false, message: badRequestMessage(e), csrfToken });
    }
    const csrfToken = (await (reply as any).generateCsrf?.()) ?? '';
    return reply.type('application/json').send({ ok: true, csrfToken });
  }

  @Delete('cart/items/:itemId')
  @UseGuards(CsrfGuard)
  async deleteCartItem(
    @Param('itemId') itemIdRaw: string,
    @Req() req: FastifyRequest,
    @Res() reply: FastifyReply,
  ) {
    const uid = this.requireMemberId(req);
    if (uid === null) {
      const csrfToken = (await (reply as any).generateCsrf?.()) ?? '';
      return reply
        .code(401)
        .type('application/json')
        .send({ ok: false, message: '请先登录', csrfToken });
    }
    const itemId = parseItemIdParam(itemIdRaw);
    if (itemId === undefined) {
      const csrfToken = (await (reply as any).generateCsrf?.()) ?? '';
      return reply
        .code(400)
        .type('application/json')
        .send({ ok: false, message: 'itemId 无效', csrfToken });
    }
    await this.memberCartService.removeItem(uid, itemId);
    const csrfToken = (await (reply as any).generateCsrf?.()) ?? '';
    return reply.type('application/json').send({ ok: true, csrfToken });
  }

  @Post('cart/start-inquiry')
  @UseGuards(CsrfGuard)
  async postCartStartInquiry(
    @Body() body: Record<string, unknown>,
    @Req() req: FastifyRequest,
    @Res() reply: FastifyReply,
  ) {
    const uid = this.requireMemberId(req);
    if (uid === null) {
      const csrfToken = (await (reply as any).generateCsrf?.()) ?? '';
      return reply
        .code(401)
        .type('application/json')
        .send({ ok: false, message: '请先登录', csrfToken });
    }
    if (
      !body ||
      typeof body !== 'object' ||
      !Object.prototype.hasOwnProperty.call(body, 'locale')
    ) {
      const csrfToken = (await (reply as any).generateCsrf?.()) ?? '';
      return reply
        .code(400)
        .type('application/json')
        .send({ ok: false, message: 'locale 必填', csrfToken });
    }
    const loc = readBodyString(body, 'locale');
    try {
      const r = await this.memberCartService.startInquiry(uid, loc);
      const csrfToken = (await (reply as any).generateCsrf?.()) ?? '';
      return reply
        .type('application/json')
        .send({ ok: true, orderUuid: r.orderUuid, items: r.items, csrfToken });
    } catch (e) {
      const csrfToken = (await (reply as any).generateCsrf?.()) ?? '';
      return reply
        .code(400)
        .type('application/json')
        .send({ ok: false, message: badRequestMessage(e), csrfToken });
    }
  }

  @Post('cart/inquiry-submit')
  @UseGuards(CsrfGuard)
  async postCartInquirySubmit(
    @Body() body: Record<string, unknown>,
    @Req() req: FastifyRequest,
    @Res() reply: FastifyReply,
  ) {
    // 允许未登录用户提交询价，使用 0 作为默认用户ID
    const uid = this.requireMemberId(req) ?? 0;
    try {
      // 合并 firstName 和 lastName 为 fullName
      const firstName = readBodyString(body, 'firstName') || '';
      const lastName = readBodyString(body, 'lastName') || '';
      const fullName =
        `${firstName} ${lastName}`.trim() ||
        readBodyString(body, 'fullName') ||
        '';
      // 从请求中获取 baseUrl（包含端口号）
      const protocol = (req as any).protocol || 'http';
      const hostname = (req as any).hostname || 'localhost';
      const port =
        (req as any).port || (req as any).headers?.host?.split(':')[1] || '';
      const baseUrl =
        port && port !== '80' && port !== '443'
          ? `${protocol}://${hostname}:${port}`
          : `${protocol}://${hostname}`;
      await this.memberCartService.submitCartInquiry(
        uid,
        {
          orderUuid: readBodyString(body, 'orderUuid'),
          fullName: fullName,
          email: readBodyString(body, 'email'),
          nation: readBodyString(body, 'nation'),
          location:
            readBodyString(body, 'location') || readBodyString(body, 'address'),
          phone: readBodyString(body, 'phone'),
          question: readBodyString(body, 'question'),
          sourceUrl: readBodyString(body, 'sourceUrl'),
        },
        baseUrl,
      );
      const csrfToken = (await (reply as any).generateCsrf?.()) ?? '';
      return reply.type('application/json').send({
        ok: true,
        message: '',
        csrfToken,
      });
    } catch (e) {
      const csrfToken = (await (reply as any).generateCsrf?.()) ?? '';
      return reply
        .code(400)
        .type('application/json')
        .send({ ok: false, message: badRequestMessage(e), csrfToken });
    }
  }

  @Post('cart/item/:itemId/replace-by-params')
  @UseGuards(CsrfGuard)
  async postCartItemReplaceByParams(
    @Param('itemId') itemIdRaw: string,
    @Body() body: Record<string, unknown>,
    @Req() req: FastifyRequest,
    @Res() reply: FastifyReply,
  ) {
    const uid = this.requireMemberId(req);
    if (uid === null) {
      const csrfToken = (await (reply as any).generateCsrf?.()) ?? '';
      return reply
        .code(401)
        .type('application/json')
        .send({ ok: false, message: '请先登录', csrfToken });
    }
    const itemId = parseItemIdParam(itemIdRaw);
    if (itemId === undefined) {
      const csrfToken = (await (reply as any).generateCsrf?.()) ?? '';
      return reply
        .code(400)
        .type('application/json')
        .send({ ok: false, message: 'itemId 无效', csrfToken });
    }
    if (
      !body ||
      typeof body !== 'object' ||
      !Object.prototype.hasOwnProperty.call(body, 'locale')
    ) {
      const csrfToken = (await (reply as any).generateCsrf?.()) ?? '';
      return reply
        .code(400)
        .type('application/json')
        .send({ ok: false, message: 'locale 必填', csrfToken });
    }
    const loc = readBodyString(body, 'locale');
    const paramValueIds = parseParamValueIds(body);
    try {
      const item = await this.memberCartService.replaceItemProductByParamValues(
        uid,
        itemId,
        loc,
        paramValueIds,
      );
      const csrfToken = (await (reply as any).generateCsrf?.()) ?? '';
      return reply.type('application/json').send({ ok: true, item, csrfToken });
    } catch (e) {
      const csrfToken = (await (reply as any).generateCsrf?.()) ?? '';
      return reply
        .code(400)
        .type('application/json')
        .send({ ok: false, message: badRequestMessage(e), csrfToken });
    }
  }

  @Post('cart/merge-guest')
  @UseGuards(CsrfGuard)
  async postCartMergeGuest(
    @Body() body: Record<string, unknown>,
    @Req() req: FastifyRequest,
    @Res() reply: FastifyReply,
  ) {
    const uid = this.requireMemberId(req);
    if (uid === null) {
      const csrfToken = (await (reply as any).generateCsrf?.()) ?? '';
      return reply
        .code(401)
        .type('application/json')
        .send({ ok: false, message: '请先登录', csrfToken });
    }
    const mergeToken = readBodyString(body, 'mergeToken').trim();
    if (!mergeToken) {
      const csrfToken = (await (reply as any).generateCsrf?.()) ?? '';
      return reply
        .code(400)
        .type('application/json')
        .send({ ok: false, message: 'mergeToken 必填', csrfToken });
    }
    const itemsRaw = body?.['items'];
    if (
      itemsRaw !== undefined &&
      itemsRaw !== null &&
      !Array.isArray(itemsRaw)
    ) {
      const csrfToken = (await (reply as any).generateCsrf?.()) ?? '';
      return reply
        .code(400)
        .type('application/json')
        .send({ ok: false, message: 'items 须为数组', csrfToken });
    }
    const items = parseMergeGuestItems(itemsRaw);
    try {
      await this.memberCartService.mergeGuest(uid, mergeToken, items);
    } catch (e) {
      const csrfToken = (await (reply as any).generateCsrf?.()) ?? '';
      return reply
        .code(400)
        .type('application/json')
        .send({ ok: false, message: badRequestMessage(e), csrfToken });
    }
    const csrfToken = (await (reply as any).generateCsrf?.()) ?? '';
    return reply.type('application/json').send({ ok: true, csrfToken });
  }

  /**
   * 修改密码
   */
  @Post('change-password')
  async postChangePassword(
    @Body() body: Record<string, unknown>,
    @Req() req: FastifyRequest,
    @Res() reply: FastifyReply,
  ) {
    const uid = this.requireMemberId(req);
    if (uid === null) {
      return reply
        .code(401)
        .type('application/json')
        .send({ success: false, message: '请先登录' });
    }

    const currentPassword = readBodyString(body, 'currentPassword');
    const newPassword = readBodyString(body, 'newPassword');

    if (!currentPassword || !newPassword) {
      return reply
        .code(400)
        .type('application/json')
        .send({ success: false, message: '请填写所有字段' });
    }

    if (newPassword.length < 6) {
      return reply
        .code(400)
        .type('application/json')
        .send({ success: false, message: '新密码长度不能少于6位' });
    }

    try {
      const result = await this.memberService.changePassword(
        uid,
        currentPassword,
        newPassword,
      );
      return reply.type('application/json').send(result);
    } catch (e) {
      const message = e instanceof Error ? e.message : '密码修改失败';
      return reply
        .code(400)
        .type('application/json')
        .send({ success: false, message });
    }
  }

  /**
   * 删除订单（软删除）
   */
  @Delete('orders/:id')
  async deleteOrder(
    @Param('id') idRaw: string,
    @Req() req: FastifyRequest,
    @Res() reply: FastifyReply,
  ) {
    const uid = this.requireMemberId(req);
    if (uid === null) {
      return reply
        .code(401)
        .type('application/json')
        .send({ success: false, message: 'Please login first' });
    }

    const orderId = parseInt(idRaw, 10);
    if (!Number.isFinite(orderId) || orderId <= 0) {
      return reply
        .code(400)
        .type('application/json')
        .send({ success: false, message: 'Invalid order ID' });
    }

    try {
      const result = await this.memberService.deleteOrder(uid, orderId);
      return reply.type('application/json').send(result);
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Failed to delete order';
      return reply
        .code(400)
        .type('application/json')
        .send({ success: false, message });
    }
  }

  private requireMemberId(req: FastifyRequest): number | null {
    const mid = req.session?.memberId;
    if (typeof mid === 'number' && mid > 0) {
      return mid;
    }
    return null;
  }
}
