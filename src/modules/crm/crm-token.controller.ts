import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  Res,
  Req,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CrmApiToken } from '../../entities/crm-api-token.entity';
import { AdminAuthGuard } from '../../common/guards/admin-auth.guard';
import { CsrfGuard } from '../../common/guards/csrf.guard';
import { randomBytes } from 'crypto';
import type { FastifyReply, FastifyRequest } from 'fastify';

@Controller('admin/crm-tokens')
@UseGuards(AdminAuthGuard)
export class CrmTokenController {
  constructor(
    @InjectRepository(CrmApiToken)
    private readonly tokenRepo: Repository<CrmApiToken>,
  ) {}

  @Get()
  async list(
    @Res() reply: FastifyReply,
    @Req() req: FastifyRequest,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    const session = (req as any).session;
    const csrfToken = await (reply as any).generateCsrf?.();
    const pageSizeNum = Math.min(
      50,
      Math.max(5, parseInt(pageSize || '15', 10) || 15),
    );
    const currentPage = Math.max(1, parseInt(page || '1', 10) || 1);

    const [list, total] = await this.tokenRepo.findAndCount({
      order: { id: 'DESC' },
      skip: (currentPage - 1) * pageSizeNum,
      take: pageSizeNum,
    });

    const totalPages = Math.max(1, Math.ceil(total / pageSizeNum));
    const qs = new URLSearchParams();
    qs.set('pageSize', String(pageSizeNum));
    const baseUrl = '/admin/crm-tokens?' + qs.toString();

    return (reply as any).view('admin/crm-token-list', {
      title: 'CRM接口Token管理',
      activeMenu: 'crm-tokens',
      username: session?.adminUsername || 'admin',
      csrfToken: csrfToken ?? '',
      list: list.map((t) => ({
        ...t,
        createdAtFormatted: this.formatDateTime(t.createdAt),
        lastUsedAtFormatted: t.lastUsedAt
          ? this.formatDateTime(t.lastUsedAt)
          : '-',
        expiresAtFormatted: t.expiresAt
          ? this.formatDateTime(t.expiresAt)
          : '永不过期',
      })),
      pagination: {
        currentPage,
        totalPages,
        total,
        pageSize: pageSizeNum,
        baseUrl,
      },
    });
  }

  @Post('create')
  @UseGuards(AdminAuthGuard, CsrfGuard)
  async create(
    @Body('name') name: string,
    @Body('description') description: string,
    @Res() reply: FastifyReply,
  ) {
    const token = 'crm_' + randomBytes(32).toString('hex');

    await this.tokenRepo.save({
      name: name?.trim() || null,
      token,
      description: description?.trim() || null,
      expiresAt: null,
    });

    return reply.redirect('/admin/crm-tokens', 302);
  }

  @Post('delete/:id')
  @UseGuards(AdminAuthGuard, CsrfGuard)
  async delete(@Param('id') id: string, @Res() reply: FastifyReply) {
    await this.tokenRepo.delete(parseInt(id, 10));
    return reply.redirect('/admin/crm-tokens', 302);
  }

  private formatDateTime(d: Date | string | null | undefined): string {
    if (d == null) return '-';
    const dt = d instanceof Date ? d : new Date(d);
    if (Number.isNaN(dt.getTime())) return '-';
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())} ${pad(dt.getHours())}:${pad(dt.getMinutes())}:${pad(dt.getSeconds())}`;
  }
}
