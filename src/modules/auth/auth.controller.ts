import {
  Controller,
  Get,
  Post,
  Body,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { FastifyRequest, FastifyReply } from 'fastify';
import { AuthService } from './auth.service';
import { AdminAuthGuard } from '../../common/guards/admin-auth.guard';
import { CsrfGuard } from '../../common/guards/csrf.guard';
import * as svgCaptcha from 'svg-captcha';

type AdminSession = {
  adminUserId?: number;
  adminUsername?: string;
  adminCaptchaText?: string;
  destroy?: (callback: (err?: Error) => void) => void;
};

type RequestWithSession = FastifyRequest & { session?: AdminSession | null };

type ReplyWithViewAndCsrf = FastifyReply & {
  view: (template: string, context?: Record<string, unknown>) => unknown;
  generateCsrf?: () => string | Promise<string>;
};

@Controller('admin')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Get('login')
  async loginPage(@Res() reply: FastifyReply) {
    const r = reply as ReplyWithViewAndCsrf;
    const csrfToken = await r.generateCsrf?.();
    return r.view('admin/login', {
      title: '鹏成官网后台管理系统',
      csrfToken: csrfToken ?? '',
      captchaTs: Date.now(),
    });
  }

  @Get('captcha')
  async captcha(@Req() req: FastifyRequest, @Res() reply: FastifyReply) {
    const request = req as RequestWithSession;
    const session = request.session;

    const captcha = svgCaptcha.create({
      size: 4,
      noise: 2,
      width: 120,
      height: 40,
      // 去除人类不易分辨的字符：0/O/o、1/I/l、2/Z/z、5/S/s 等
      ignoreChars: '0oO1ilI2zZ5sS',
      color: true,
      background: '#f5f7ff',
    });

    if (session) {
      session.adminCaptchaText = captcha.text.toLowerCase();
    }

    reply.header('Content-Type', 'image/svg+xml');
    reply.header(
      'Cache-Control',
      'no-store, no-cache, must-revalidate, proxy-revalidate',
    );
    reply.header('Pragma', 'no-cache');
    reply.header('Expires', '0');
    return reply.send(captcha.data);
  }

  @Post('login')
  @UseGuards(CsrfGuard)
  async login(
    @Body('username') username: string,
    @Body('password') password: string,
    @Body('captcha') captcha: string,
    @Req() req: FastifyRequest,
    @Res() reply: FastifyReply,
  ) {
    const r = reply as ReplyWithViewAndCsrf;
    const request = req as RequestWithSession;
    const session = request.session;

    const captchaText = (captcha ?? '').trim().toLowerCase();
    const expectedCaptcha = session?.adminCaptchaText;
    // 为避免极端情况下 Session 丢失导致无法登录：
    // 仅当 Session 中存在验证码值时才强制校验
    if (expectedCaptcha && (!captchaText || expectedCaptcha !== captchaText)) {
      const csrfToken = await r.generateCsrf?.();
      return r.view('admin/login', {
        title: '鹏成官网后台管理系统',
        error: '验证码错误',
        csrfToken: csrfToken ?? '',
        captchaTs: Date.now(),
      });
    }

    const admin = await this.authService.validateAdmin(username, password);
    if (!admin) {
      const csrfToken = await r.generateCsrf?.();
      return r.view('admin/login', {
        title: '鹏成官网后台管理系统',
        error: '用户名或密码错误',
        csrfToken: csrfToken ?? '',
        captchaTs: Date.now(),
      });
    }
    if (session) {
      session.adminUserId = admin.id;
      session.adminUsername = admin.username;
      session.adminCaptchaText = undefined;
    }
    return reply.redirect('/admin', 302);
  }

  @Post('logout')
  @UseGuards(AdminAuthGuard, CsrfGuard)
  async logout(@Req() req: FastifyRequest, @Res() reply: FastifyReply) {
    const request = req as RequestWithSession;
    const session = request.session;
    if (session) {
      session.destroy?.(() => {});
    }
    return reply.redirect('/admin/login', 302);
  }
}
