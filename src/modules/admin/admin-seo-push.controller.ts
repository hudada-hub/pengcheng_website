import {
  Controller,
  Get,
  Post,
  Body,
  Res,
  UseGuards,
  Req,
} from '@nestjs/common';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AdminAuthGuard } from '../../common/guards/admin-auth.guard';
import { CsrfGuard } from '../../common/guards/csrf.guard';
import { SystemConfig } from '../../entities/system-config.entity';

@Controller('admin')
export class AdminSeoPushController {
  constructor(
    @InjectRepository(SystemConfig)
    private readonly systemConfigRepo: Repository<SystemConfig>,
  ) {}

  @Get('seo-sitemap-push')
  @UseGuards(AdminAuthGuard)
  async index(@Res() reply: FastifyReply, @Req() req: FastifyRequest) {
    const session = (req as any).session;
    const csrfToken = await (reply as any).generateCsrf?.();
    const baseUrl = process.env.SITE_URL || 'https://example.com';
    const sitemapUrl = `${baseUrl}/sitemap.xml`;

    const configs = await this.systemConfigRepo.find({
      where: { deletable: 0 },
    });

    const configMap = configs.reduce(
      (acc, cfg) => {
        acc[cfg.name] = cfg.value || '';
        return acc;
      },
      {} as Record<string, string>,
    );

    return (reply as any).view('admin/seo-sitemap-push', {
      title: '搜索引擎推送站点地图',
      activeMenu: 'seo-sitemap-push',
      username: session?.adminUsername || 'admin',
      csrfToken: csrfToken ?? '',
      sitemapUrl: sitemapUrl,
      baiduToken: configMap['seo_baidu_token'] || '',
      bingApiKey: configMap['seo_bing_api_key'] || '',
      googleApiKey: configMap['seo_google_api_key'] || '',
      lastPushTime: configMap['seo_last_push_time'] || null,
    });
  }

  @Post('seo-push/save-config')
  @UseGuards(AdminAuthGuard, CsrfGuard)
  async saveConfig(
    @Res() reply: FastifyReply,
    @Body()
    body: { baiduToken?: string; bingApiKey?: string; googleApiKey?: string },
  ) {
    const configs = [
      { name: 'seo_baidu_token', value: body.baiduToken || '' },
      { name: 'seo_bing_api_key', value: body.bingApiKey || '' },
      { name: 'seo_google_api_key', value: body.googleApiKey || '' },
    ];

    for (const cfg of configs) {
      const existing = await this.systemConfigRepo.findOne({
        where: { name: cfg.name },
      });
      if (existing) {
        existing.value = cfg.value;
        await this.systemConfigRepo.save(existing);
      } else {
        const newConfig = this.systemConfigRepo.create({
          name: cfg.name,
          value: cfg.value,
          type: 2,
          deletable: 0,
        });
        await this.systemConfigRepo.save(newConfig);
      }
    }

    return reply.send({ ok: true, message: '配置已保存' });
  }

  @Post('seo-push/baidu')
  @UseGuards(AdminAuthGuard, CsrfGuard)
  async pushToBaidu(
    @Res() reply: FastifyReply,
    @Body() body: { sitemapUrl: string },
  ) {
    const config = await this.systemConfigRepo.findOne({
      where: { name: 'seo_baidu_token' },
    });

    if (!config?.value) {
      return reply
        .status(400)
        .send({ ok: false, message: '请先配置百度推送Token' });
    }

    const siteUrl = process.env.SITE_URL || 'https://example.com';
    const apiUrl = `http://data.zz.baidu.com/urls?site=${siteUrl}&token=${config.value}`;

    try {
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'text/plain',
        },
        body: body.sitemapUrl,
      });

      const result = await response.json();

      await this.updateLastPushTime();

      return reply.send({
        ok: response.ok,
        message: response.ok
          ? `推送成功！今日剩余 ${result.remain} 条配额，成功推送 ${result.success} 条`
          : `推送失败：${result.message}`,
        data: result,
      });
    } catch (error) {
      return reply
        .status(500)
        .send({ ok: false, message: `推送失败：${error.message}` });
    }
  }

  @Post('seo-push/bing')
  @UseGuards(AdminAuthGuard, CsrfGuard)
  async pushToBing(
    @Res() reply: FastifyReply,
    @Body() body: { sitemapUrl: string },
  ) {
    const config = await this.systemConfigRepo.findOne({
      where: { name: 'seo_bing_api_key' },
    });

    if (!config?.value) {
      return reply
        .status(400)
        .send({ ok: false, message: '请先配置Bing API密钥' });
    }

    const siteUrl = process.env.SITE_URL || 'https://example.com';
    const apiUrl = `https://www.bing.com/webmaster/ping.aspx?siteMap=${encodeURIComponent(body.sitemapUrl)}`;

    try {
      const response = await fetch(apiUrl, {
        method: 'GET',
      });

      if (response.ok || response.status === 200) {
        await this.updateLastPushTime();
        return reply.send({ ok: true, message: 'Bing站点地图提交成功！' });
      } else {
        return reply.status(400).send({
          ok: false,
          message: `Bing提交失败，状态码：${response.status}`,
        });
      }
    } catch (error) {
      return reply
        .status(500)
        .send({ ok: false, message: `Bing提交失败：${error.message}` });
    }
  }

  @Post('seo-push/google')
  @UseGuards(AdminAuthGuard, CsrfGuard)
  async pushToGoogle(
    @Res() reply: FastifyReply,
    @Body() body: { sitemapUrl: string },
  ) {
    const config = await this.systemConfigRepo.findOne({
      where: { name: 'seo_google_api_key' },
    });

    if (!config?.value) {
      return reply
        .status(400)
        .send({ ok: false, message: '请先配置Google API密钥' });
    }

    const siteUrl = process.env.SITE_URL || 'https://example.com';
    const apiUrl = `https://www.google.com/ping?sitemap=${encodeURIComponent(body.sitemapUrl)}`;

    try {
      const response = await fetch(apiUrl, {
        method: 'GET',
      });

      if (response.ok || response.status === 200) {
        await this.updateLastPushTime();
        return reply.send({ ok: true, message: 'Google站点地图提交成功！' });
      } else {
        return reply.status(400).send({
          ok: false,
          message: `Google提交失败，状态码：${response.status}`,
        });
      }
    } catch (error) {
      return reply
        .status(500)
        .send({ ok: false, message: `Google提交失败：${error.message}` });
    }
  }

  @Post('seo-push/all')
  @UseGuards(AdminAuthGuard, CsrfGuard)
  async pushToAll(
    @Res() reply: FastifyReply,
    @Body() body: { sitemapUrl: string },
  ) {
    const results: { engine: string; success: boolean; message: string }[] = [];
    const siteUrl = process.env.SITE_URL || 'https://example.com';

    const baiduConfig = await this.systemConfigRepo.findOne({
      where: { name: 'seo_baidu_token' },
    });
    if (baiduConfig?.value) {
      try {
        const apiUrl = `http://data.zz.baidu.com/urls?site=${siteUrl}&token=${baiduConfig.value}`;
        const response = await fetch(apiUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain' },
          body: body.sitemapUrl,
        });
        const result = await response.json();
        results.push({
          engine: '百度',
          success: response.ok,
          message: response.ok
            ? `成功推送 ${result.success} 条`
            : result.message,
        });
      } catch (error) {
        results.push({
          engine: '百度',
          success: false,
          message: error.message,
        });
      }
    }

    const bingConfig = await this.systemConfigRepo.findOne({
      where: { name: 'seo_bing_api_key' },
    });
    if (bingConfig?.value) {
      try {
        const apiUrl = `https://www.bing.com/webmaster/ping.aspx?siteMap=${encodeURIComponent(body.sitemapUrl)}`;
        const response = await fetch(apiUrl, { method: 'GET' });
        results.push({
          engine: 'Bing',
          success: response.ok || response.status === 200,
          message:
            response.ok || response.status === 200
              ? '提交成功'
              : `状态码: ${response.status}`,
        });
      } catch (error) {
        results.push({
          engine: 'Bing',
          success: false,
          message: error.message,
        });
      }
    }

    const googleConfig = await this.systemConfigRepo.findOne({
      name: 'seo_google_api_key',
    } as any);
    if (googleConfig?.value) {
      try {
        const apiUrl = `https://www.google.com/ping?sitemap=${encodeURIComponent(body.sitemapUrl)}`;
        const response = await fetch(apiUrl, { method: 'GET' });
        results.push({
          engine: 'Google',
          success: response.ok || response.status === 200,
          message:
            response.ok || response.status === 200
              ? '提交成功'
              : `状态码: ${response.status}`,
        });
      } catch (error) {
        results.push({
          engine: 'Google',
          success: false,
          message: error.message,
        });
      }
    }

    if (results.length > 0) {
      await this.updateLastPushTime();
    }

    const successCount = results.filter((r) => r.success).length;

    return reply.send({
      ok: successCount > 0,
      message: `完成！成功 ${successCount}/${results.length} 个搜索引擎`,
      data: results,
    });
  }

  private async updateLastPushTime() {
    const existing = await this.systemConfigRepo.findOne({
      where: { name: 'seo_last_push_time' },
    });
    const now = new Date().toISOString();

    if (existing) {
      existing.value = now;
      await this.systemConfigRepo.save(existing);
    } else {
      const newConfig = this.systemConfigRepo.create({
        name: 'seo_last_push_time',
        value: now,
        type: 2,
        deletable: 0,
      });
      await this.systemConfigRepo.save(newConfig);
    }
  }
}
