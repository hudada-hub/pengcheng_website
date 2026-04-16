import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { In, Repository } from 'typeorm';
import { Status } from '../../common/entities/base.entity';
import { AdminAuthGuard } from '../../common/guards/admin-auth.guard';
import { CsrfGuard } from '../../common/guards/csrf.guard';
import { ActivityCalendar } from '../../entities/activity-calendar.entity';
import { Lang } from '../../entities/lang.entity';
import { RedisService } from '../redis/redis.service';
import { AdminLangService } from './admin-lang.service';
import { getReturnPath } from '../../common/utils/admin-redirect';

@Controller('admin')
export class AdminActivityCalendarController {
  constructor(
    @InjectRepository(ActivityCalendar)
    private readonly activityCalendarRepo: Repository<ActivityCalendar>,
    @InjectRepository(Lang) private readonly langRepo: Repository<Lang>,
    private readonly redis: RedisService,
    private readonly adminLangService: AdminLangService,
  ) {}

  @Get('activity-calendar')
  @UseGuards(AdminAuthGuard)
  async activityCalendarPage(
    @Res() reply: FastifyReply,
    @Req() req: FastifyRequest,
    @Query('langId') langId?: string,
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
    const [allList, langs, defaultLangId] = await Promise.all([
      this.activityCalendarRepo.find({
        where: { status: In([Status.Normal, Status.Hidden]) },
        relations: ['lang'],
        order: { sort: 'DESC', eventDateStart: 'DESC', id: 'DESC' },
      }),
      this.langRepo.find({
        where: { status: Status.Normal },
        order: { id: 'ASC' },
      }),
      this.adminLangService.getDefaultLangId(),
    ]);
    const raw = (langId ?? '').toString().trim();
    const showAll = raw === 'all' || raw === '0' || raw.toLowerCase() === 'all';
    const filterByLang = raw !== '' && !showAll;
    const selectedLangId = filterByLang
      ? parseInt(raw, 10)
      : showAll
        ? ''
        : defaultLangId || '';
    const list = filterByLang
      ? allList.filter((a) => a.langId === selectedLangId)
      : showAll
        ? allList
        : allList.filter((a) => a.langId === defaultLangId);
    const total = list.length;
    const totalPages = Math.max(1, Math.ceil(total / pageSizeNum));
    const from = (currentPage - 1) * pageSizeNum;
    const activityList = list.slice(from, from + pageSizeNum).map((a) => ({
      ...a,
      eventDateStartFormatted:
        a.eventDateStart != null
          ? new Date(a.eventDateStart).toISOString().slice(0, 10)
          : '-',
      eventDateEndFormatted:
        a.eventDateEnd != null
          ? new Date(a.eventDateEnd).toISOString().slice(0, 10)
          : '-',
    }));
    const baseUrl =
      '/admin/activity-calendar' +
      (selectedLangId !== ''
        ? '?langId=' + encodeURIComponent(selectedLangId)
        : '?langId=all') +
      '&pageSize=' +
      encodeURIComponent(String(pageSizeNum));
    return (reply as any).view('admin/activity-calendar-list', {
      title: '活动日历管理',
      activeMenu: 'activity-calendar',
      username: session?.adminUsername || 'admin',
      csrfToken: csrfToken ?? '',
      activityList,
      langs,
      defaultLangId,
      selectedLangId: selectedLangId === '' ? '' : selectedLangId,
      pagination: {
        currentPage: currentPage,
        totalPages,
        total,
        pageSize: pageSizeNum,
        baseUrl,
      },
    });
  }

  @Get('activity-calendar/edit')
  @UseGuards(AdminAuthGuard)
  async activityCalendarCreatePage(
    @Res() reply: FastifyReply,
    @Req() req: FastifyRequest,
    @Query('modal') modal?: string,
  ) {
    const session = (req as any).session;
    const csrfToken = await (reply as any).generateCsrf?.();
    const langs = await this.langRepo.find({
      where: { status: Status.Normal },
      order: { id: 'ASC' },
    });
    const defaultLang =
      langs.find((l) => l.code === 'zh') ??
      langs.find((l) => l.isDefault === 1) ??
      langs[0];
    const data = {
      title: '新增活动',
      activeMenu: 'activity-calendar',
      username: session?.adminUsername || 'admin',
      csrfToken: csrfToken ?? '',
      activity: null,
      langs,
      defaultLangId: defaultLang?.id ?? 0,
    };
    if (modal === '1')
      return (reply as any).view('admin/activity-calendar-edit-form', data);
    return reply.redirect('/admin/activity-calendar', 302);
  }

  @Get('activity-calendar/edit/:id')
  @UseGuards(AdminAuthGuard)
  async activityCalendarEditPage(
    @Param('id') id: string,
    @Res() reply: FastifyReply,
    @Req() req: FastifyRequest,
    @Query('modal') modal?: string,
  ) {
    const activity = await this.activityCalendarRepo.findOne({
      where: {
        id: parseInt(id, 10),
        status: In([Status.Normal, Status.Hidden]),
      },
      relations: ['lang'],
    });
    if (!activity) return reply.redirect('/admin/activity-calendar', 302);
    const session = (req as any).session;
    const csrfToken = await (reply as any).generateCsrf?.();
    const langs = await this.langRepo.find({
      where: { status: Status.Normal },
      order: { id: 'ASC' },
    });
    const data = {
      title: '编辑活动',
      activeMenu: 'activity-calendar',
      username: session?.adminUsername || 'admin',
      csrfToken: csrfToken ?? '',
      activity,
      langs,
      defaultLangId: activity.langId,
      eventDateStartStr: activity.eventDateStart
        ? new Date(activity.eventDateStart).toISOString().slice(0, 10)
        : '',
      eventDateEndStr: activity.eventDateEnd
        ? new Date(activity.eventDateEnd).toISOString().slice(0, 10)
        : '',
    };
    if (modal === '1')
      return (reply as any).view('admin/activity-calendar-edit-form', data);
    return reply.redirect('/admin/activity-calendar', 302);
  }

  @Post('activity-calendar/save')
  @UseGuards(AdminAuthGuard, CsrfGuard)
  async activityCalendarSave(
    @Body() body: Record<string, string>,
    @Res() reply: FastifyReply,
  ) {
    const id = body.id ? parseInt(body.id, 10) : 0;
    const title = (body.title ?? '').trim() || null;
    const langId = parseInt(body.langId, 10) || 0;
    const eventDateStartStr = (body.eventDateStart ?? '').trim();
    const eventDateEndStr = (body.eventDateEnd ?? '').trim();
    const location = (body.location ?? '').trim() || null;
    const url = (body.url ?? '').trim() || null;
    const thumbUrl = (body.thumbUrl ?? '').trim() || null;
    const content = (body.content ?? '').trim()
      ? (body.content ?? '').trim()
      : null;
    const status = body.status === '0' ? Status.Hidden : Status.Normal;
    const isTop = body.isTop === '1' ? 1 : 0;
    const sort = parseInt(body.sort, 10) || 0;
    if (!langId)
      return reply.redirect(
        id
          ? `/admin/activity-calendar/edit/${id}`
          : '/admin/activity-calendar/edit',
        302,
      );
    const eventDateStart = eventDateStartStr
      ? new Date(eventDateStartStr)
      : null;
    const eventDateEnd = eventDateEndStr ? new Date(eventDateEndStr) : null;
    if (!eventDateStart || !eventDateEnd || eventDateStart > eventDateEnd) {
      return reply.redirect(
        id
          ? `/admin/activity-calendar/edit/${id}`
          : '/admin/activity-calendar/edit',
        302,
      );
    }
    if (id) {
      await this.activityCalendarRepo.update(id, {
        title,
        langId,
        eventDateStart,
        eventDateEnd,
        location,
        url,
        thumbUrl,
        content,
        status,
        isTop,
        sort,
      } as any);
    } else {
      const created = await this.activityCalendarRepo.save(
        this.activityCalendarRepo.create({
          activityCalendarId: null,
          langId,
          thumbUrl,
          eventDateStart,
          eventDateEnd,
          title,
          location,
          url,
          content,
          viewCount: 0,
          status,
          isTop,
          sort,
        } as any),
      );
      const createdId = Array.isArray(created)
        ? created[0]?.id
        : (created as ActivityCalendar)?.id;
      if (createdId)
        await this.activityCalendarRepo.update(createdId, {
          activityCalendarId: createdId,
        });
    }
    await this.redis.delPattern?.('pengcheng:*');
    return reply.redirect(
      getReturnPath(body.returnUrl, '/admin/activity-calendar'),
      302,
    );
  }

  @Post('activity-calendar/toggle-top/:id')
  @UseGuards(AdminAuthGuard, CsrfGuard)
  async activityCalendarToggleTop(
    @Param('id') id: string,
    @Req() req: FastifyRequest,
    @Res() reply: FastifyReply,
  ) {
    const activityId = parseInt(id, 10);
    const activity = await this.activityCalendarRepo.findOne({
      where: { id: activityId },
    });
    if (!activity) return reply.redirect('/admin/activity-calendar', 302);
    const newIsTop = activity.isTop === 1 ? 0 : 1;
    await this.activityCalendarRepo.update(activityId, {
      isTop: newIsTop,
    } as any);
    await this.redis.delPattern?.('pengcheng:*');
    const referer = (req as any).headers?.referer || '/admin/activity-calendar';
    return reply.redirect(referer, 302);
  }

  @Post('activity-calendar/delete/:id')
  @UseGuards(AdminAuthGuard, CsrfGuard)
  async activityCalendarDelete(
    @Param('id') id: string,
    @Res() reply: FastifyReply,
  ) {
    await this.activityCalendarRepo.delete(parseInt(id, 10));
    await this.redis.delPattern?.('pengcheng:*');
    return reply.redirect('/admin/activity-calendar', 302);
  }

  @Post('activity-calendar/batch-delete')
  @UseGuards(AdminAuthGuard, CsrfGuard)
  async activityCalendarBatchDelete(
    @Body() body: { ids?: number[] },
    @Res() reply: FastifyReply,
    @Req() req: FastifyRequest,
  ) {
    const ids = Array.isArray(body?.ids)
      ? body.ids
          .map((id) => parseInt(String(id), 10))
          .filter((id) => Number.isFinite(id))
      : [];
    if (ids.length) {
      await this.activityCalendarRepo.delete({ id: In(ids) });
      await this.redis.delPattern?.('pengcheng:*');
    }
    const referer = (req as any).headers?.referer || '/admin/activity-calendar';
    return reply.redirect(referer, 302);
  }

  @Post('activity-calendar/update-sort')
  @UseGuards(AdminAuthGuard, CsrfGuard)
  async activityCalendarUpdateSort(
    @Body() body: { id: number; sort: number },
    @Res() reply: FastifyReply,
  ) {
    const { id, sort } = body;
    if (!id || !Number.isFinite(sort)) {
      return reply.send({ success: false, message: 'Invalid parameters' });
    }
    try {
      await this.activityCalendarRepo.update(id, { sort } as any);
      await this.redis.delPattern?.('pengcheng:*');
      return reply.send({ success: true });
    } catch (error) {
      console.error('Error updating activity sort:', error);
      return reply.send({ success: false, message: 'Failed to update sort' });
    }
  }
}
