import { Controller, Get, Post, Query, Body, Req } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { PageStatsService } from './page-stats.service';
import { getClientIp } from './page-view-ip.util';

@Controller()
export class PageStatsController {
  constructor(private readonly pageStatsService: PageStatsService) {}

  @Post('api/page-view')
  async record(
    @Body('langId') langId: number | string,
    @Body('pageUrl') pageUrl: string,
    @Body('pageType') pageType: string,
    @Body('browser') browser: string | undefined,
    @Req() req: FastifyRequest,
  ) {
    const ua = req.headers['user-agent'];
    const userAgent =
      typeof ua === 'string' ? ua : Array.isArray(ua) ? (ua[0] ?? null) : null;
    const langIdNum =
      typeof langId === 'string' ? parseInt(langId, 10) : langId;
    const session = (
      req as FastifyRequest & { session?: { memberId?: number } }
    ).session;
    const mid = session?.memberId;
    const userId = typeof mid === 'number' && mid > 0 ? mid : undefined;
    const result = await this.pageStatsService.tryRecordPageView({
      langId: langIdNum,
      pageUrl,
      pageType,
      browserHint: browser,
      clientIp: getClientIp(req),
      userAgent,
      userId,
    });
    if (result.ok && result.counted) {
      return { ok: true, counted: true };
    }
    if (result.ok && !result.counted) {
      return { ok: true, counted: false, reason: result.reason };
    }
    return { ok: false, reason: result.reason };
  }

  @Get('api/page-stats')
  async list(@Query('langId') langId?: string) {
    const id = langId ? parseInt(langId, 10) : undefined;
    return this.pageStatsService.getStats(id);
  }
}
