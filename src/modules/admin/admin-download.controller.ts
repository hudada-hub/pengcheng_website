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
import { DataSource, In, Repository } from 'typeorm';
import { DownloadCategory } from '../../entities/download-category.entity';
import { DownloadSeries } from '../../entities/download-series.entity';
import { DownloadFileType } from '../../entities/download-file-type.entity';
import { Download } from '../../entities/download.entity';
import { Lang } from '../../entities/lang.entity';
import { Status } from '../../common/entities/base.entity';
import { AdminAuthGuard } from '../../common/guards/admin-auth.guard';
import { CsrfGuard } from '../../common/guards/csrf.guard';
import { RedisService } from '../redis/redis.service';
import { AdminLangService } from './admin-lang.service';
import { getReturnPath } from '../../common/utils/admin-redirect';

@Controller('admin')
export class AdminDownloadController {
  constructor(
    @InjectRepository(DownloadCategory)
    private readonly downloadCategoryRepo: Repository<DownloadCategory>,
    @InjectRepository(DownloadSeries)
    private readonly downloadSeriesRepo: Repository<DownloadSeries>,
    @InjectRepository(DownloadFileType)
    private readonly downloadFileTypeRepo: Repository<DownloadFileType>,
    @InjectRepository(Download)
    private readonly downloadRepo: Repository<Download>,
    @InjectRepository(Lang) private readonly langRepo: Repository<Lang>,
    private readonly redis: RedisService,
    private readonly adminLangService: AdminLangService,
    private readonly dataSource: DataSource,
  ) {}

  /**
   * 与资源下载列表语言筛选一致：弹窗表单内仅加载该语言下的分类 / 产品系列 / 文件类型（不混排其它语言）。
   */
  private async loadDownloadFormSelectData(
    download: Download | null,
    queryLangStr: string | undefined,
  ): Promise<{
    categories: DownloadCategory[];
    seriesList: DownloadSeries[];
    fileTypeList: DownloadFileType[];
    formLangId: number;
    defaultLangId: number;
  }> {
    const defaultLangId = (await this.adminLangService.getDefaultLangId()) ?? 0;
    let formLangId = defaultLangId;
    if (download) {
      formLangId = download.langId;
    } else {
      const raw = (queryLangStr ?? '').toString().trim();
      if (raw && raw !== 'all') {
        const n = parseInt(raw, 10);
        if (Number.isFinite(n) && n > 0) formLangId = n;
      }
    }
    const langIdFilter =
      formLangId > 0 ? formLangId : defaultLangId > 0 ? defaultLangId : 0;
    const whereLang =
      langIdFilter > 0
        ? { status: Status.Normal as const, langId: langIdFilter }
        : { status: Status.Normal as const };
    const [categories, seriesList, fileTypeList] = await Promise.all([
      this.downloadCategoryRepo.find({
        where: whereLang,
        order: { sort: 'ASC', id: 'ASC' },
      }),
      this.downloadSeriesRepo.find({
        where: whereLang,
        order: { sort: 'ASC', id: 'ASC' },
      }),
      this.downloadFileTypeRepo.find({
        where: whereLang,
        order: { sort: 'ASC', id: 'ASC' },
      }),
    ]);
    const resolvedFormLang =
      langIdFilter > 0
        ? langIdFilter
        : defaultLangId > 0
          ? defaultLangId
          : formLangId;
    return {
      categories,
      seriesList,
      fileTypeList,
      formLangId: resolvedFormLang,
      defaultLangId,
    };
  }

  @Get('download-category')
  @UseGuards(AdminAuthGuard)
  async downloadCategoryPage(
    @Res() reply: FastifyReply,
    @Req() req: FastifyRequest,
    @Query('langId') langId?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    const session = (req as any).session;
    const csrfToken = await (reply as any).generateCsrf?.();
    const pageSizeNum = Math.min(
      100,
      Math.max(5, parseInt(pageSize || '15', 10) || 15),
    );
    const currentPage = Math.max(1, parseInt(page || '1', 10) || 1);
    const [allCategories, langs, defaultLangId] = await Promise.all([
      this.downloadCategoryRepo.find({
        where: { status: In([Status.Normal, Status.Hidden]) },
        relations: ['lang'],
        order: { sort: 'ASC', id: 'ASC' },
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
    const filtered = filterByLang
      ? allCategories.filter((c) => c.langId === selectedLangId)
      : showAll
        ? allCategories
        : allCategories.filter((c) => c.langId === defaultLangId);
    const total = filtered.length;
    const totalPages = Math.max(1, Math.ceil(total / pageSizeNum));
    const from = (currentPage - 1) * pageSizeNum;
    const categories = filtered.slice(from, from + pageSizeNum);
    const baseUrl =
      '/admin/download-category?' +
      (selectedLangId === ''
        ? 'langId=all&'
        : 'langId=' + encodeURIComponent(String(selectedLangId)) + '&') +
      'pageSize=' +
      encodeURIComponent(String(pageSizeNum));
    return (reply as any).view('admin/download-category-list', {
      title: '资源下载分类',
      activeMenu: 'download-category',
      username: session?.adminUsername || 'admin',
      csrfToken: csrfToken ?? '',
      categories,
      langs,
      defaultLangId,
      selectedLangId: selectedLangId === '' ? '' : selectedLangId,
      pagination: {
        currentPage,
        totalPages,
        total,
        pageSize: pageSizeNum,
        baseUrl,
      },
    });
  }

  @Get('download-category/edit')
  @UseGuards(AdminAuthGuard)
  async downloadCategoryCreatePage(
    @Res() reply: FastifyReply,
    @Req() req: FastifyRequest,
    @Query('modal') modal?: string,
  ) {
    const session = (req as any).session;
    const csrfToken = await (reply as any).generateCsrf?.();
    const [langs, allCategories] = await Promise.all([
      this.langRepo.find({
        where: { status: Status.Normal },
        order: { id: 'ASC' },
      }),
      this.downloadCategoryRepo.find({
        where: { status: In([Status.Normal, Status.Hidden]) },
        relations: ['lang'],
        order: { sort: 'ASC', id: 'ASC' },
      }),
    ]);
    const defaultLang =
      langs.find((l) => l.code === 'zh') ??
      langs.find((l) => l.isDefault === 1) ??
      langs[0];
    const data = {
      title: '新增资源下载分类',
      activeMenu: 'download-category',
      username: session?.adminUsername || 'admin',
      csrfToken: csrfToken ?? '',
      category: null,
      langs,
      defaultLangId: defaultLang?.id ?? 0,
      categories: allCategories,
    };
    if (modal === '1')
      return (reply as any).view('admin/download-category-edit-form', data);
    return reply.redirect('/admin/download-category', 302);
  }

  @Get('download-category/edit/:id')
  @UseGuards(AdminAuthGuard)
  async downloadCategoryEditPage(
    @Param('id') id: string,
    @Res() reply: FastifyReply,
    @Req() req: FastifyRequest,
    @Query('modal') modal?: string,
  ) {
    const category = await this.downloadCategoryRepo.findOne({
      where: {
        id: parseInt(id, 10),
        status: In([Status.Normal, Status.Hidden]),
      },
      relations: ['lang'],
    });
    if (!category) return reply.redirect('/admin/download-category', 302);
    const session = (req as any).session;
    const csrfToken = await (reply as any).generateCsrf?.();
    const [langs, allCategories] = await Promise.all([
      this.langRepo.find({
        where: { status: Status.Normal },
        order: { id: 'ASC' },
      }),
      this.downloadCategoryRepo.find({
        where: { status: In([Status.Normal, Status.Hidden]) },
        relations: ['lang'],
        order: { sort: 'ASC', id: 'ASC' },
      }),
    ]);
    const data = {
      title: '编辑资源下载分类',
      activeMenu: 'download-category',
      username: session?.adminUsername || 'admin',
      csrfToken: csrfToken ?? '',
      category,
      langs,
      defaultLangId: category.langId,
      categories: allCategories,
    };
    if (modal === '1')
      return (reply as any).view('admin/download-category-edit-form', data);
    return reply.redirect('/admin/download-category', 302);
  }

  @Post('download-category/save')
  @UseGuards(AdminAuthGuard, CsrfGuard)
  async downloadCategorySave(
    @Body() body: Record<string, string>,
    @Res() reply: FastifyReply,
  ) {
    // 直接复用原逻辑：字段校验 + 新建后回填 categoryId
    const id = body.id ? parseInt(body.id, 10) : 0;
    const name = (body.name ?? '').trim();
    const metaTitle = (body.metaTitle ?? '').trim() || name;
    const metaKeywords = (body.metaKeywords ?? '').trim() || null;
    const metaDescription = (body.metaDescription ?? '').trim() || null;
    const langId = parseInt(body.langId, 10) || 0;
    const sort = parseInt(body.sort, 10) || 0;
    const parentId = parseInt(body.parentId, 10) || 0;
    const status = body.status === '0' ? Status.Hidden : Status.Normal;
    if (!name)
      return reply.redirect(
        id
          ? `/admin/download-category/edit/${id}`
          : '/admin/download-category/edit',
        302,
      );
    if (!langId)
      return reply.redirect(
        id
          ? `/admin/download-category/edit/${id}`
          : '/admin/download-category/edit',
        302,
      );
    if (id) {
      await this.downloadCategoryRepo.update(id, {
        name,
        metaTitle: metaTitle || name,
        metaKeywords,
        metaDescription,
        langId,
        sort,
        parentId,
        status,
      } as any);
    } else {
      const created = await this.downloadCategoryRepo.save(
        this.downloadCategoryRepo.create({
          name,
          metaTitle: metaTitle || name,
          metaKeywords,
          metaDescription,
          langId,
          sort,
          parentId,
          status,
          categoryId: null,
        } as any),
      );
      const createdId = Array.isArray(created)
        ? created[0]?.id
        : (created as DownloadCategory)?.id;
      if (createdId)
        await this.downloadCategoryRepo.update(createdId, {
          categoryId: createdId,
        } as any);
    }
    await this.redis.delPattern?.('pengcheng:*');
    return reply.redirect(
      getReturnPath(body.returnUrl, '/admin/download-category'),
      302,
    );
  }

  @Post('download-category/delete/:id')
  @UseGuards(AdminAuthGuard, CsrfGuard)
  async downloadCategoryDelete(
    @Param('id') id: string,
    @Res() reply: FastifyReply,
    @Req() req: FastifyRequest,
  ) {
    const rid = parseInt(id, 10);
    await this.dataSource.transaction(async (manager) => {
      await manager.getRepository(Download).delete({ resourceTypeId: rid });
      await manager.getRepository(DownloadCategory).delete(rid);
    });
    await this.redis.delPattern?.('pengcheng:*');
    const referer = (req as any).headers?.referer || '/admin/download-category';
    return reply.redirect(referer, 302);
  }

  @Post('download-category/batch-delete')
  @UseGuards(AdminAuthGuard, CsrfGuard)
  async downloadCategoryBatchDelete(
    @Body() body: { ids?: number[] },
    @Res() reply: FastifyReply,
    @Req() req: FastifyRequest,
  ) {
    const ids = Array.isArray(body?.ids)
      ? body.ids
          .map((i) => parseInt(String(i), 10))
          .filter((i) => Number.isFinite(i))
      : [];
    if (ids.length) {
      await this.dataSource.transaction(async (manager) => {
        await manager
          .getRepository(Download)
          .delete({ resourceTypeId: In(ids) });
        await manager.getRepository(DownloadCategory).delete({ id: In(ids) });
      });
      await this.redis.delPattern?.('pengcheng:*');
    }
    const referer = (req as any).headers?.referer || '/admin/download-category';
    return reply.redirect(referer, 302);
  }

  @Get('downloads')
  @UseGuards(AdminAuthGuard)
  async downloadsPage(
    @Res() reply: FastifyReply,
    @Req() req: FastifyRequest,
    @Query('langId') langId?: string,
    @Query('categoryId') categoryId?: string,
    @Query('seriesId') seriesId?: string,
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
    const [allDownloads, categories, seriesList, langs, defaultLangId] =
      await Promise.all([
        this.downloadRepo.find({
          where: { status: In([Status.Normal, Status.Hidden]) },
          relations: ['resourceType', 'series', 'lang', 'downloadFileType'],
          order: { id: 'DESC' },
        }),
        this.downloadCategoryRepo.find({
          where: { status: Status.Normal },
          order: { sort: 'ASC', id: 'ASC' },
        }),
        this.downloadSeriesRepo.find({
          where: { status: Status.Normal },
          relations: ['lang'],
          order: { sort: 'ASC', id: 'ASC' },
        }),
        this.langRepo.find({
          where: { status: Status.Normal },
          order: { id: 'ASC' },
        }),
        this.adminLangService.getDefaultLangId(),
      ]);
    const rawLang = (langId ?? '').toString().trim();
    const showAll =
      rawLang === 'all' || rawLang === '0' || rawLang.toLowerCase() === 'all';
    const filterByLang = rawLang !== '' && !showAll;
    const selectedLangId = filterByLang
      ? parseInt(rawLang, 10)
      : showAll
        ? ''
        : defaultLangId || '';
    let list = allDownloads;
    if (filterByLang) {
      list = list.filter((d) => d.langId === selectedLangId);
    } else if (!showAll && defaultLangId) {
      list = list.filter((d) => d.langId === defaultLangId);
    }
    const catIdRaw = (categoryId ?? '').toString().trim();
    if (catIdRaw) {
      const cid = parseInt(catIdRaw, 10);
      if (Number.isFinite(cid))
        list = list.filter((d) => (d as any).resourceTypeId === cid);
    }
    const sidRaw = (seriesId ?? '').toString().trim();
    if (sidRaw) {
      const sid = parseInt(sidRaw, 10);
      if (Number.isFinite(sid))
        list = list.filter((d) => (d as any).seriesId === sid);
    }
    const total = list.length;
    const totalPages = Math.max(1, Math.ceil(total / pageSizeNum));
    const from = (currentPage - 1) * pageSizeNum;
    const downloadList = list.slice(from, from + pageSizeNum);
    const baseUrl =
      '/admin/downloads' +
      (selectedLangId !== ''
        ? '?langId=' + encodeURIComponent(String(selectedLangId))
        : '?langId=all') +
      (catIdRaw ? '&categoryId=' + encodeURIComponent(catIdRaw) : '') +
      (sidRaw ? '&seriesId=' + encodeURIComponent(sidRaw) : '') +
      '&pageSize=' +
      encodeURIComponent(String(pageSizeNum));
    return (reply as any).view('admin/download-list', {
      title: '资源下载管理',
      activeMenu: 'downloads',
      username: session?.adminUsername || 'admin',
      csrfToken: csrfToken ?? '',
      downloadList,
      categories,
      seriesList,
      langs,
      defaultLangId,
      selectedLangId: selectedLangId === '' ? '' : selectedLangId,
      selectedCategoryId: catIdRaw || '',
      selectedSeriesId: sidRaw || '',
      pagination: {
        currentPage,
        totalPages,
        total,
        pageSize: pageSizeNum,
        baseUrl,
      },
    });
  }

  @Get('downloads/edit')
  @UseGuards(AdminAuthGuard)
  async downloadCreatePage(
    @Res() reply: FastifyReply,
    @Req() req: FastifyRequest,
    @Query('modal') modal?: string,
    @Query('langId') queryLangId?: string,
  ) {
    const session = (req as any).session;
    const csrfToken = await (reply as any).generateCsrf?.();
    const { categories, seriesList, fileTypeList, formLangId, defaultLangId } =
      await this.loadDownloadFormSelectData(null, queryLangId);
    const data = {
      title: '新增资源下载',
      activeMenu: 'downloads',
      username: session?.adminUsername || 'admin',
      csrfToken: csrfToken ?? '',
      download: null,
      categories,
      seriesList,
      fileTypeList,
      formLangId,
      defaultLangId: defaultLangId ?? 0,
    };
    if (modal === '1')
      return (reply as any).view('admin/download-edit-form', data);
    return reply.redirect('/admin/downloads', 302);
  }

  @Get('downloads/edit/:id')
  @UseGuards(AdminAuthGuard)
  async downloadEditPage(
    @Param('id') id: string,
    @Res() reply: FastifyReply,
    @Req() req: FastifyRequest,
    @Query('modal') modal?: string,
  ) {
    const download = await this.downloadRepo.findOne({
      where: {
        id: parseInt(id, 10),
        status: In([Status.Normal, Status.Hidden]),
      },
      relations: ['resourceType', 'series', 'lang', 'downloadFileType'],
    });
    if (!download) return reply.redirect('/admin/downloads', 302);
    const session = (req as any).session;
    const csrfToken = await (reply as any).generateCsrf?.();
    const { categories, seriesList, fileTypeList, formLangId, defaultLangId } =
      await this.loadDownloadFormSelectData(download, undefined);
    const data = {
      title: '编辑资源下载',
      activeMenu: 'downloads',
      username: session?.adminUsername || 'admin',
      csrfToken: csrfToken ?? '',
      download,
      categories,
      seriesList,
      fileTypeList,
      formLangId,
      defaultLangId: defaultLangId ?? 0,
    };
    if (modal === '1')
      return (reply as any).view('admin/download-edit-form', data);
    return reply.redirect('/admin/downloads', 302);
  }

  @Post('downloads/save')
  @UseGuards(AdminAuthGuard, CsrfGuard)
  async downloadSave(
    @Body() body: Record<string, string>,
    @Res() reply: FastifyReply,
  ) {
    const id = body.id ? parseInt(body.id, 10) : 0;
    const fileName = (body.fileName ?? '').trim();
    const resourceTypeId = parseInt(body.resourceTypeId, 10) || 0;
    if (!fileName)
      return reply.redirect(
        id ? `/admin/downloads/edit/${id}` : '/admin/downloads/edit',
        302,
      );
    if (!resourceTypeId)
      return reply.redirect(
        id ? `/admin/downloads/edit/${id}` : '/admin/downloads/edit',
        302,
      );
    const langId = parseInt((body.langId ?? '').toString().trim(), 10) || 0;
    const downloadFileTypeIdRaw = (body.downloadFileTypeId ?? '')
      .toString()
      .trim();
    const downloadFileTypeId =
      downloadFileTypeIdRaw &&
      !Number.isNaN(parseInt(downloadFileTypeIdRaw, 10))
        ? parseInt(downloadFileTypeIdRaw, 10)
        : null;
    const downloadUrl = (body.downloadUrl ?? '').trim() || '';
    const seriesId = body.seriesId ? parseInt(body.seriesId, 10) || null : null;
    const status = body.status === '0' ? Status.Hidden : Status.Normal;
    const categoryRow = await this.downloadCategoryRepo.findOne({
      where: { id: resourceTypeId, status: In([Status.Normal, Status.Hidden]) },
    });
    if (!categoryRow) {
      return reply.redirect(
        id ? `/admin/downloads/edit/${id}` : '/admin/downloads/edit',
        302,
      );
    }
    if (!langId || langId !== categoryRow.langId) {
      return reply.redirect(
        id ? `/admin/downloads/edit/${id}` : '/admin/downloads/edit',
        302,
      );
    }
    if (seriesId != null) {
      const seriesRow = await this.downloadSeriesRepo.findOne({
        where: { id: seriesId, status: In([Status.Normal, Status.Hidden]) },
      });
      if (!seriesRow || seriesRow.langId !== categoryRow.langId) {
        return reply.redirect(
          id ? `/admin/downloads/edit/${id}` : '/admin/downloads/edit',
          302,
        );
      }
    }
    if (downloadFileTypeId != null) {
      const ftRow = await this.downloadFileTypeRepo.findOne({
        where: {
          id: downloadFileTypeId,
          status: In([Status.Normal, Status.Hidden]),
        },
      });
      if (!ftRow || ftRow.langId !== categoryRow.langId) {
        return reply.redirect(
          id ? `/admin/downloads/edit/${id}` : '/admin/downloads/edit',
          302,
        );
      }
    }
    if (id) {
      await this.downloadRepo.update(id, {
        fileName,
        resourceTypeId,
        seriesId,
        langId,
        downloadFileTypeId,
        fileType: null,
        productType: null,
        downloadUrl,
        status,
      } as any);
    } else {
      const created = await this.downloadRepo.save(
        this.downloadRepo.create({
          downloadId: 0,
          fileName,
          resourceTypeId,
          seriesId,
          langId,
          downloadFileTypeId,
          fileType: null,
          productType: null,
          downloadUrl,
          downloadCount: 0,
          status,
        } as any),
      );
      const createdId = Array.isArray(created)
        ? created[0]?.id
        : (created as Download)?.id;
      if (createdId)
        await this.downloadRepo.update(createdId, {
          downloadId: createdId,
        } as any);
    }
    await this.redis.delPattern?.('pengcheng:*');
    return reply.redirect(
      getReturnPath(body.returnUrl, '/admin/downloads'),
      302,
    );
  }

  @Post('downloads/delete/:id')
  @UseGuards(AdminAuthGuard, CsrfGuard)
  async downloadDelete(@Param('id') id: string, @Res() reply: FastifyReply) {
    await this.downloadRepo.delete(parseInt(id, 10));
    await this.redis.delPattern?.('pengcheng:*');
    return reply.redirect('/admin/downloads', 302);
  }

  @Post('downloads/batch-delete')
  @UseGuards(AdminAuthGuard, CsrfGuard)
  async downloadBatchDelete(
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
      await this.downloadRepo.delete({ id: In(ids) });
      await this.redis.delPattern?.('pengcheng:*');
    }
    const referer = (req as any).headers?.referer || '/admin/downloads';
    return reply.redirect(referer, 302);
  }

  @Get('download-file-types')
  @UseGuards(AdminAuthGuard)
  async downloadFileTypePage(
    @Res() reply: FastifyReply,
    @Req() req: FastifyRequest,
    @Query('langId') langId?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    const session = (req as any).session;
    const csrfToken = await (reply as any).generateCsrf?.();
    const pageSizeNum = Math.min(
      100,
      Math.max(5, parseInt(pageSize || '15', 10) || 15),
    );
    const currentPage = Math.max(1, parseInt(page || '1', 10) || 1);
    const [allRows, langs, defaultLangId] = await Promise.all([
      this.downloadFileTypeRepo.find({
        where: { status: In([Status.Normal, Status.Hidden]) },
        relations: ['lang'],
        order: { sort: 'ASC', id: 'ASC' },
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
    const filtered = filterByLang
      ? allRows.filter((r) => r.langId === selectedLangId)
      : showAll
        ? allRows
        : allRows.filter((r) => r.langId === defaultLangId);
    const total = filtered.length;
    const totalPages = Math.max(1, Math.ceil(total / pageSizeNum));
    const from = (currentPage - 1) * pageSizeNum;
    const typeList = filtered.slice(from, from + pageSizeNum);
    const baseUrl =
      '/admin/download-file-types?' +
      (selectedLangId === ''
        ? 'langId=all&'
        : 'langId=' + encodeURIComponent(String(selectedLangId)) + '&') +
      'pageSize=' +
      encodeURIComponent(String(pageSizeNum));
    const defaultLang =
      langs.find((l) => l.code === 'zh') ??
      langs.find((l) => l.isDefault === 1) ??
      langs[0];
    return (reply as any).view('admin/download-file-type-list', {
      title: '产品文件类型',
      activeMenu: 'download-file-type',
      username: session?.adminUsername || 'admin',
      csrfToken: csrfToken ?? '',
      typeList,
      langs,
      defaultLangId,
      selectedLangId: selectedLangId === '' ? '' : selectedLangId,
      addDefaultLangId: defaultLang?.id ?? 0,
      pagination: {
        currentPage,
        totalPages,
        total,
        pageSize: pageSizeNum,
        baseUrl,
      },
    });
  }

  @Get('download-file-type/edit/:id')
  @UseGuards(AdminAuthGuard)
  async downloadFileTypeEditPage(
    @Param('id') id: string,
    @Res() reply: FastifyReply,
    @Req() req: FastifyRequest,
    @Query('modal') modal?: string,
  ) {
    const row = await this.downloadFileTypeRepo.findOne({
      where: {
        id: parseInt(id, 10),
        status: In([Status.Normal, Status.Hidden]),
      },
      relations: ['lang'],
    });
    if (!row) return reply.redirect('/admin/download-file-types', 302);
    const session = (req as any).session;
    const csrfToken = await (reply as any).generateCsrf?.();
    const langs = await this.langRepo.find({
      where: { status: Status.Normal },
      order: { id: 'ASC' },
    });
    const data = {
      title: '编辑产品文件类型',
      activeMenu: 'download-file-type',
      username: session?.adminUsername || 'admin',
      csrfToken: csrfToken ?? '',
      fileTypeRow: row,
      langs,
      defaultLangId: row.langId,
    };
    if (modal === '1')
      return (reply as any).view('admin/download-file-type-edit-form', data);
    return reply.redirect('/admin/download-file-types', 302);
  }

  @Post('download-file-type/save')
  @UseGuards(AdminAuthGuard, CsrfGuard)
  async downloadFileTypeSave(
    @Body() body: Record<string, string>,
    @Res() reply: FastifyReply,
  ) {
    const id = body.id ? parseInt(body.id, 10) : 0;
    const name = (body.name ?? '').trim();
    const langId = parseInt(body.langId, 10) || 0;
    const sort = parseInt(body.sort, 10) || 0;
    const status = body.status === '0' ? Status.Hidden : Status.Normal;
    if (!name) {
      return reply.redirect(
        id
          ? `/admin/download-file-type/edit/${id}`
          : '/admin/download-file-types',
        302,
      );
    }
    if (!langId) {
      return reply.redirect(
        id
          ? `/admin/download-file-type/edit/${id}`
          : '/admin/download-file-types',
        302,
      );
    }
    if (id) {
      await this.downloadFileTypeRepo.update(id, {
        name,
        langId,
        sort,
        status,
      } as any);
    } else {
      const created = await this.downloadFileTypeRepo.save(
        this.downloadFileTypeRepo.create({
          name,
          langId,
          sort,
          status,
          downloadFileTypeId: null,
        } as any),
      );
      const createdId = Array.isArray(created)
        ? created[0]?.id
        : (created as DownloadFileType)?.id;
      if (createdId)
        await this.downloadFileTypeRepo.update(createdId, {
          downloadFileTypeId: createdId,
        } as any);
    }
    await this.redis.delPattern?.('pengcheng:*');
    return reply.redirect(
      getReturnPath(body.returnUrl, '/admin/download-file-types'),
      302,
    );
  }

  @Post('download-file-type/delete/:id')
  @UseGuards(AdminAuthGuard, CsrfGuard)
  async downloadFileTypeDelete(
    @Param('id') id: string,
    @Res() reply: FastifyReply,
    @Req() req: FastifyRequest,
  ) {
    await this.downloadFileTypeRepo.delete(parseInt(id, 10));
    await this.redis.delPattern?.('pengcheng:*');
    const referer =
      (req as any).headers?.referer || '/admin/download-file-types';
    return reply.redirect(referer, 302);
  }

  @Post('download-file-type/batch-delete')
  @UseGuards(AdminAuthGuard, CsrfGuard)
  async downloadFileTypeBatchDelete(
    @Body() body: { ids?: number[] },
    @Res() reply: FastifyReply,
    @Req() req: FastifyRequest,
  ) {
    const ids = Array.isArray(body?.ids)
      ? body.ids
          .map((i) => parseInt(String(i), 10))
          .filter((i) => Number.isFinite(i))
      : [];
    if (ids.length) {
      await this.downloadFileTypeRepo.delete({ id: In(ids) });
      await this.redis.delPattern?.('pengcheng:*');
    }
    const referer =
      (req as any).headers?.referer || '/admin/download-file-types';
    return reply.redirect(referer, 302);
  }

  @Get('download-series')
  @UseGuards(AdminAuthGuard)
  async downloadSeriesPage(
    @Res() reply: FastifyReply,
    @Req() req: FastifyRequest,
    @Query('langId') langId?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    const session = (req as any).session;
    const csrfToken = await (reply as any).generateCsrf?.();
    const pageSizeNum = Math.min(
      100,
      Math.max(5, parseInt(pageSize || '15', 10) || 15),
    );
    const currentPage = Math.max(1, parseInt(page || '1', 10) || 1);
    const [allSeries, langs, defaultLangId] = await Promise.all([
      this.downloadSeriesRepo.find({
        where: { status: In([Status.Normal, Status.Hidden]) },
        relations: ['lang'],
        order: { sort: 'ASC', id: 'ASC' },
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
    const filtered = filterByLang
      ? allSeries.filter((s) => s.langId === selectedLangId)
      : showAll
        ? allSeries
        : allSeries.filter((s) => s.langId === defaultLangId);
    const total = filtered.length;
    const totalPages = Math.max(1, Math.ceil(total / pageSizeNum));
    const from = (currentPage - 1) * pageSizeNum;
    const seriesList = filtered.slice(from, from + pageSizeNum);
    const baseUrl =
      '/admin/download-series?' +
      (selectedLangId === ''
        ? 'langId=all&'
        : 'langId=' + encodeURIComponent(String(selectedLangId)) + '&') +
      'pageSize=' +
      encodeURIComponent(String(pageSizeNum));
    const defaultLang =
      langs.find((l) => l.code === 'zh') ??
      langs.find((l) => l.isDefault === 1) ??
      langs[0];
    return (reply as any).view('admin/download-series-list', {
      title: '产品系列',
      activeMenu: 'downloads',
      username: session?.adminUsername || 'admin',
      csrfToken: csrfToken ?? '',
      seriesList,
      langs,
      defaultLangId,
      selectedLangId: selectedLangId === '' ? '' : selectedLangId,
      addDefaultLangId: defaultLang?.id ?? 0,
      pagination: {
        currentPage,
        totalPages,
        total,
        pageSize: pageSizeNum,
        baseUrl,
      },
    });
  }

  @Get('download-series/edit/:id')
  @UseGuards(AdminAuthGuard)
  async downloadSeriesEditPage(
    @Param('id') id: string,
    @Res() reply: FastifyReply,
    @Req() req: FastifyRequest,
    @Query('modal') modal?: string,
  ) {
    const row = await this.downloadSeriesRepo.findOne({
      where: {
        id: parseInt(id, 10),
        status: In([Status.Normal, Status.Hidden]),
      },
      relations: ['lang'],
    });
    if (!row) return reply.redirect('/admin/download-series', 302);
    const session = (req as any).session;
    const csrfToken = await (reply as any).generateCsrf?.();
    const langs = await this.langRepo.find({
      where: { status: Status.Normal },
      order: { id: 'ASC' },
    });
    const data = {
      title: '编辑产品系列',
      activeMenu: 'downloads',
      username: session?.adminUsername || 'admin',
      csrfToken: csrfToken ?? '',
      series: row,
      langs,
      defaultLangId: row.langId,
    };
    if (modal === '1')
      return (reply as any).view('admin/download-series-edit-form', data);
    return reply.redirect('/admin/download-series', 302);
  }

  @Post('download-series/save')
  @UseGuards(AdminAuthGuard, CsrfGuard)
  async downloadSeriesSave(
    @Body() body: Record<string, string>,
    @Res() reply: FastifyReply,
  ) {
    const id = body.id ? parseInt(body.id, 10) : 0;
    const name = (body.name ?? '').trim();
    const langId = parseInt(body.langId, 10) || 0;
    const sort = parseInt(body.sort, 10) || 0;
    const status = body.status === '0' ? Status.Hidden : Status.Normal;
    if (!name)
      return reply.redirect(
        id ? `/admin/download-series/edit/${id}` : '/admin/download-series',
        302,
      );
    if (!langId)
      return reply.redirect(
        id ? `/admin/download-series/edit/${id}` : '/admin/download-series',
        302,
      );
    if (id) {
      await this.downloadSeriesRepo.update(id, {
        name,
        langId,
        sort,
        status,
      } as any);
    } else {
      const created = await this.downloadSeriesRepo.save(
        this.downloadSeriesRepo.create({
          name,
          langId,
          sort,
          status,
          downloadSeriesId: null,
        } as any),
      );
      const createdId = Array.isArray(created)
        ? created[0]?.id
        : (created as DownloadSeries)?.id;
      if (createdId)
        await this.downloadSeriesRepo.update(createdId, {
          downloadSeriesId: createdId,
        } as any);
    }
    await this.redis.delPattern?.('pengcheng:*');
    return reply.redirect(
      getReturnPath(body.returnUrl, '/admin/download-series'),
      302,
    );
  }

  @Post('download-series/delete/:id')
  @UseGuards(AdminAuthGuard, CsrfGuard)
  async downloadSeriesDelete(
    @Param('id') id: string,
    @Res() reply: FastifyReply,
    @Req() req: FastifyRequest,
  ) {
    await this.downloadSeriesRepo.delete(parseInt(id, 10));
    await this.redis.delPattern?.('pengcheng:*');
    const referer = (req as any).headers?.referer || '/admin/download-series';
    return reply.redirect(referer, 302);
  }

  @Post('download-series/batch-delete')
  @UseGuards(AdminAuthGuard, CsrfGuard)
  async downloadSeriesBatchDelete(
    @Body() body: { ids?: number[] },
    @Res() reply: FastifyReply,
    @Req() req: FastifyRequest,
  ) {
    const ids = Array.isArray(body?.ids)
      ? body.ids
          .map((i) => parseInt(String(i), 10))
          .filter((i) => Number.isFinite(i))
      : [];
    if (ids.length) {
      await this.downloadSeriesRepo.delete({ id: In(ids) });
      await this.redis.delPattern?.('pengcheng:*');
    }
    const referer = (req as any).headers?.referer || '/admin/download-series';
    return reply.redirect(referer, 302);
  }
}
