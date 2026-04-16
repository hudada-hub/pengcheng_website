import { Controller, Get, Post, Body, Query, UseGuards } from '@nestjs/common';
import { AdminAuthGuard } from '../../common/guards/admin-auth.guard';
import { CsrfGuard } from '../../common/guards/csrf.guard';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Product } from '../../entities/product.entity';
import { News } from '../../entities/news.entity';
import { PageStats } from '../../entities/page-stats.entity';
import { Solution } from '../../entities/solution.entity';
import { Menu } from '../../entities/menu.entity';
import { Status } from '../../common/entities/base.entity';
import { RedisService } from '../redis/redis.service';
import { MenuTranslateService } from './menu-translate.service';
import { NewsCategoryTranslateService } from './news-category-translate.service';
import { ProductCategoryTranslateService } from './product-category-translate.service';
import { SolutionCategoryTranslateService } from './solution-category-translate.service';
import { SolutionTranslateService } from './solution-translate.service';
import { NewsTranslateService } from './news-translate.service';
import { ActivityCalendarTranslateService } from './activity-calendar-translate.service';
import { Admin } from '../../entities/admin.entity';
import { IndustryCase } from '../../entities/industry-case.entity';
import { IndustryCaseTranslateService } from './industry-case-translate.service';
import { ProductTranslateService } from './product-translate.service';
import { DownloadSeriesTranslateService } from './download-series-translate.service';
import { DownloadCategoryTranslateService } from './download-category-translate.service';
import { DownloadFileTypeTranslateService } from './download-file-type-translate.service';
import { DownloadTranslateService } from './download-translate.service';
import { PageStatsService } from '../page-stats/page-stats.service';
import { WebsiteUser } from '../../entities/website-user.entity';
import { ProductParamValueTranslateService } from './product-param-value-translate.service';
import { ProductParamCategoryTranslateService } from './product-param-category-translate.service';

function formatYmdHmsLocal(d: Date | string | null | undefined): string {
  if (d == null) return '-';
  const dt = d instanceof Date ? d : new Date(d);
  if (Number.isNaN(dt.getTime())) return '-';
  const p = (n: number) => String(n).padStart(2, '0');
  return `${dt.getFullYear()}-${p(dt.getMonth() + 1)}-${p(dt.getDate())} ${p(dt.getHours())}:${p(dt.getMinutes())}:${p(dt.getSeconds())}`;
}

@Controller('admin/api')
@UseGuards(AdminAuthGuard)
export class AdminApiController {
  constructor(
    @InjectRepository(Product)
    private readonly productRepo: Repository<Product>,
    @InjectRepository(News) private readonly newsRepo: Repository<News>,
    @InjectRepository(PageStats)
    private readonly pageStatsRepo: Repository<PageStats>,
    @InjectRepository(Solution)
    private readonly solutionRepo: Repository<Solution>,
    @InjectRepository(Menu) private readonly menuRepo: Repository<Menu>,
    @InjectRepository(Admin) private readonly adminRepo: Repository<Admin>,
    @InjectRepository(IndustryCase)
    private readonly industryCaseRepo: Repository<IndustryCase>,
    private readonly redis: RedisService,
    private readonly industryCaseTranslateService: IndustryCaseTranslateService,
    private readonly menuTranslateService: MenuTranslateService,
    private readonly newsCategoryTranslateService: NewsCategoryTranslateService,
    private readonly productCategoryTranslateService: ProductCategoryTranslateService,
    private readonly solutionCategoryTranslateService: SolutionCategoryTranslateService,
    private readonly solutionTranslateService: SolutionTranslateService,
    private readonly newsTranslateService: NewsTranslateService,
    private readonly activityCalendarTranslateService: ActivityCalendarTranslateService,
    private readonly productTranslateService: ProductTranslateService,
    private readonly productParamValueTranslateService: ProductParamValueTranslateService,
    private readonly productParamCategoryTranslateService: ProductParamCategoryTranslateService,
    private readonly downloadSeriesTranslateService: DownloadSeriesTranslateService,
    private readonly downloadCategoryTranslateService: DownloadCategoryTranslateService,
    private readonly downloadFileTypeTranslateService: DownloadFileTypeTranslateService,
    private readonly downloadTranslateService: DownloadTranslateService,
    private readonly pageStatsService: PageStatsService,
    @InjectRepository(WebsiteUser)
    private readonly websiteUserRepo: Repository<WebsiteUser>,
  ) {}

  /** 页面访问：某汇总行对应的明细（弹窗分页） */
  @Get('page-visit-logs')
  async pageVisitLogs(
    @Query('statId') statIdStr?: string,
    @Query('page') pageStr?: string,
    @Query('pageSize') pageSizeStr?: string,
  ) {
    const statId = parseInt(statIdStr || '0', 10);
    if (!statId || statId < 1) {
      return {
        ok: false,
        message: '参数错误',
        list: [],
        total: 0,
        page: 1,
        pageSize: 15,
        totalPages: 0,
      };
    }
    const stat = await this.pageStatsRepo.findOne({ where: { id: statId } });
    if (!stat) {
      return {
        ok: false,
        message: '记录不存在',
        list: [],
        total: 0,
        page: 1,
        pageSize: 15,
        totalPages: 0,
      };
    }
    const page = Math.max(1, parseInt(pageStr || '1', 10) || 1);
    const pageSize = Math.min(
      100,
      Math.max(5, parseInt(pageSizeStr || '15', 10) || 15),
    );
    const { rows, total } =
      await this.pageStatsService.findVisitLogsByLangAndPageType(
        stat.langId,
        stat.pageType,
        page,
        pageSize,
      );
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const logUserIds = [
      ...new Set(
        rows
          .map((r) => r.userId)
          .filter((id): id is number => typeof id === 'number' && id > 0),
      ),
    ];
    const logUsers = logUserIds.length
      ? await this.websiteUserRepo.find({ where: { id: In(logUserIds) } })
      : [];
    const logEmailById = new Map(logUsers.map((u) => [u.id, u.email]));
    const list = rows.map((r) => {
      const uid = r.userId;
      const userDisplay =
        uid != null && uid > 0
          ? (logEmailById.get(uid) ?? `（已删 #${uid}）`)
          : '-';
      return {
        id: r.id,
        createdAtFormatted: formatYmdHmsLocal(r.createdAt),
        pageUrl: r.pageUrl,
        pageUrlShort:
          r.pageUrl && r.pageUrl.length > 72
            ? r.pageUrl.slice(0, 72) + '…'
            : r.pageUrl || '-',
        clientIp: r.clientIp,
        userAgentShort:
          r.userAgent && r.userAgent.length > 96
            ? r.userAgent.slice(0, 96) + '…'
            : r.userAgent || '-',
        userDisplay,
      };
    });
    return { ok: true, list, total, page, pageSize, totalPages };
  }

  @Get('stats')
  async stats() {
    const [productCount, newsCount, solutionCount, visitResult] =
      await Promise.all([
        this.productRepo.count({ where: { status: Status.Normal } }),
        this.newsRepo.count({ where: { status: Status.Normal } }),
        this.solutionRepo.count({ where: { status: Status.Normal } }),
        this.pageStatsRepo
          .createQueryBuilder('p')
          .select('SUM(p.view_count)', 'total')
          .getRawOne<{ total: string | null }>(),
      ]);
    const visits = visitResult?.total
      ? parseInt(String(visitResult.total), 10)
      : 0;
    return {
      products: productCount,
      news: newsCount,
      solutions: solutionCount,
      visits,
      messages: 0, // 留言表后续接入
    };
  }

  @Post('menu/reorder')
  @UseGuards(CsrfGuard)
  async menuReorder(
    @Body() body: { orders: { id: number; sortOrder: number }[] },
  ) {
    const orders = Array.isArray(body?.orders) ? body.orders : [];
    for (const { id, sortOrder } of orders) {
      if (id != null && Number.isFinite(sortOrder)) {
        await this.menuRepo.update(id, { sortOrder: Number(sortOrder) });
      }
    }
    await this.redis.delPattern?.('pengcheng:menu:*');
    return { ok: true, message: '排序已更新' };
  }

  @Get('menu/missing-langs')
  async menuMissingLangs(
    @Query('id') id?: string,
    @Query('retranslate') retranslate?: string,
  ) {
    const num = id ? parseInt(id, 10) : 0;
    if (!num) return [];
    const isRetranslate = retranslate === '1' || retranslate === 'true';
    return this.menuTranslateService.getMissingLangs(num, isRetranslate);
  }

  @Post('menu/translate')
  @UseGuards(CsrfGuard)
  async menuTranslate(
    @Body() body: { sourceMenuId?: number; targetLangIds?: number[] },
  ) {
    const sourceMenuId = body?.sourceMenuId ?? 0;
    const targetLangIds = Array.isArray(body?.targetLangIds)
      ? body.targetLangIds
      : [];
    if (!sourceMenuId || !targetLangIds.length) {
      return { ok: false, message: '请选择源菜单与目标语言' };
    }
    try {
      const result = await this.menuTranslateService.translateMenu(
        sourceMenuId,
        targetLangIds,
      );
      return {
        ok: true,
        ...result,
        message: `已创建 ${result.created} 条，更新 ${result.updated} 条`,
      };
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : '翻译失败';
      return { ok: false, message: msg };
    }
  }

  @Post('menu/translate-batch')
  @UseGuards(CsrfGuard)
  async menuTranslateBatch(
    @Body() body: { sourceIds?: number[]; targetLangIds?: number[] },
  ) {
    const norm = (arr: unknown[]) =>
      arr.map((n) => Number(n)).filter((n) => Number.isFinite(n) && n > 0);
    const sourceIds = norm(body?.sourceIds ?? []);
    const targetLangIds = norm(body?.targetLangIds ?? []);
    if (!sourceIds.length || !targetLangIds.length) {
      return { ok: false, message: '请勾选要翻译的菜单并至少选择一种目标语言' };
    }
    try {
      const result = await this.menuTranslateService.translateMenuBatch(
        sourceIds,
        targetLangIds,
      );
      return {
        ok: true,
        ...result,
        message: `已翻译 ${result.translatedCount} 个菜单，新建 ${result.created} 条，更新 ${result.updated} 条`,
      };
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : '翻译失败';
      return { ok: false, message: msg };
    }
  }

  @Get('news-category/missing-langs')
  async newsCategoryMissingLangs(
    @Query('id') id?: string,
    @Query('retranslate') retranslate?: string,
  ) {
    const num = id ? parseInt(id, 10) : 0;
    if (!num) return [];
    const isRetranslate = retranslate === '1' || retranslate === 'true';
    return this.newsCategoryTranslateService.getMissingLangs(
      num,
      isRetranslate,
    );
  }

  @Post('news-category/translate')
  @UseGuards(CsrfGuard)
  async newsCategoryTranslate(
    @Body() body: { sourceId?: number; targetLangIds?: number[] },
  ) {
    const sourceId = body?.sourceId ?? 0;
    const targetLangIds = Array.isArray(body?.targetLangIds)
      ? body.targetLangIds
      : [];
    if (!sourceId || !targetLangIds.length) {
      return { ok: false, message: '请选择源分类与目标语言' };
    }
    try {
      const result =
        await this.newsCategoryTranslateService.translateNewsCategory(
          sourceId,
          targetLangIds,
        );
      return {
        ok: true,
        ...result,
        message: `已创建 ${result.created} 条，更新 ${result.updated} 条`,
      };
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : '翻译失败';
      return { ok: false, message: msg };
    }
  }

  @Post('news-category/translate-batch')
  @UseGuards(CsrfGuard)
  async newsCategoryTranslateBatch(
    @Body() body: { sourceIds?: number[]; targetLangIds?: number[] },
  ) {
    const norm = (arr: unknown[]) =>
      arr.map((n) => Number(n)).filter((n) => Number.isFinite(n) && n > 0);
    const sourceIds = norm(body?.sourceIds ?? []);
    const targetLangIds = norm(body?.targetLangIds ?? []);
    if (!sourceIds.length || !targetLangIds.length) {
      return {
        ok: false,
        message: '请勾选要翻译的新闻分类并至少选择一种目标语言',
      };
    }
    try {
      const result =
        await this.newsCategoryTranslateService.translateNewsCategoryBatch(
          sourceIds,
          targetLangIds,
        );
      return {
        ok: true,
        ...result,
        message: `已翻译 ${result.translatedCount} 个分类，新建 ${result.created} 条，更新 ${result.updated} 条`,
      };
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : '翻译失败';
      return { ok: false, message: msg };
    }
  }

  @Get('download-category/missing-langs')
  async downloadCategoryMissingLangs(
    @Query('id') id?: string,
    @Query('retranslate') retranslate?: string,
  ) {
    const num = id ? parseInt(id, 10) : 0;
    if (!num) return [];
    const isRetranslate = retranslate === '1' || retranslate === 'true';
    return this.downloadCategoryTranslateService.getMissingLangs(
      num,
      isRetranslate,
    );
  }

  @Post('download-category/translate')
  @UseGuards(CsrfGuard)
  async downloadCategoryTranslate(
    @Body() body: { sourceId?: number; targetLangIds?: number[] },
  ) {
    const sourceId = body?.sourceId ?? 0;
    const targetLangIds = Array.isArray(body?.targetLangIds)
      ? body.targetLangIds
      : [];
    if (!sourceId || !targetLangIds.length) {
      return { ok: false, message: '请选择源资源下载分类与目标语言' };
    }
    try {
      const result =
        await this.downloadCategoryTranslateService.translateDownloadCategory(
          sourceId,
          targetLangIds,
        );
      return {
        ok: true,
        ...result,
        message: `已创建 ${result.created} 条，更新 ${result.updated} 条`,
      };
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : '翻译失败';
      return { ok: false, message: msg };
    }
  }

  @Post('download-category/translate-batch')
  @UseGuards(CsrfGuard)
  async downloadCategoryTranslateBatch(
    @Body() body: { sourceIds?: number[]; targetLangIds?: number[] },
  ) {
    const norm = (arr: unknown[]) =>
      arr.map((n) => Number(n)).filter((n) => Number.isFinite(n) && n > 0);
    const sourceIds = norm(body?.sourceIds ?? []);
    const targetLangIds = norm(body?.targetLangIds ?? []);
    if (!sourceIds.length || !targetLangIds.length) {
      return {
        ok: false,
        message: '请勾选要翻译的资源下载分类并至少选择一种目标语言',
      };
    }
    try {
      const result =
        await this.downloadCategoryTranslateService.translateDownloadCategoryBatch(
          sourceIds,
          targetLangIds,
        );
      return {
        ok: true,
        ...result,
        message: `已翻译 ${result.translatedCount} 个分类，新建 ${result.created} 条，更新 ${result.updated} 条`,
      };
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : '翻译失败';
      return { ok: false, message: msg };
    }
  }

  @Get('download-series/missing-langs')
  async downloadSeriesMissingLangs(
    @Query('id') id?: string,
    @Query('retranslate') retranslate?: string,
  ) {
    const num = id ? parseInt(id, 10) : 0;
    if (!num) return [];
    const isRetranslate = retranslate === '1' || retranslate === 'true';
    return this.downloadSeriesTranslateService.getMissingLangs(
      num,
      isRetranslate,
    );
  }

  @Post('download-series/translate')
  @UseGuards(CsrfGuard)
  async downloadSeriesTranslate(
    @Body() body: { sourceId?: number; targetLangIds?: number[] },
  ) {
    const sourceId = body?.sourceId ?? 0;
    const targetLangIds = Array.isArray(body?.targetLangIds)
      ? body.targetLangIds
      : [];
    if (!sourceId || !targetLangIds.length) {
      return { ok: false, message: '请选择源产品系列与目标语言' };
    }
    try {
      const result =
        await this.downloadSeriesTranslateService.translateDownloadSeries(
          sourceId,
          targetLangIds,
        );
      return {
        ok: true,
        ...result,
        message: `已创建 ${result.created} 条，更新 ${result.updated} 条`,
      };
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : '翻译失败';
      return { ok: false, message: msg };
    }
  }

  @Post('download-series/translate-batch')
  @UseGuards(CsrfGuard)
  async downloadSeriesTranslateBatch(
    @Body() body: { sourceIds?: number[]; targetLangIds?: number[] },
  ) {
    const norm = (arr: unknown[]) =>
      arr.map((n) => Number(n)).filter((n) => Number.isFinite(n) && n > 0);
    const sourceIds = norm(body?.sourceIds ?? []);
    const targetLangIds = norm(body?.targetLangIds ?? []);
    if (!sourceIds.length || !targetLangIds.length) {
      return {
        ok: false,
        message: '请勾选要翻译的产品系列并至少选择一种目标语言',
      };
    }
    try {
      const result =
        await this.downloadSeriesTranslateService.translateDownloadSeriesBatch(
          sourceIds,
          targetLangIds,
        );
      return {
        ok: true,
        ...result,
        message: `已翻译 ${result.translatedCount} 个系列，新建 ${result.created} 条，更新 ${result.updated} 条`,
      };
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : '翻译失败';
      return { ok: false, message: msg };
    }
  }

  @Get('download-file-type/missing-langs')
  async downloadFileTypeMissingLangs(
    @Query('id') id?: string,
    @Query('retranslate') retranslate?: string,
  ) {
    const num = id ? parseInt(id, 10) : 0;
    if (!num) return [];
    const isRetranslate = retranslate === '1' || retranslate === 'true';
    return this.downloadFileTypeTranslateService.getMissingLangs(
      num,
      isRetranslate,
    );
  }

  @Post('download-file-type/translate')
  @UseGuards(CsrfGuard)
  async downloadFileTypeTranslate(
    @Body() body: { sourceId?: number; targetLangIds?: number[] },
  ) {
    const sourceId = body?.sourceId ?? 0;
    const targetLangIds = Array.isArray(body?.targetLangIds)
      ? body.targetLangIds
      : [];
    if (!sourceId || !targetLangIds.length) {
      return { ok: false, message: '请选择源产品文件类型与目标语言' };
    }
    try {
      const result =
        await this.downloadFileTypeTranslateService.translateDownloadFileType(
          sourceId,
          targetLangIds,
        );
      return {
        ok: true,
        ...result,
        message: `已创建 ${result.created} 条，更新 ${result.updated} 条`,
      };
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : '翻译失败';
      return { ok: false, message: msg };
    }
  }

  @Post('download-file-type/translate-batch')
  @UseGuards(CsrfGuard)
  async downloadFileTypeTranslateBatch(
    @Body() body: { sourceIds?: number[]; targetLangIds?: number[] },
  ) {
    const norm = (arr: unknown[]) =>
      arr.map((n) => Number(n)).filter((n) => Number.isFinite(n) && n > 0);
    const sourceIds = norm(body?.sourceIds ?? []);
    const targetLangIds = norm(body?.targetLangIds ?? []);
    if (!sourceIds.length || !targetLangIds.length) {
      return {
        ok: false,
        message: '请勾选要翻译的产品文件类型并至少选择一种目标语言',
      };
    }
    try {
      const result =
        await this.downloadFileTypeTranslateService.translateDownloadFileTypeBatch(
          sourceIds,
          targetLangIds,
        );
      return {
        ok: true,
        ...result,
        message: `已翻译 ${result.translatedCount} 条类型，新建 ${result.created} 条，更新 ${result.updated} 条`,
      };
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : '翻译失败';
      return { ok: false, message: msg };
    }
  }

  @Get('product-category/missing-langs')
  async productCategoryMissingLangs(
    @Query('id') id?: string,
    @Query('retranslate') retranslate?: string,
  ) {
    const num = id ? parseInt(id, 10) : 0;
    if (!num) return [];
    const isRetranslate = retranslate === '1' || retranslate === 'true';
    return this.productCategoryTranslateService.getMissingLangs(
      num,
      isRetranslate,
    );
  }

  @Post('product-category/translate')
  @UseGuards(CsrfGuard)
  async productCategoryTranslate(
    @Body() body: { sourceId?: number; targetLangIds?: number[] },
  ) {
    const sourceId = Number(body?.sourceId) || 0;
    const targetLangIds = Array.isArray(body?.targetLangIds)
      ? body.targetLangIds
          .map((n) => Number(n))
          .filter((n) => Number.isFinite(n) && n > 0)
      : [];
    if (!sourceId || !targetLangIds.length) {
      return { ok: false, message: '请选择源分类与目标语言' };
    }
    try {
      const result =
        await this.productCategoryTranslateService.translateProductCategory(
          sourceId,
          targetLangIds,
        );
      return {
        ok: true,
        ...result,
        message: `已创建 ${result.created} 条，更新 ${result.updated} 条`,
      };
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : '翻译失败';
      return { ok: false, message: msg };
    }
  }

  @Post('product-category/translate-batch')
  @UseGuards(CsrfGuard)
  async productCategoryTranslateBatch(
    @Body() body: { sourceIds?: number[]; targetLangIds?: number[] },
  ) {
    const norm = (arr: unknown[]) =>
      arr.map((n) => Number(n)).filter((n) => Number.isFinite(n) && n > 0);
    const sourceIds = Array.isArray(body?.sourceIds)
      ? norm(body.sourceIds)
      : [];
    const targetLangIds = Array.isArray(body?.targetLangIds)
      ? norm(body.targetLangIds)
      : [];
    if (!sourceIds.length || !targetLangIds.length) {
      return { ok: false, message: '请勾选要翻译的分类并至少选择一种目标语言' };
    }
    try {
      const result =
        await this.productCategoryTranslateService.translateProductCategoryBatch(
          sourceIds,
          targetLangIds,
        );
      return {
        ok: true,
        ...result,
        message: `已翻译 ${result.translatedCount} 个分类，新建 ${result.created} 条，更新 ${result.updated} 条`,
      };
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : '翻译失败';
      return { ok: false, message: msg };
    }
  }

  @Get('solution-category/missing-langs')
  async solutionCategoryMissingLangs(
    @Query('id') id?: string,
    @Query('retranslate') retranslate?: string,
  ) {
    const num = id ? parseInt(id, 10) : 0;
    if (!num) return [];
    const isRetranslate = retranslate === '1' || retranslate === 'true';
    return this.solutionCategoryTranslateService.getMissingLangs(
      num,
      isRetranslate,
    );
  }

  @Post('solution-category/translate')
  @UseGuards(CsrfGuard)
  async solutionCategoryTranslate(
    @Body() body: { sourceId?: number; targetLangIds?: number[] },
  ) {
    const sourceId = body?.sourceId ?? 0;
    const targetLangIds = Array.isArray(body?.targetLangIds)
      ? body.targetLangIds
      : [];
    if (!sourceId || !targetLangIds.length) {
      return { ok: false, message: '请选择源分类与目标语言' };
    }
    try {
      const result =
        await this.solutionCategoryTranslateService.translateSolutionCategory(
          sourceId,
          targetLangIds,
        );
      return {
        ok: true,
        ...result,
        message: `已创建 ${result.created} 条，更新 ${result.updated} 条`,
      };
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : '翻译失败';
      return { ok: false, message: msg };
    }
  }

  @Post('solution-category/translate-batch')
  @UseGuards(CsrfGuard)
  async solutionCategoryTranslateBatch(
    @Body() body: { sourceIds?: number[]; targetLangIds?: number[] },
  ) {
    const norm = (arr: unknown[]) =>
      arr.map((n) => Number(n)).filter((n) => Number.isFinite(n) && n > 0);
    const sourceIds = norm(body?.sourceIds ?? []);
    const targetLangIds = norm(body?.targetLangIds ?? []);
    if (!sourceIds.length || !targetLangIds.length) {
      return {
        ok: false,
        message: '请勾选要翻译的解决方案分类并至少选择一种目标语言',
      };
    }
    try {
      const result =
        await this.solutionCategoryTranslateService.translateSolutionCategoryBatch(
          sourceIds,
          targetLangIds,
        );
      return {
        ok: true,
        ...result,
        message: `已翻译 ${result.translatedCount} 个分类，新建 ${result.created} 条，更新 ${result.updated} 条`,
      };
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : '翻译失败';
      return { ok: false, message: msg };
    }
  }

  @Get('solution/missing-langs')
  async solutionMissingLangs(
    @Query('id') id?: string,
    @Query('retranslate') retranslate?: string,
  ) {
    const num = id ? parseInt(id, 10) : 0;
    if (!num) return [];
    const isRetranslate = retranslate === '1' || retranslate === 'true';
    return this.solutionTranslateService.getMissingLangs(num, isRetranslate);
  }

  @Post('solution/translate')
  @UseGuards(CsrfGuard)
  async solutionTranslate(
    @Body() body: { sourceId?: number; targetLangIds?: number[] },
  ) {
    const sourceId = body?.sourceId ?? 0;
    const targetLangIds = Array.isArray(body?.targetLangIds)
      ? body.targetLangIds
      : [];
    if (!sourceId || !targetLangIds.length) {
      return { ok: false, message: '请选择源解决方案与目标语言' };
    }
    try {
      const result = await this.solutionTranslateService.translateSolution(
        sourceId,
        targetLangIds,
      );
      return {
        ok: true,
        ...result,
        message: `已创建 ${result.created} 条，更新 ${result.updated} 条`,
      };
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : '翻译失败';
      return { ok: false, message: msg };
    }
  }

  @Post('solution/translate-batch')
  @UseGuards(CsrfGuard)
  async solutionTranslateBatch(
    @Body() body: { sourceIds?: number[]; targetLangIds?: number[] },
  ) {
    const norm = (arr: unknown[]) =>
      arr.map((n) => Number(n)).filter((n) => Number.isFinite(n) && n > 0);
    const sourceIds = norm(body?.sourceIds ?? []);
    const targetLangIds = norm(body?.targetLangIds ?? []);
    if (!sourceIds.length || !targetLangIds.length) {
      return {
        ok: false,
        message: '请勾选要翻译的解决方案并至少选择一种目标语言',
      };
    }
    try {
      const result = await this.solutionTranslateService.translateSolutionBatch(
        sourceIds,
        targetLangIds,
      );
      return {
        ok: true,
        ...result,
        message: `已翻译 ${result.translatedCount} 个解决方案，新建 ${result.created} 条，更新 ${result.updated} 条`,
      };
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : '翻译失败';
      return { ok: false, message: msg };
    }
  }

  @Get('news/missing-langs')
  async newsMissingLangs(
    @Query('id') id?: string,
    @Query('retranslate') retranslate?: string,
  ) {
    const num = id ? parseInt(id, 10) : 0;
    if (!num) return [];
    const isRetranslate = retranslate === '1' || retranslate === 'true';
    return this.newsTranslateService.getMissingLangs(num, isRetranslate);
  }

  @Post('news/translate')
  @UseGuards(CsrfGuard)
  async newsTranslate(
    @Body() body: { sourceId?: number; targetLangIds?: number[] },
  ) {
    const sourceId = body?.sourceId ?? 0;
    const targetLangIds = Array.isArray(body?.targetLangIds)
      ? body.targetLangIds
      : [];
    if (!sourceId || !targetLangIds.length) {
      return { ok: false, message: '请选择源新闻与目标语言' };
    }
    try {
      const result = await this.newsTranslateService.translateNews(
        sourceId,
        targetLangIds,
      );
      return {
        ok: true,
        ...result,
        message: `已创建 ${result.created} 条，更新 ${result.updated} 条`,
      };
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : '翻译失败';
      return { ok: false, message: msg };
    }
  }

  @Post('news/translate-batch')
  @UseGuards(CsrfGuard)
  async newsTranslateBatch(
    @Body() body: { sourceIds?: number[]; targetLangIds?: number[] },
  ) {
    const norm = (arr: unknown[]) =>
      arr.map((n) => Number(n)).filter((n) => Number.isFinite(n) && n > 0);
    const sourceIds = norm(body?.sourceIds ?? []);
    const targetLangIds = norm(body?.targetLangIds ?? []);
    if (!sourceIds.length || !targetLangIds.length) {
      return { ok: false, message: '请勾选要翻译的新闻并至少选择一种目标语言' };
    }
    try {
      const result = await this.newsTranslateService.translateNewsBatch(
        sourceIds,
        targetLangIds,
      );
      return {
        ok: true,
        ...result,
        message: `已翻译 ${result.translatedCount} 条新闻，新建 ${result.created} 条，更新 ${result.updated} 条`,
      };
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : '翻译失败';
      return { ok: false, message: msg };
    }
  }

  @Get('download/missing-langs')
  async downloadMissingLangs(
    @Query('id') id?: string,
    @Query('retranslate') retranslate?: string,
  ) {
    const num = id ? parseInt(id, 10) : 0;
    if (!num) return [];
    const isRetranslate = retranslate === '1' || retranslate === 'true';
    return this.downloadTranslateService.getMissingLangs(num, isRetranslate);
  }

  @Post('download/translate')
  @UseGuards(CsrfGuard)
  async downloadTranslate(
    @Body() body: { sourceId?: number; targetLangIds?: number[] },
  ) {
    const sourceId = body?.sourceId ?? 0;
    const targetLangIds = Array.isArray(body?.targetLangIds)
      ? body.targetLangIds
      : [];
    if (!sourceId || !targetLangIds.length) {
      return { ok: false, message: '请选择源资源与目标语言' };
    }
    try {
      const result = await this.downloadTranslateService.translateDownload(
        sourceId,
        targetLangIds,
      );
      return {
        ok: true,
        ...result,
        message: `已创建 ${result.created} 条，更新 ${result.updated} 条`,
      };
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : '翻译失败';
      return { ok: false, message: msg };
    }
  }

  @Post('download/translate-batch')
  @UseGuards(CsrfGuard)
  async downloadTranslateBatch(
    @Body() body: { sourceIds?: number[]; targetLangIds?: number[] },
  ) {
    const norm = (arr: unknown[]) =>
      arr.map((n) => Number(n)).filter((n) => Number.isFinite(n) && n > 0);
    const sourceIds = norm(body?.sourceIds ?? []);
    const targetLangIds = norm(body?.targetLangIds ?? []);
    if (!sourceIds.length || !targetLangIds.length) {
      return { ok: false, message: '请勾选要翻译的资源并至少选择一种目标语言' };
    }
    try {
      const result = await this.downloadTranslateService.translateDownloadBatch(
        sourceIds,
        targetLangIds,
      );
      return {
        ok: true,
        ...result,
        message: `已翻译 ${result.translatedCount} 条资源，新建 ${result.created} 条，更新 ${result.updated} 条`,
      };
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : '翻译失败';
      return { ok: false, message: msg };
    }
  }

  @Get('activity-calendar/missing-langs')
  async activityCalendarMissingLangs(
    @Query('id') id?: string,
    @Query('retranslate') retranslate?: string,
  ) {
    const num = id ? parseInt(id, 10) : 0;
    if (!num) return [];
    const isRetranslate = retranslate === '1' || retranslate === 'true';
    return this.activityCalendarTranslateService.getMissingLangs(
      num,
      isRetranslate,
    );
  }

  @Post('activity-calendar/translate')
  @UseGuards(CsrfGuard)
  async activityCalendarTranslate(
    @Body() body: { sourceId?: number; targetLangIds?: number[] },
  ) {
    const sourceId = body?.sourceId ?? 0;
    const targetLangIds = Array.isArray(body?.targetLangIds)
      ? body.targetLangIds
      : [];
    if (!sourceId || !targetLangIds.length) {
      return { ok: false, message: '请选择源活动与目标语言' };
    }
    try {
      const result =
        await this.activityCalendarTranslateService.translateActivityCalendar(
          sourceId,
          targetLangIds,
        );
      return {
        ok: true,
        ...result,
        message: `已创建 ${result.created} 条，更新 ${result.updated} 条`,
      };
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : '翻译失败';
      return { ok: false, message: msg };
    }
  }

  @Post('activity-calendar/translate-batch')
  @UseGuards(CsrfGuard)
  async activityCalendarTranslateBatch(
    @Body() body: { sourceIds?: number[]; targetLangIds?: number[] },
  ) {
    const norm = (arr: unknown[]) =>
      arr.map((n) => Number(n)).filter((n) => Number.isFinite(n) && n > 0);
    const sourceIds = norm(body?.sourceIds ?? []);
    const targetLangIds = norm(body?.targetLangIds ?? []);
    if (!sourceIds.length || !targetLangIds.length) {
      return { ok: false, message: '请勾选要翻译的活动并至少选择一种目标语言' };
    }
    try {
      const result =
        await this.activityCalendarTranslateService.translateActivityCalendarBatch(
          sourceIds,
          targetLangIds,
        );
      return {
        ok: true,
        ...result,
        message: `已翻译 ${result.translatedCount} 个活动，新建 ${result.created} 条，更新 ${result.updated} 条`,
      };
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : '翻译失败';
      return { ok: false, message: msg };
    }
  }

  @Get('industry-case/missing-langs')
  async industryCaseMissingLangs(
    @Query('id') id?: string,
    @Query('retranslate') retranslate?: string,
  ) {
    const num = id ? parseInt(id, 10) : 0;
    if (!num) return [];
    const isRetranslate = retranslate === '1' || retranslate === 'true';
    return this.industryCaseTranslateService.getMissingLangs(
      num,
      isRetranslate,
    );
  }

  @Post('industry-case/translate')
  @UseGuards(CsrfGuard)
  async industryCaseTranslate(
    @Body() body: { sourceId?: number; targetLangIds?: number[] },
  ) {
    const sourceId = body?.sourceId ?? 0;
    const targetLangIds = Array.isArray(body?.targetLangIds)
      ? body.targetLangIds
      : [];
    if (!sourceId || !targetLangIds.length) {
      return { ok: false, message: '请选择源案例与目标语言' };
    }
    try {
      const result =
        await this.industryCaseTranslateService.translateIndustryCase(
          sourceId,
          targetLangIds,
        );
      return {
        ok: true,
        ...result,
        message: `已创建 ${result.created} 条，更新 ${result.updated} 条`,
      };
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : '翻译失败';
      return { ok: false, message: msg };
    }
  }

  @Post('industry-case/translate-batch')
  @UseGuards(CsrfGuard)
  async industryCaseTranslateBatch(
    @Body() body: { sourceIds?: number[]; targetLangIds?: number[] },
  ) {
    const norm = (arr: unknown[]) =>
      arr.map((n) => Number(n)).filter((n) => Number.isFinite(n) && n > 0);
    const sourceIds = norm(body?.sourceIds ?? []);
    const targetLangIds = norm(body?.targetLangIds ?? []);
    if (!sourceIds.length || !targetLangIds.length) {
      return {
        ok: false,
        message: '请勾选要翻译的行业案例并至少选择一种目标语言',
      };
    }
    try {
      const result =
        await this.industryCaseTranslateService.translateIndustryCaseBatch(
          sourceIds,
          targetLangIds,
        );
      return {
        ok: true,
        ...result,
        message: `已翻译 ${result.translatedCount} 个行业案例，新建 ${result.created} 条，更新 ${result.updated} 条`,
      };
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : '翻译失败';
      return { ok: false, message: msg };
    }
  }

  @Get('product/missing-langs')
  async productMissingLangs(
    @Query('id') id?: string,
    @Query('retranslate') retranslate?: string,
  ) {
    const num = id ? parseInt(id, 10) : 0;
    if (!num) return [];
    const isRetranslate = retranslate === '1' || retranslate === 'true';
    return this.productTranslateService.getMissingLangs(num, isRetranslate);
  }

  @Post('product/translate')
  @UseGuards(CsrfGuard)
  async productTranslate(
    @Body() body: { sourceId?: number; targetLangIds?: number[] },
  ) {
    const sourceId = body?.sourceId ?? 0;
    const targetLangIds = Array.isArray(body?.targetLangIds)
      ? body.targetLangIds
      : [];
    if (!sourceId || !targetLangIds.length) {
      return { ok: false, message: '请选择源产品与目标语言' };
    }
    try {
      const result = await this.productTranslateService.translateProduct(
        sourceId,
        targetLangIds,
      );
      return {
        ok: true,
        ...result,
        message: `已创建 ${result.created} 条，更新 ${result.updated} 条`,
      };
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : '翻译失败';
      return { ok: false, message: msg };
    }
  }

  @Post('product/translate-batch')
  @UseGuards(CsrfGuard)
  async productTranslateBatch(
    @Body() body: { sourceIds?: number[]; targetLangIds?: number[] },
  ) {
    const norm = (arr: unknown[]) =>
      arr.map((n) => Number(n)).filter((n) => Number.isFinite(n) && n > 0);
    const sourceIds = norm(body?.sourceIds ?? []);
    const targetLangIds = norm(body?.targetLangIds ?? []);
    if (!sourceIds.length || !targetLangIds.length) {
      return { ok: false, message: '请勾选要翻译的产品并至少选择一种目标语言' };
    }
    try {
      const result = await this.productTranslateService.translateProductBatch(
        sourceIds,
        targetLangIds,
      );
      let message = `已处理 ${result.translatedCount} 个产品，新建 ${result.created} 条，更新 ${result.updated} 条`;
      if (result.warnings?.length) {
        const max = 15;
        const tail =
          result.warnings.length > max
            ? `\n…等共 ${result.warnings.length} 条提示`
            : '';
        message +=
          '\n\n部分未翻译：\n' +
          result.warnings.slice(0, max).join('\n') +
          tail;
      }
      return {
        ok: true,
        ...result,
        message,
      };
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : '翻译失败';
      return { ok: false, message: msg };
    }
  }

  @Get('product-param-value/missing-langs')
  async productParamValueMissingLangs(
    @Query('id') id?: string,
    @Query('retranslate') retranslate?: string,
  ) {
    const num = id ? parseInt(id, 10) : 0;
    if (!num) return [];
    const isRetranslate = retranslate === '1' || retranslate === 'true';
    return this.productParamValueTranslateService.getMissingLangs(
      num,
      isRetranslate,
    );
  }

  @Post('product-param-value/translate')
  @UseGuards(CsrfGuard)
  async productParamValueTranslate(
    @Body() body: { sourceId?: number; targetLangIds?: number[] },
  ) {
    const sourceId = body?.sourceId ?? 0;
    const targetLangIds = Array.isArray(body?.targetLangIds)
      ? body.targetLangIds
      : [];
    if (!sourceId || !targetLangIds.length) {
      return { ok: false, message: '请选择源参数值与目标语言' };
    }
    try {
      const result =
        await this.productParamValueTranslateService.translateParamValue(
          sourceId,
          targetLangIds,
        );
      return {
        ok: true,
        ...result,
        message: `已创建 ${result.created} 条，更新 ${result.updated} 条`,
      };
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : '翻译失败';
      return { ok: false, message: msg };
    }
  }

  @Post('product-param-value/translate-batch')
  @UseGuards(CsrfGuard)
  async productParamValueTranslateBatch(
    @Body() body: { sourceIds?: number[]; targetLangIds?: number[] },
  ) {
    const norm = (arr: unknown[]) =>
      arr.map((n) => Number(n)).filter((n) => Number.isFinite(n) && n > 0);
    const sourceIds = norm(body?.sourceIds ?? []);
    const targetLangIds = norm(body?.targetLangIds ?? []);
    if (!sourceIds.length || !targetLangIds.length) {
      return {
        ok: false,
        message: '请勾选要翻译的参数值并至少选择一种目标语言',
      };
    }
    try {
      const result =
        await this.productParamValueTranslateService.translateParamValueBatch(
          sourceIds,
          targetLangIds,
        );
      return {
        ok: true,
        ...result,
        message: `已翻译 ${result.translatedCount} 条参数值，新建 ${result.created} 条，更新 ${result.updated} 条`,
      };
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : '翻译失败';
      return { ok: false, message: msg };
    }
  }

  @Get('product-param-category/missing-langs')
  async productParamCategoryMissingLangs(
    @Query('id') id?: string,
    @Query('retranslate') retranslate?: string,
  ) {
    const num = id ? parseInt(id, 10) : 0;
    if (!num) return [];
    const isRetranslate = retranslate === '1' || retranslate === 'true';
    return this.productParamCategoryTranslateService.getMissingLangs(
      num,
      isRetranslate,
    );
  }

  @Post('product-param-category/translate')
  @UseGuards(CsrfGuard)
  async productParamCategoryTranslate(
    @Body() body: { sourceId?: number; targetLangIds?: number[] },
  ) {
    const sourceId = body?.sourceId ?? 0;
    const targetLangIds = Array.isArray(body?.targetLangIds)
      ? body.targetLangIds
      : [];
    if (!sourceId || !targetLangIds.length) {
      return { ok: false, message: '请选择源参数分类与目标语言' };
    }
    try {
      const result =
        await this.productParamCategoryTranslateService.translateCategory(
          sourceId,
          targetLangIds,
        );
      return {
        ok: true,
        ...result,
        message: `已创建 ${result.created} 条，更新 ${result.updated} 条`,
      };
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : '翻译失败';
      return { ok: false, message: msg };
    }
  }

  @Post('product-param-category/translate-batch')
  @UseGuards(CsrfGuard)
  async productParamCategoryTranslateBatch(
    @Body() body: { sourceIds?: number[]; targetLangIds?: number[] },
  ) {
    const norm = (arr: unknown[]) =>
      arr.map((n) => Number(n)).filter((n) => Number.isFinite(n) && n > 0);
    const sourceIds = norm(body?.sourceIds ?? []);
    const targetLangIds = norm(body?.targetLangIds ?? []);
    if (!sourceIds.length || !targetLangIds.length) {
      return {
        ok: false,
        message: '请勾选要翻译的参数分类并至少选择一种目标语言',
      };
    }
    try {
      const result =
        await this.productParamCategoryTranslateService.translateCategoryBatch(
          sourceIds,
          targetLangIds,
        );
      return {
        ok: true,
        ...result,
        message: `已翻译 ${result.translatedCount} 条分类，新建 ${result.created} 条，更新 ${result.updated} 条`,
      };
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : '翻译失败';
      return { ok: false, message: msg };
    }
  }

  @Post('admins/delete')
  @UseGuards(CsrfGuard)
  async adminDelete(@Body() body: { id?: number }) {
    const id = body?.id;
    if (id == null || !Number.isInteger(id)) {
      return { ok: false, message: '参数错误' };
    }
    const admin = await this.adminRepo.findOne({ where: { id } });
    if (!admin) {
      return { ok: false, message: '管理员不存在' };
    }
    if (admin.isSystem === 1) {
      return { ok: false, message: '系统默认管理员不可删除' };
    }
    await this.adminRepo.delete(id);
    return { ok: true, message: '已删除' };
  }
}
