import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Query,
  Body,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { AdminAuthGuard } from '../../common/guards/admin-auth.guard';
import { CsrfGuard } from '../../common/guards/csrf.guard';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { In } from 'typeorm';
import { Menu } from '../../entities/menu.entity';
import { Config } from '../../entities/config.entity';
import { ConfigCategory } from '../../entities/config-category.entity';
import { SystemConfig } from '../../entities/system-config.entity';
import { Lang } from '../../entities/lang.entity';
import { FileMaterial } from '../../entities/file-material.entity';
import { FileMaterialCategory } from '../../entities/file-material-category.entity';
import { NewsCategory } from '../../entities/news-category.entity';
import { News } from '../../entities/news.entity';
import { SolutionCategory } from '../../entities/solution-category.entity';
import { Solution } from '../../entities/solution.entity';
import { ActivityCalendar } from '../../entities/activity-calendar.entity';
import { Admin } from '../../entities/admin.entity';
import { IndustryCase } from '../../entities/industry-case.entity';
import { ProductCategory } from '../../entities/product-category.entity';
import { Product } from '../../entities/product.entity';
import { DownloadCategory } from '../../entities/download-category.entity';
import { DownloadSeries } from '../../entities/download-series.entity';
import { Download } from '../../entities/download.entity';
import { ContactMessage } from '../../entities/contact-message.entity';
import { OverseasRecruit } from '../../entities/overseas-recruit.entity';
import { WebsiteUser } from '../../entities/website-user.entity';
import { RedisService } from '../redis/redis.service';
import { AdminLangService } from './admin-lang.service';
import { AuthService } from '../auth/auth.service';
import { Status } from '../../common/entities/base.entity';
import { buildAdminFlatTree } from '../../common/utils/admin-tree';
import { getReturnPath } from '../../common/utils/admin-redirect';
import { PageStatsService } from '../page-stats/page-stats.service';
import { AdminDownloadFileRecordService } from './admin-download-file-record.service';
import { pageTypeLabelZh } from '../../common/utils/page-type-labels';

/** 后台列表：YYYY-MM-DD HH:mm:ss（服务器本地时区） */
function formatYmdHms(d: Date | string | null | undefined): string {
  if (d == null) return '-';
  const dt = d instanceof Date ? d : new Date(d);
  if (Number.isNaN(dt.getTime())) return '-';
  const p = (n: number) => String(n).padStart(2, '0');
  return `${dt.getFullYear()}-${p(dt.getMonth() + 1)}-${p(dt.getDate())} ${p(dt.getHours())}:${p(dt.getMinutes())}:${p(dt.getSeconds())}`;
}

@Controller('admin')
export class AdminController {
  constructor(
    @InjectRepository(Menu) private readonly menuRepo: Repository<Menu>,
    @InjectRepository(Config) private readonly configRepo: Repository<Config>,
    @InjectRepository(ConfigCategory)
    private readonly configCategoryRepo: Repository<ConfigCategory>,
    @InjectRepository(SystemConfig)
    private readonly systemConfigRepo: Repository<SystemConfig>,
    @InjectRepository(Lang) private readonly langRepo: Repository<Lang>,
    @InjectRepository(FileMaterial)
    private readonly fileRepo: Repository<FileMaterial>,
    @InjectRepository(FileMaterialCategory)
    private readonly fileCategoryRepo: Repository<FileMaterialCategory>,
    @InjectRepository(NewsCategory)
    private readonly newsCategoryRepo: Repository<NewsCategory>,
    @InjectRepository(News) private readonly newsRepo: Repository<News>,
    @InjectRepository(ActivityCalendar)
    private readonly activityCalendarRepo: Repository<ActivityCalendar>,
    @InjectRepository(SolutionCategory)
    private readonly solutionCategoryRepo: Repository<SolutionCategory>,
    @InjectRepository(Solution)
    private readonly solutionRepo: Repository<Solution>,
    @InjectRepository(Admin) private readonly adminRepo: Repository<Admin>,
    @InjectRepository(IndustryCase)
    private readonly industryCaseRepo: Repository<IndustryCase>,
    @InjectRepository(ProductCategory)
    private readonly productCategoryRepo: Repository<ProductCategory>,
    @InjectRepository(Product)
    private readonly productRepo: Repository<Product>,
    @InjectRepository(DownloadCategory)
    private readonly downloadCategoryRepo: Repository<DownloadCategory>,
    @InjectRepository(DownloadSeries)
    private readonly downloadSeriesRepo: Repository<DownloadSeries>,
    @InjectRepository(Download)
    private readonly downloadRepo: Repository<Download>,
    @InjectRepository(ContactMessage)
    private readonly contactMessageRepo: Repository<ContactMessage>,
    @InjectRepository(OverseasRecruit)
    private readonly overseasRecruitRepo: Repository<OverseasRecruit>,
    @InjectRepository(WebsiteUser)
    private readonly websiteUserRepo: Repository<WebsiteUser>,
    private readonly redis: RedisService,
    private readonly adminLangService: AdminLangService,
    private readonly authService: AuthService,
    private readonly pageStatsService: PageStatsService,
    private readonly adminDownloadFileRecordService: AdminDownloadFileRecordService,
  ) {}

  // menu / product-category / dashboard / clear-cache / not-found 已拆分到独立 controller

  // downloads / download-category / download-series 已拆分到 AdminDownloadController

  // products / product-params 已拆分到 AdminProductController

  // solutions / solution-category 已拆分到 AdminSolutionController

  // industry-cases 已拆分到 AdminIndustryCaseController

  @Get('file-category')
  @UseGuards(AdminAuthGuard)
  async fileCategoryPage(
    @Res() reply: FastifyReply,
    @Req() req: FastifyRequest,
  ) {
    return this.renderPlaceholder(reply, req, '文件素材分类', 'file-category');
  }
  @Get('files')
  @UseGuards(AdminAuthGuard)
  async filesPage(@Res() reply: FastifyReply, @Req() req: FastifyRequest) {
    const session = (req as any).session;
    const csrfToken = await (reply as any).generateCsrf?.();
    const [categories, files] = await Promise.all([
      this.fileCategoryRepo.find({
        where: { status: Status.Normal },
        order: { id: 'ASC' },
      }),
      this.fileRepo.find({
        where: { status: Status.Normal },
        order: { id: 'DESC' },
        relations: ['category'],
        take: 50,
      }),
    ]);
    return (reply as any).view('admin/file-material', {
      title: '文件素材',
      activeMenu: 'files',
      username: session?.adminUsername || 'admin',
      csrfToken: csrfToken ?? '',
      categories,
      files,
    });
  }
  @Get('config-category')
  @UseGuards(AdminAuthGuard)
  async configCategoryPage(
    @Res() reply: FastifyReply,
    @Req() req: FastifyRequest,
  ) {
    const session = (req as any).session;
    const csrfToken = await (reply as any).generateCsrf?.();
    const categories = await this.configCategoryRepo.find({
      where: { status: Status.Normal },
      order: { id: 'ASC' },
    });
    return (reply as any).view('admin/config-category-list', {
      title: '区块分类',
      activeMenu: 'config-category',
      username: session?.adminUsername || 'admin',
      csrfToken: csrfToken ?? '',
      categories,
    });
  }

  @Get('config-category/edit')
  @UseGuards(AdminAuthGuard)
  async configCategoryCreatePage(
    @Res() reply: FastifyReply,
    @Req() req: FastifyRequest,
  ) {
    const session = (req as any).session;
    const csrfToken = await (reply as any).generateCsrf?.();
    return (reply as any).view('admin/config-category-edit', {
      title: '新增区块分类',
      activeMenu: 'config-category',
      username: session?.adminUsername || 'admin',
      csrfToken: csrfToken ?? '',
      category: null,
    });
  }

  @Get('config-category/edit/:id')
  @UseGuards(AdminAuthGuard)
  async configCategoryEditPage(
    @Param('id') id: string,
    @Res() reply: FastifyReply,
    @Req() req: FastifyRequest,
  ) {
    const category = await this.configCategoryRepo.findOne({
      where: { id: parseInt(id, 10), status: Status.Normal },
    });
    if (!category) return reply.redirect('/admin/config-category', 302);
    const session = (req as any).session;
    const csrfToken = await (reply as any).generateCsrf?.();
    return (reply as any).view('admin/config-category-edit', {
      title: '编辑区块分类',
      activeMenu: 'config-category',
      username: session?.adminUsername || 'admin',
      csrfToken: csrfToken ?? '',
      category,
    });
  }

  @Post('config-category/save')
  @UseGuards(AdminAuthGuard, CsrfGuard)
  async configCategorySave(
    @Body() body: Record<string, string>,
    @Res() reply: FastifyReply,
  ) {
    const id = body.id ? parseInt(body.id, 10) : 0;
    const name = (body.name ?? '').trim();
    const status = body.status ? parseInt(body.status, 10) : Status.Normal;
    if (id) {
      await this.configCategoryRepo.update(id, { name, status } as any);
    } else {
      if (!name) return reply.redirect('/admin/config-category/edit', 302);
      await this.configCategoryRepo.save(
        this.configCategoryRepo.create({
          name,
          status: status === Status.Hidden ? Status.Hidden : Status.Normal,
        } as any),
      );
    }
    return reply.redirect(
      getReturnPath(body.returnUrl, '/admin/config-category'),
      302,
    );
  }

  @Get('config')
  @UseGuards(AdminAuthGuard)
  async configPage(@Res() reply: FastifyReply, @Req() req: FastifyRequest) {
    const session = (req as any).session;
    const csrfToken = await (reply as any).generateCsrf?.();
    const [langs, defaultLangId] = await Promise.all([
      this.langRepo.find({
        where: { status: Status.Normal },
        order: { id: 'ASC' },
      }),
      this.adminLangService.getDefaultLangId(),
    ]);
    return (reply as any).view('admin/config-list', {
      title: '区块管理',
      activeMenu: 'config',
      username: session?.adminUsername || 'admin',
      csrfToken: csrfToken ?? '',
      langs,
      defaultLangId,
    });
  }

  /** 跳转编辑保修说明配置（key_name=warranty，优先默认语言 + config_id=73） */
  @Get('warranty-page')
  @UseGuards(AdminAuthGuard)
  async warrantyPageShortcut(@Res() reply: FastifyReply) {
    const defaultLangId = await this.adminLangService.getDefaultLangId();
    const row =
      (await this.configRepo.findOne({
        where: { configId: 73, langId: defaultLangId, status: Status.Normal },
      })) ??
      (await this.configRepo.findOne({
        where: {
          keyName: 'warranty',
          langId: defaultLangId,
          status: Status.Normal,
        },
      })) ??
      (await this.configRepo.findOne({
        where: { configId: 73, status: Status.Normal },
        order: { id: 'ASC' },
      })) ??
      (await this.configRepo.findOne({
        where: { keyName: 'warranty', status: Status.Normal },
        order: { id: 'ASC' },
      }));
    if (!row) return reply.redirect('/admin/config', 302);
    return reply.redirect(`/admin/config/edit/${row.id}`, 302);
  }

  @Get('lang')
  @UseGuards(AdminAuthGuard)
  async langListPage(@Res() reply: FastifyReply, @Req() req: FastifyRequest) {
    const session = (req as any).session;
    const csrfToken = await (reply as any).generateCsrf?.();
    const langs = await this.langRepo.find({
      where: { status: In([Status.Normal, Status.Hidden]) },
      order: { id: 'ASC' },
    });
    return (reply as any).view('admin/lang-list', {
      title: '语言管理',
      activeMenu: 'lang',
      username: session?.adminUsername || 'admin',
      csrfToken: csrfToken ?? '',
      langs,
    });
  }

  @Get('lang/edit')
  @UseGuards(AdminAuthGuard)
  async langCreatePage(
    @Res() reply: FastifyReply,
    @Req() req: FastifyRequest,
    @Query('modal') modal?: string,
  ) {
    const session = (req as any).session;
    const csrfToken = await (reply as any).generateCsrf?.();
    const data = {
      title: '新增语言',
      activeMenu: 'lang',
      username: session?.adminUsername || 'admin',
      csrfToken: csrfToken ?? '',
      lang: null,
    };
    if (modal === '1') return (reply as any).view('admin/lang-edit-form', data);
    return reply.redirect('/admin/lang', 302);
  }

  @Get('lang/edit/:id')
  @UseGuards(AdminAuthGuard)
  async langEditPage(
    @Param('id') id: string,
    @Res() reply: FastifyReply,
    @Req() req: FastifyRequest,
    @Query('modal') modal?: string,
  ) {
    const lang = await this.langRepo.findOne({
      where: { id: parseInt(id, 10) },
    });
    if (!lang) return reply.redirect('/admin/lang', 302);
    const session = (req as any).session;
    const csrfToken = await (reply as any).generateCsrf?.();
    const data = {
      title: '编辑语言',
      activeMenu: 'lang',
      username: session?.adminUsername || 'admin',
      csrfToken: csrfToken ?? '',
      lang,
    };
    if (modal === '1') return (reply as any).view('admin/lang-edit-form', data);
    return reply.redirect('/admin/lang', 302);
  }

  @Post('lang/save')
  @UseGuards(AdminAuthGuard, CsrfGuard)
  async langSave(
    @Body() body: Record<string, string>,
    @Res() reply: FastifyReply,
  ) {
    const id = body.id ? parseInt(body.id, 10) : null;
    const name = (body.name ?? '').trim();
    const code = (body.code ?? '').trim();
    const langFullNameRaw = (body.langFullName ?? '').trim();
    const langFullName = langFullNameRaw || null;
    const langIconUrl = (body.langIconUrl ?? '').trim() || null;
    const status = body.status === '1' ? Status.Normal : Status.Hidden;
    const isDefault = body.isDefault === '1' ? 1 : 0;
    if (!name || !code) return reply.redirect('/admin/lang', 302);

    if (isDefault === 1) {
      await this.langRepo.update(
        { isDefault: 1 } as any,
        { isDefault: 0 } as any,
      );
    }

    if (id) {
      await this.langRepo.update(id, {
        name,
        code,
        langFullName,
        langIconUrl,
        status,
        isDefault,
      } as any);
    } else {
      await this.langRepo.save(
        this.langRepo.create({
          name,
          code,
          langFullName,
          langIconUrl,
          status,
          isDefault,
        } as any),
      );
    }
    await this.adminLangService.refreshDefaultLangId();
    return reply.redirect(getReturnPath(body.returnUrl, '/admin/lang'), 302);
  }

  @Post('lang/delete/:id')
  @UseGuards(AdminAuthGuard, CsrfGuard)
  async langDelete(@Param('id') id: string, @Res() reply: FastifyReply) {
    await this.langRepo.delete(parseInt(id, 10));
    await this.adminLangService.refreshDefaultLangId();
    return reply.redirect('/admin/lang', 302);
  }
  // news / news-category 已拆分到 AdminNewsController
  // activity-calendar 已拆分到 AdminActivityCalendarController

  @Get('contact-messages')
  @UseGuards(AdminAuthGuard)
  async contactMessagesPage(
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
    const [rows, total] = await this.contactMessageRepo.findAndCount({
      where: { status: In([Status.Normal, Status.Hidden]) },
      order: { id: 'DESC' },
      skip: (currentPage - 1) * pageSizeNum,
      take: pageSizeNum,
    });
    const list = rows.map((r) => ({
      id: r.id,
      fullName: r.fullName,
      email: r.email,
      nation: r.nation,
      locationCity: r.locationCity,
      phoneNumber: r.phoneNumber,
      message: r.message,
      sourceUrl: r.sourceUrl || '',
      adminReply: r.adminReply,
      createdAtFormatted: formatYmdHms(r.createdAt),
      repliedAtFormatted: r.repliedAt ? formatYmdHms(r.repliedAt) : '',
    }));
    const totalPages = Math.max(1, Math.ceil(total / pageSizeNum));
    const qs = new URLSearchParams();
    qs.set('pageSize', String(pageSizeNum));
    const baseUrl = '/admin/contact-messages?' + qs.toString();
    return (reply as any).view('admin/contact-messages-list', {
      title: '客户留言（联系我们）',
      activeMenu: 'contact-messages',
      username: session?.adminUsername || 'admin',
      csrfToken: csrfToken ?? '',
      list,
      pagination: {
        currentPage,
        totalPages,
        total,
        pageSize: pageSizeNum,
        baseUrl,
      },
    });
  }

  @Delete('contact-messages/:id')
  @UseGuards(AdminAuthGuard, CsrfGuard)
  async deleteContactMessage(
    @Param('id') id: string,
    @Res() reply: FastifyReply,
  ) {
    const msgId = parseInt(id, 10);
    if (!Number.isFinite(msgId) || msgId < 1) {
      return reply
        .code(400)
        .type('application/json')
        .send({ ok: false, message: '无效的ID' });
    }

    const result = await this.contactMessageRepo.delete(msgId);
    if (result.affected === 0) {
      return reply
        .code(404)
        .type('application/json')
        .send({ ok: false, message: '记录不存在' });
    }

    return reply
      .type('application/json')
      .send({ ok: true, message: '删除成功' });
  }

  @Get('website-users')
  @UseGuards(AdminAuthGuard)
  async websiteUsersPage(
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
    const [list, total] = await this.websiteUserRepo.findAndCount({
      where: { status: In([Status.Normal, Status.Hidden]) },
      order: { id: 'DESC' },
      skip: (currentPage - 1) * pageSizeNum,
      take: pageSizeNum,
    });
    const listDto = list.map((u) => ({
      id: u.id,
      email: u.email,
      status: u.status,
      createdAtFormatted: formatYmdHms(u.createdAt),
    }));
    const totalPages = Math.max(1, Math.ceil(total / pageSizeNum));
    const qs = new URLSearchParams();
    qs.set('pageSize', String(pageSizeNum));
    const baseUrl = '/admin/website-users?' + qs.toString();
    return (reply as any).view('admin/website-user-list', {
      title: '网站用户',
      activeMenu: 'website-users',
      username: session?.adminUsername || 'admin',
      csrfToken: csrfToken ?? '',
      list: listDto,
      pagination: {
        currentPage,
        totalPages,
        total,
        pageSize: pageSizeNum,
        baseUrl,
      },
    });
  }

  @Post('website-users/delete/:id')
  @UseGuards(AdminAuthGuard, CsrfGuard)
  async websiteUserDelete(
    @Param('id') id: string,
    @Res() reply: FastifyReply,
    @Req() req: FastifyRequest,
  ) {
    await this.websiteUserRepo.delete(parseInt(id, 10));
    const referer = (req as any).headers?.referer || '/admin/website-users';
    return reply.redirect(referer, 302);
  }

  @Get('overseas-recruit')
  @UseGuards(AdminAuthGuard)
  async overseasRecruitPage(
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
    const [records, total] = await this.overseasRecruitRepo.findAndCount({
      where: { status: In([Status.Normal, Status.Hidden]) },
      relations: ['lang'],
      order: { id: 'DESC' },
      skip: (currentPage - 1) * pageSizeNum,
      take: pageSizeNum,
    });
    const totalPages = Math.max(1, Math.ceil(total / pageSizeNum));
    const qs = new URLSearchParams();
    qs.set('pageSize', String(pageSizeNum));
    const baseUrl = '/admin/overseas-recruit?' + qs.toString();

    // Format list with date fields
    const list = records.map((r) => ({
      ...r,
      createdAtFormatted: formatYmdHms(r.createdAt),
      updatedAtFormatted: formatYmdHms(r.updatedAt),
    }));

    return (reply as any).view('admin/overseas-recruit-list', {
      title: '海外招募',
      activeMenu: 'overseas-recruit',
      username: session?.adminUsername || 'admin',
      csrfToken: csrfToken ?? '',
      list,
      pagination: {
        currentPage,
        totalPages,
        total,
        pageSize: pageSizeNum,
        baseUrl,
      },
    });
  }

  @Post('overseas-recruit/delete/:id')
  @UseGuards(AdminAuthGuard, CsrfGuard)
  async overseasRecruitDelete(
    @Param('id') id: string,
    @Res() reply: FastifyReply,
    @Req() req: FastifyRequest,
  ) {
    await this.overseasRecruitRepo.delete(parseInt(id, 10));
    const referer = (req as any).headers?.referer || '/admin/overseas-recruit';
    return reply.redirect(referer, 302);
  }

  @Get('page-stats')
  @UseGuards(AdminAuthGuard)
  async pageStatsPage(
    @Res() reply: FastifyReply,
    @Req() req: FastifyRequest,
    @Query('langId') langIdQuery?: string,
  ) {
    const session = (req as any).session;
    const csrfToken = await (reply as any).generateCsrf?.();
    let filterLangId: number | undefined;
    if (langIdQuery != null && String(langIdQuery).trim() !== '') {
      const n = parseInt(String(langIdQuery), 10);
      if (Number.isFinite(n) && n > 0) filterLangId = n;
    }
    const statsRows =
      await this.pageStatsService.findAllAggregatedStats(filterLangId);
    const langIds = [...new Set(statsRows.map((s) => s.langId))];
    const langs = langIds.length
      ? await this.langRepo.find({ where: { id: In(langIds) } })
      : [];
    const langMap = new Map(langs.map((l) => [l.id, l]));
    const tableLangOptions = await this.langRepo.find({
      where: { status: In([Status.Normal, Status.Hidden]) },
      order: { id: 'ASC' },
    });
    const tableLangOptionsDto = tableLangOptions.map((l) => ({
      id: l.id,
      label: l.name,
    }));
    const statUserIds = [
      ...new Set(
        statsRows
          .map((s) => s.userId)
          .filter((id): id is number => typeof id === 'number' && id > 0),
      ),
    ];
    const statUsers = statUserIds.length
      ? await this.websiteUserRepo.find({ where: { id: In(statUserIds) } })
      : [];
    const statUserEmailById = new Map(statUsers.map((u) => [u.id, u.email]));
    const summaryList = statsRows.map((s) => {
      const l = langMap.get(s.langId);
      const uid = s.userId;
      const memberUserDisplay =
        uid != null && uid > 0
          ? (statUserEmailById.get(uid) ?? `（已删 #${uid}）`)
          : '-';
      return {
        id: s.id,
        langId: s.langId,
        pageType: s.pageType,
        pageTypeLabel: pageTypeLabelZh(s.pageType),
        viewCount: s.viewCount,
        lastViewAtFormatted: s.lastViewAt ? formatYmdHms(s.lastViewAt) : '-',
        langLabel: l ? `${l.name} (${l.code})` : '-',
        memberUserDisplay,
      };
    });
    const chartRows = summaryList.map((s) => ({
      langId: s.langId,
      name: `${s.langLabel} · ${s.pageTypeLabel}`.slice(0, 56),
      value: s.viewCount,
    }));
    const chartLangs = [...langs]
      .sort((a, b) => a.id - b.id)
      .map((l) => ({
        id: l.id,
        label: `${l.name} (${l.code})`,
      }));
    const chartRowsJson = JSON.stringify(chartRows).replace(/</g, '\\u003c');
    const chartLangsJson = JSON.stringify(chartLangs).replace(/</g, '\\u003c');
    return (reply as any).view('admin/page-stats-list', {
      title: '页面访问量',
      activeMenu: 'page-stats',
      username: session?.adminUsername || 'admin',
      csrfToken: csrfToken ?? '',
      summaryList,
      chartRowsJson,
      chartLangsJson,
      tableLangOptions: tableLangOptionsDto,
      selectedTableLangId: filterLangId ?? null,
    });
  }

  @Get('download-file-records')
  @UseGuards(AdminAuthGuard)
  async downloadFileRecordsPage(
    @Res() reply: FastifyReply,
    @Req() req: FastifyRequest,
    @Query('langId') langIdQuery?: string,
    @Query('page') pageQuery?: string,
    @Query('pageSize') pageSizeStr?: string,
  ) {
    const session = (req as any).session;
    const csrfToken = await (reply as any).generateCsrf?.();

    let filterLangId: number | undefined;
    if (langIdQuery != null && String(langIdQuery).trim() !== '') {
      const n = parseInt(String(langIdQuery), 10);
      if (Number.isFinite(n) && n > 0) filterLangId = n;
    }
    const pageSizeNum = Math.min(
      100,
      Math.max(5, parseInt(pageSizeStr || '15', 10) || 15),
    );
    const currentPage = Math.max(1, parseInt(pageQuery || '1', 10) || 1);
    const { rows, total } = await this.adminDownloadFileRecordService.findPage({
      docLangId: filterLangId,
      page: currentPage,
      pageSize: pageSizeNum,
    });
    const totalPages = Math.max(1, Math.ceil(total / pageSizeNum));
    const tableLangOptions =
      await this.adminDownloadFileRecordService.listLangOptionsForFilter();

    const listBaseQs: Record<string, string> = {
      pageSize: String(pageSizeNum),
    };
    if (filterLangId != null) listBaseQs.langId = String(filterLangId);

    const paginationBase =
      '/admin/download-file-records?' +
      new URLSearchParams(listBaseQs).toString();

    const dlUserIds = [
      ...new Set(
        rows
          .map((r) => r.userId)
          .filter((id): id is number => typeof id === 'number' && id > 0),
      ),
    ];
    const dlUsers = dlUserIds.length
      ? await this.websiteUserRepo.find({ where: { id: In(dlUserIds) } })
      : [];
    const dlEmailById = new Map(dlUsers.map((u) => [u.id, u.email]));
    const list = rows.map((r) => {
      const from = r.fromPageUrl ?? '';
      const uid = r.userId;
      const userEmail =
        uid != null && uid > 0
          ? (dlEmailById.get(uid) ?? `（已删 #${uid}）`)
          : '-';
      return {
        id: r.id,
        createdAtFormatted: formatYmdHms(r.createdAt),
        langLabel: r.file?.lang
          ? `${r.file.lang.name} (${r.file.lang.code})`
          : '-',
        fileName: r.file?.fileName ?? '—',
        fromPageUrl: from || '-',
        fromPageShort: from.length > 72 ? from.slice(0, 72) + '…' : from || '-',
        userEmail,
        userAgent: r.userAgent ?? '-',
        userAgentShort:
          r.userAgent && r.userAgent.length > 96
            ? r.userAgent.slice(0, 96) + '…'
            : r.userAgent || '-',
      };
    });

    const chartRowData =
      await this.adminDownloadFileRecordService.getChartRowsByDocLang();
    const chartLangs = tableLangOptions.map((o) => ({
      id: o.id,
      label: o.label,
    }));
    const chartRows = chartRowData.map((r) => ({
      langId: r.langId,
      name: r.name.slice(0, 56),
      value: r.value,
    }));
    const chartRowsJson = JSON.stringify(chartRows).replace(/</g, '\\u003c');
    const chartLangsJson = JSON.stringify(chartLangs).replace(/</g, '\\u003c');

    return (reply as any).view('admin/download-file-records', {
      title: '资料下载记录 - 鹏成后台',
      activeMenu: 'download-file-records',
      username: session?.adminUsername || 'admin',
      csrfToken: csrfToken ?? '',
      list,
      tableLangOptions,
      selectedTableLangId: filterLangId ?? null,
      pagination: {
        currentPage,
        totalPages,
        total,
        pageSize: pageSizeNum,
        baseUrl: paginationBase,
      },
      chartRowsJson,
      chartLangsJson,
    });
  }

  /** 仅允许站内相对路径，避免 iframe 打开任意外链 */
  private sanitizeWebsitePreviewPath(raw: string | undefined): string {
    if (raw == null || typeof raw !== 'string') return '/';
    const p = raw.trim();
    if (!p.startsWith('/') || p.startsWith('//')) return '/';
    if (p.length > 512) return '/';
    if (/[\u0000-\u001f\u007f<>]/.test(p)) return '/';
    return p;
  }

  @Get('responsive-preview')
  @UseGuards(AdminAuthGuard)
  async responsivePreviewPage(
    @Res() reply: FastifyReply,
    @Req() req: FastifyRequest,
    @Query('path') pathQuery?: string,
  ) {
    const session = (req as any).session;
    const csrfToken = await (reply as any).generateCsrf?.();
    const previewPath = this.sanitizeWebsitePreviewPath(pathQuery);
    return (reply as any).view('admin/responsive-preview', {
      title: '多端适配预览',
      activeMenu: 'responsive-preview',
      username: session?.adminUsername || 'admin',
      csrfToken: csrfToken ?? '',
      previewPath,
    });
  }

  @Get('system-config')
  @UseGuards(AdminAuthGuard)
  async systemConfigPage(
    @Res() reply: FastifyReply,
    @Req() req: FastifyRequest,
  ) {
    const session = (req as any).session;
    const csrfToken = await (reply as any).generateCsrf?.();
    const configs = await this.systemConfigRepo.find({
      where: { status: Status.Normal },
      order: { id: 'ASC' },
    });
    return (reply as any).view('admin/system-config-list', {
      title: '系统配置',
      activeMenu: 'system-config',
      username: session?.adminUsername || 'admin',
      csrfToken: csrfToken ?? '',
      configs,
    });
  }

  // menu/edit 已拆分到 AdminMenuController

  @Get('config/edit')
  @UseGuards(AdminAuthGuard)
  async configCreatePage(
    @Res() reply: FastifyReply,
    @Req() req: FastifyRequest,
    @Query('modal') modal?: string,
  ) {
    const session = (req as any).session;
    const csrfToken = await (reply as any).generateCsrf?.();
    const [langs, categories] = await Promise.all([
      this.langRepo.find({
        where: { status: Status.Normal },
        order: { id: 'ASC' },
      }),
      this.configCategoryRepo.find({
        where: { status: Status.Normal },
        order: { id: 'ASC' },
      }),
    ]);
    const defaultLang = langs.find((l) => l.isDefault === 1) ?? langs[0];
    const data = {
      title: '新增配置',
      activeMenu: 'config',
      username: session?.adminUsername || 'admin',
      csrfToken: csrfToken ?? '',
      config: null,
      contentJson: '',
      contentItems: this.buildContentItems(null),
      defaultLangId: defaultLang?.id ?? 0,
      langs,
      categories,
    };
    if (modal === '1')
      return (reply as any).view('admin/config-edit-form', data);
    return reply.redirect('/admin/config', 302);
  }

  @Get('config/edit/:id')
  @UseGuards(AdminAuthGuard)
  async configEditPage(
    @Param('id') id: string,
    @Res() reply: FastifyReply,
    @Req() req: FastifyRequest,
    @Query('modal') modal?: string,
  ) {
    const config = await this.configRepo.findOne({
      where: { id: parseInt(id, 10), status: Status.Normal },
    });
    if (!config) return reply.redirect('/admin/config', 302);
    const session = (req as any).session;
    const csrfToken = await (reply as any).generateCsrf?.();
    const [langs, categories] = await Promise.all([
      this.langRepo.find({
        where: { status: Status.Normal },
        order: { id: 'ASC' },
      }),
      this.configCategoryRepo.find({
        where: { status: Status.Normal },
        order: { id: 'ASC' },
      }),
    ]);
    const contentJson =
      config.content != null ? JSON.stringify(config.content, null, 2) : '';
    const data = {
      title: '编辑配置',
      activeMenu: 'config',
      username: session?.adminUsername || 'admin',
      csrfToken: csrfToken ?? '',
      config,
      contentJson,
      contentItems: this.buildContentItems(config.content),
      langs,
      categories,
    };
    if (modal === '1')
      return (reply as any).view('admin/config-edit-form', data);
    return reply.redirect('/admin/config', 302);
  }

  @Post('config/save')
  @UseGuards(AdminAuthGuard, CsrfGuard)
  async configSave(
    @Body() body: Record<string, string>,
    @Req() req: FastifyRequest,
    @Res() reply: FastifyReply,
  ) {
    const isAjax =
      req.headers['x-requested-with'] === 'XMLHttpRequest' ||
      (req.headers['accept'] || '').includes('application/json');

    const id = body.id ? parseInt(body.id, 10) : 0;
    const name = (body.name ?? '').trim();
    const keyName = (body.keyName ?? '').trim();
    const title = (body.title ?? '').trim() || null;
    const description = (body.description ?? '').trim() || null;
    const bgPicUrl = (body.bgPicUrl ?? '').trim() || null;
    const isArray = body.isArray === '1' ? 1 : 0;
    const type = Math.max(1, parseInt(body.type, 10) || 1);
    const langId = parseInt(body.langId, 10) || 0;
    const categoryId = body.categoryId ? parseInt(body.categoryId, 10) : null;
    const linkUrl = (body.linkUrl ?? '').trim() || null;
    const videoUrl = (body.videoUrl ?? '').trim() || null;
    const deletable = body.deletable === '1' ? 1 : 0;
    const status = body.status === '0' ? Status.Hidden : Status.Normal;

    let content: Record<string, unknown> | unknown[] | null = null;
    const contentStr = (body.content ?? '').trim();
    if (contentStr) {
      try {
        const parsed = JSON.parse(contentStr);
        content = Array.isArray(parsed)
          ? parsed
          : typeof parsed === 'object' && parsed !== null
            ? parsed
            : null;
      } catch {
        content = null;
      }
    }

    if (!name || !keyName) {
      if (isAjax)
        return reply
          .status(400)
          .send({ ok: false, message: '请填写名称和 Key' });
      return reply.redirect(
        id ? `/admin/config/edit/${id}` : '/admin/config/edit',
        302,
      );
    }
    if (!langId) {
      if (isAjax)
        return reply.status(400).send({ ok: false, message: '请选择语言' });
      return reply.redirect(
        id ? `/admin/config/edit/${id}` : '/admin/config/edit',
        302,
      );
    }

    if (id) {
      await this.configRepo.update(id, {
        name,
        title,
        description,
        keyName,
        bgPicUrl,
        videoUrl,
        isArray,
        type,
        content,
        langId,
        categoryId,
        linkUrl,
        deletable,
        status,
      } as any);
    } else {
      const saved = await this.configRepo.save(
        this.configRepo.create({
          name,
          title,
          description,
          keyName,
          bgPicUrl,
          videoUrl,
          isArray,
          type,
          content,
          langId,
          categoryId,
          linkUrl,
          deletable,
          status: status === Status.Hidden ? Status.Hidden : Status.Normal,
        } as any),
      );
      const created = Array.isArray(saved) ? saved[0] : saved;
      if (created && typeof created.id === 'number') {
        await this.configRepo.update(created.id, {
          configId: created.id,
        });
      }
    }
    await this.redis.delPattern?.('pengcheng:config:*');
    if (isAjax)
      return reply.status(200).send({ ok: true, message: '保存成功' });
    const redirectPath = getReturnPath(body.returnUrl, '/admin/config');
    return reply.redirect(redirectPath, 302);
  }

  // menu/save/delete 已拆分到 AdminMenuController

  @Get('system-config/edit')
  @UseGuards(AdminAuthGuard)
  async systemConfigCreatePage(
    @Res() reply: FastifyReply,
    @Req() req: FastifyRequest,
    @Query('modal') modal?: string,
  ) {
    const session = (req as any).session;
    const csrfToken = await (reply as any).generateCsrf?.();
    const data = {
      title: '新增系统配置',
      activeMenu: 'system-config',
      username: session?.adminUsername || 'admin',
      csrfToken: csrfToken ?? '',
      config: null,
    };
    if (modal === '1')
      return (reply as any).view('admin/system-config-edit-form', data);
    return reply.redirect('/admin/system-config', 302);
  }

  @Get('system-config/edit/:id')
  @UseGuards(AdminAuthGuard)
  async systemConfigEditPage(
    @Param('id') id: string,
    @Res() reply: FastifyReply,
    @Req() req: FastifyRequest,
    @Query('modal') modal?: string,
  ) {
    const config = await this.systemConfigRepo.findOne({
      where: { id: parseInt(id, 10), status: Status.Normal },
    });
    if (!config) return reply.redirect('/admin/system-config', 302);
    const session = (req as any).session;
    const csrfToken = await (reply as any).generateCsrf?.();
    const data = {
      title: '编辑系统配置',
      activeMenu: 'system-config',
      username: session?.adminUsername || 'admin',
      csrfToken: csrfToken ?? '',
      config,
    };
    if (modal === '1')
      return (reply as any).view('admin/system-config-edit-form', data);
    return reply.redirect('/admin/system-config', 302);
  }

  @Post('system-config/save')
  @UseGuards(AdminAuthGuard, CsrfGuard)
  async systemConfigSave(
    @Body() body: Record<string, string>,
    @Res() reply: FastifyReply,
  ) {
    const id = body.id ? parseInt(body.id, 10) : 0;
    const name = (body.name ?? '').trim();
    const hint = (body.hint ?? '').trim() || null;
    const value =
      body.value !== undefined && body.value !== '' ? body.value : null;
    const type = body.type ? parseInt(body.type, 10) : 2;

    if (id) {
      await this.systemConfigRepo.update(id, {
        value,
        hint,
      } as any);
    } else {
      if (!name) return reply.redirect('/admin/system-config/edit', 302);
      await this.systemConfigRepo.save(
        this.systemConfigRepo.create({
          name,
          hint,
          value,
          type: [1, 2, 3, 4].includes(type) ? type : 2,
          deletable: 1,
          status: Status.Normal,
        } as any),
      );
    }
    return reply.redirect(
      getReturnPath(body.returnUrl, '/admin/system-config'),
      302,
    );
  }

  @Get('admins')
  @UseGuards(AdminAuthGuard)
  async adminsPage(@Res() reply: FastifyReply, @Req() req: FastifyRequest) {
    const session = (req as any).session;
    const csrfToken = await (reply as any).generateCsrf?.();
    const admins = await this.adminRepo.find({
      where: { status: In([Status.Normal, Status.Hidden]) },
      order: { id: 'ASC' },
    });
    return (reply as any).view('admin/admin-list', {
      title: '管理员管理',
      activeMenu: 'admins',
      username: session?.adminUsername || 'admin',
      csrfToken: csrfToken ?? '',
      admins,
    });
  }

  @Get('admins/edit')
  @UseGuards(AdminAuthGuard)
  async adminCreatePage(
    @Res() reply: FastifyReply,
    @Req() req: FastifyRequest,
    @Query('modal') modal?: string,
  ) {
    const session = (req as any).session;
    const csrfToken = await (reply as any).generateCsrf?.();
    const data = {
      title: '新增管理员',
      activeMenu: 'admins',
      username: session?.adminUsername || 'admin',
      csrfToken: csrfToken ?? '',
      admin: null,
    };
    if (modal === '1')
      return (reply as any).view('admin/admin-edit-form', data);
    return reply.redirect('/admin/admins', 302);
  }

  @Get('admins/edit/:id')
  @UseGuards(AdminAuthGuard)
  async adminEditPage(
    @Param('id') id: string,
    @Res() reply: FastifyReply,
    @Req() req: FastifyRequest,
    @Query('modal') modal?: string,
  ) {
    const admin = await this.adminRepo.findOne({
      where: {
        id: parseInt(id, 10),
        status: In([Status.Normal, Status.Hidden]),
      },
    });
    if (!admin) return reply.redirect('/admin/admins', 302);
    const session = (req as any).session;
    const csrfToken = await (reply as any).generateCsrf?.();
    const data = {
      title: '编辑管理员',
      activeMenu: 'admins',
      username: session?.adminUsername || 'admin',
      csrfToken: csrfToken ?? '',
      admin,
    };
    if (modal === '1')
      return (reply as any).view('admin/admin-edit-form', data);
    return reply.redirect('/admin/admins', 302);
  }

  @Post('admins/save')
  @UseGuards(AdminAuthGuard, CsrfGuard)
  async adminSave(
    @Body() body: Record<string, string>,
    @Res() reply: FastifyReply,
  ) {
    const id = body.id ? parseInt(body.id, 10) : 0;
    const username = (body.username ?? '').trim();
    const password = (body.password ?? '').trim();
    const status = body.status === '0' ? Status.Hidden : Status.Normal;

    if (!username) {
      return reply.redirect(
        id ? `/admin/admins/edit/${id}` : '/admin/admins/edit',
        302,
      );
    }

    if (id) {
      const existing = await this.adminRepo.findOne({ where: { id } });
      if (!existing) return reply.redirect('/admin/admins', 302);
      const updatePayload: Partial<Admin> = { status };
      if (password) {
        updatePayload.password = await this.authService.hashPassword(password);
      }
      await this.adminRepo.update(id, updatePayload as any);
    } else {
      if (!password) return reply.redirect('/admin/admins/edit', 302);
      const sameName = await this.adminRepo.findOne({ where: { username } });
      if (sameName) return reply.redirect('/admin/admins/edit', 302);
      const hashed = await this.authService.hashPassword(password);
      await this.adminRepo.save(
        this.adminRepo.create({
          username,
          password: hashed,
          isSystem: 0,
          status,
        }),
      );
    }
    return reply.redirect(getReturnPath(body.returnUrl, '/admin/admins'), 302);
  }

  private buildContentItems(raw: unknown): {
    bigTitle: string;
    title: string;
    description: string;
    subtitle: string;
    subDescription: string;
    url: string;
    pic1Url: string;
    pic2Url: string;
    content: string;
    index: number;
    displayNum: number;
  }[] {
    const empty = {
      bigTitle: '',
      title: '',
      description: '',
      subtitle: '',
      subDescription: '',
      url: '',
      pic1Url: '',
      pic2Url: '',
      content: '',
    };
    const norm = (o: unknown) => {
      if (!o || typeof o !== 'object') return { ...empty };
      const x = o as Record<string, unknown>;
      return {
        bigTitle: String(x.bigTitle ?? ''),
        title: String(x.title ?? ''),
        description: String(x.description ?? ''),
        subtitle: String(x.subtitle ?? ''),
        subDescription: String(x.subDescription ?? ''),
        url: String(x.url ?? ''),
        pic1Url: String(x.pic1Url ?? ''),
        pic2Url: String(x.pic2Url ?? ''),
        content: String(x.content ?? ''),
      };
    };
    let list: {
      bigTitle: string;
      title: string;
      description: string;
      subtitle: string;
      subDescription: string;
      url: string;
      pic1Url: string;
      pic2Url: string;
      content: string;
    }[];
    if (Array.isArray(raw)) list = raw.length ? raw.map(norm) : [empty];
    else if (raw && typeof raw === 'object') list = [norm(raw)];
    else list = [empty];
    return list.map((item, i) => ({ ...item, index: i, displayNum: i + 1 }));
  }

  // 父子树构建已抽到 common/utils/admin-tree.ts，避免 menu/product-category 各写一套

  private async renderPlaceholder(
    reply: FastifyReply,
    req: FastifyRequest,
    title: string,
    activeMenu: string,
    message?: string,
  ) {
    const session = (req as any).session;
    const csrfToken = await (reply as any).generateCsrf?.();
    return (reply as any).view('admin/placeholder', {
      title,
      activeMenu,
      username: session?.adminUsername || 'admin',
      csrfToken: csrfToken ?? '',
      message: message ?? undefined,
    });
  }

  // clear-cache / not-found 已拆分到 AdminCoreController
}
