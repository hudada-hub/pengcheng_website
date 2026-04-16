import {
  Controller,
  Get,
  Post,
  Body,
  Res,
  Req,
  UseGuards,
  Param,
} from '@nestjs/common';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { DbBackupService } from './db-backup.service.js';
import { AdminAuthGuard } from '../../common/guards/admin-auth.guard';
import { CsrfGuard } from '../../common/guards/csrf.guard';

/** 本地时间：YYYY-MM-DD HH:mm:ss（与备份文件 mtime 所在时区一致） */
function formatLocalDateTime(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ` +
    `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
  );
}

@Controller('admin/db-backup')
@UseGuards(AdminAuthGuard)
export class DbBackupAdminController {
  constructor(private readonly backups: DbBackupService) {}

  @Get()
  async page(@Res() reply: FastifyReply, @Req() req: FastifyRequest) {
    const session = (req as any).session;
    const csrfToken = await (reply as any).generateCsrf?.();
    const items = await this.backups.listBackups();
    const q = (req as any).query as Record<string, string | undefined>;
    const message = q?.msg ? String(q.msg) : undefined;
    const error = q?.err ? String(q.err) : undefined;
    return (reply as any).view('admin/db-backup', {
      title: '数据库备份与恢复',
      activeMenu: 'db-backup',
      username: session?.adminUsername || 'admin',
      csrfToken: csrfToken ?? '',
      backups: items.map((x) => ({
        fileName: x.fileName,
        size: x.size,
        createdAt: formatLocalDateTime(x.createdAt),
      })),
      message,
      error,
    });
  }

  @Post('run')
  @UseGuards(AdminAuthGuard, CsrfGuard)
  async run(@Res() reply: FastifyReply) {
    try {
      await this.backups.createBackup('manual');
      return reply.redirect(
        `/admin/db-backup?msg=${encodeURIComponent('备份成功')}`,
        302,
      );
    } catch (e) {
      const err = e instanceof Error ? e.message : '备份失败';
      return reply.redirect(
        `/admin/db-backup?err=${encodeURIComponent(err)}`,
        302,
      );
    }
  }

  @Post('restore')
  @UseGuards(AdminAuthGuard, CsrfGuard)
  async restore(
    @Body('fileName') fileName: string,
    @Res() reply: FastifyReply,
  ) {
    try {
      await this.backups.restoreBackup(fileName);
      return reply.redirect(
        `/admin/db-backup?msg=${encodeURIComponent('恢复成功')}`,
        302,
      );
    } catch (e) {
      const err = e instanceof Error ? e.message : '恢复失败';
      return reply.redirect(
        `/admin/db-backup?err=${encodeURIComponent(err)}`,
        302,
      );
    }
  }

  @Post('delete')
  @UseGuards(AdminAuthGuard, CsrfGuard)
  async remove(@Body('fileName') fileName: string, @Res() reply: FastifyReply) {
    try {
      await this.backups.deleteBackup(fileName);
      return reply.redirect(
        `/admin/db-backup?msg=${encodeURIComponent('已删除备份文件')}`,
        302,
      );
    } catch (e) {
      const err = e instanceof Error ? e.message : '删除失败';
      return reply.redirect(
        `/admin/db-backup?err=${encodeURIComponent(err)}`,
        302,
      );
    }
  }

  @Get('download/:fileName')
  async download(
    @Param('fileName') fileName: string,
    @Res() reply: FastifyReply,
  ) {
    try {
      const stream = await this.backups.getBackupStream(fileName);
      reply.header('Content-Type', 'application/sql; charset=utf-8');
      reply.header(
        'Content-Disposition',
        `attachment; filename="${encodeURIComponent(fileName)}"`,
      );
      return reply.send(stream);
    } catch (e) {
      return reply.code(404).send('文件不存在');
    }
  }
}
