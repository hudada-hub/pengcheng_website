import { Controller, Get, Post, Req, Res, UseGuards } from '@nestjs/common';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { AdminAuthGuard } from '../../common/guards/admin-auth.guard';
import { CsrfGuard } from '../../common/guards/csrf.guard';
import { RedisService } from '../redis/redis.service';

@Controller('admin')
export class AdminCoreController {
  constructor(private readonly redis: RedisService) {}

  @Get()
  @UseGuards(AdminAuthGuard)
  async index(@Res() reply: FastifyReply, @Req() req: FastifyRequest) {
    const session = (req as any).session;
    const csrfToken = await (reply as any).generateCsrf?.();
    return (reply as any).view('admin/dashboard', {
      title: '仪表盘',
      activeMenu: 'dashboard',
      username: session?.adminUsername || 'admin',
      csrfToken: csrfToken ?? '',
    });
  }

  @Post('clear-cache')
  @UseGuards(AdminAuthGuard, CsrfGuard)
  async clearCache(@Res() reply: FastifyReply) {
    await this.redis.clearCache();
    return reply.send({ ok: true, message: '缓存已清除' });
  }

  @Get('not-found')
  @UseGuards(AdminAuthGuard)
  async notFoundPage(@Res() reply: FastifyReply, @Req() req: FastifyRequest) {
    const session = (req as any).session;
    const csrfToken = await (reply as any).generateCsrf?.();
    return (reply as any).view('admin/404', {
      title: '页面不存在',
      username: session?.adminUsername || 'admin',
      csrfToken: csrfToken ?? '',
    });
  }
}
