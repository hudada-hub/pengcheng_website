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
import { Solution } from '../../entities/solution.entity';
import { SolutionCategory } from '../../entities/solution-category.entity';
import { Product } from '../../entities/product.entity';
import { IndustryCase } from '../../entities/industry-case.entity';
import { Lang } from '../../entities/lang.entity';
import { Menu } from '../../entities/menu.entity';
import { Status } from '../../common/entities/base.entity';
import { AdminAuthGuard } from '../../common/guards/admin-auth.guard';
import { CsrfGuard } from '../../common/guards/csrf.guard';
import { RedisService } from '../redis/redis.service';
import { AdminLangService } from './admin-lang.service';
import { getReturnPath } from '../../common/utils/admin-redirect';

@Controller('admin')
export class AdminSolutionController {
  constructor(
    @InjectRepository(Solution)
    private readonly solutionRepo: Repository<Solution>,
    @InjectRepository(SolutionCategory)
    private readonly solutionCategoryRepo: Repository<SolutionCategory>,
    @InjectRepository(Product)
    private readonly productRepo: Repository<Product>,
    @InjectRepository(IndustryCase)
    private readonly industryCaseRepo: Repository<IndustryCase>,
    @InjectRepository(Lang) private readonly langRepo: Repository<Lang>,
    @InjectRepository(Menu) private readonly menuRepo: Repository<Menu>,
    private readonly redis: RedisService,
    private readonly adminLangService: AdminLangService,
  ) {}

  /**
   * solution.category_id 外键指向 solution_category 表主键 id（当前语言下的那一行），
   * 不是 solution_category_id（业务分类号）。保存时兼容：先按行 id 匹配，再按业务 id+语言匹配。
   */
  private async resolveSolutionCategoryRowId(
    langId: number,
    raw: number | null,
  ): Promise<number | null> {
    if (raw == null || raw <= 0 || !langId) return null;
    const byRowId = await this.solutionCategoryRepo.findOne({
      where: { id: raw, langId, status: In([Status.Normal, Status.Hidden]) },
    });
    if (byRowId) return byRowId.id;
    const byBizId = await this.solutionCategoryRepo.findOne({
      where: {
        solutionCategoryId: raw,
        langId,
        status: In([Status.Normal, Status.Hidden]),
      },
    });
    return byBizId?.id ?? null;
  }

  @Get('solutions')
  @UseGuards(AdminAuthGuard)
  async solutionsPage(
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
    const [allSolutions, langs, defaultLangId] = await Promise.all([
      this.solutionRepo.find({
        where: { status: In([Status.Normal, Status.Hidden]) },
        relations: ['lang'],
        order: { sort: 'DESC', id: 'DESC' },
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
      ? allSolutions.filter((s) => s.langId === selectedLangId)
      : showAll
        ? allSolutions
        : allSolutions.filter((s) => s.langId === defaultLangId);
    const total = list.length;
    const totalPages = Math.max(1, Math.ceil(total / pageSizeNum));
    const from = (currentPage - 1) * pageSizeNum;
    const solutionList = list.slice(from, from + pageSizeNum);
    const baseUrl =
      '/admin/solutions' +
      (selectedLangId !== ''
        ? '?langId=' + encodeURIComponent(String(selectedLangId))
        : '?langId=all') +
      '&pageSize=' +
      encodeURIComponent(String(pageSizeNum));
    return (reply as any).view('admin/solution-list', {
      title: '解决方案',
      activeMenu: 'solutions',
      username: session?.adminUsername || 'admin',
      csrfToken: csrfToken ?? '',
      solutionList,
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

  @Get('solutions/edit')
  @UseGuards(AdminAuthGuard)
  async solutionCreatePage(
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
      langs.find((l) => l.code === 'cn') ??
      langs.find((l) => l.code === 'zh') ??
      langs.find((l) => l.isDefault === 1) ??
      langs[0];
    const langId = defaultLang?.id ?? 0;

    const [productsForLang, casesForLang, solutionCategoriesForLang] =
      await Promise.all([
        this.productRepo.find({
          where: { langId, status: In([Status.Normal, Status.Hidden]) },
          order: { id: 'ASC' },
        }),
        this.industryCaseRepo.find({
          where: { langId, status: In([Status.Normal, Status.Hidden]) },
          order: { sort: 'ASC', id: 'ASC' },
        }),
        this.solutionCategoryRepo.find({
          where: { langId, status: In([Status.Normal, Status.Hidden]) },
          order: { sort: 'ASC', id: 'ASC' },
        }),
      ]);

    const data = {
      title: '新增解决方案',
      activeMenu: 'solutions',
      username: session?.adminUsername || 'admin',
      csrfToken: csrfToken ?? '',
      solution: null,
      langs,
      defaultLangId: langId,
      transferProducts: {
        leftItems: productsForLang.map((p) => ({
          id: p.id,
          label: `${p.name}${p.model ? ` (${p.model})` : ''}`,
        })),
        rightItems: [] as { id: number; label: string }[],
        leftTitle: '可选产品',
        rightTitle: '已选产品',
        inputName: 'relatedProductIds',
        value: '',
      },
      transferCases: {
        leftItems: casesForLang.map((c) => ({ id: c.id, label: c.title })),
        rightItems: [] as { id: number; label: string }[],
        leftTitle: '可选应用案例',
        rightTitle: '已选应用案例',
        inputName: 'relatedIndustryCaseIds',
        value: '',
      },
      transferCategories: {
        leftItems: solutionCategoriesForLang.map((c) => ({
          id: c.id,
          label: c.title,
        })),
        rightItems: [] as { id: number; label: string }[],
        leftTitle: '可选解决方案分类',
        rightTitle: '已选解决方案分类',
        inputName: 'categoryId',
        value: '',
      },
      solutionCategoriesForLang,
    };
    if (modal === '1')
      return (reply as any).view('admin/solution-edit-form', data);
    return reply.redirect('/admin/solutions', 302);
  }

  @Get('solutions/edit/:id')
  @UseGuards(AdminAuthGuard)
  async solutionEditPage(
    @Param('id') id: string,
    @Res() reply: FastifyReply,
    @Req() req: FastifyRequest,
    @Query('modal') modal?: string,
  ) {
    const solution = await this.solutionRepo.findOne({
      where: {
        id: parseInt(id, 10),
        status: In([Status.Normal, Status.Hidden]),
      },
      relations: ['lang'],
    });
    if (!solution) return reply.redirect('/admin/solutions', 302);
    const session = (req as any).session;
    const csrfToken = await (reply as any).generateCsrf?.();
    const langs = await this.langRepo.find({
      where: { status: Status.Normal },
      order: { id: 'ASC' },
    });
    const langId = solution.langId;

    const [productsForLang, casesForLang, solutionCategoriesForLang] =
      await Promise.all([
        this.productRepo.find({
          where: { langId, status: In([Status.Normal, Status.Hidden]) },
          order: { id: 'ASC' },
        }),
        this.industryCaseRepo.find({
          where: { langId, status: In([Status.Normal, Status.Hidden]) },
          order: { sort: 'ASC', id: 'ASC' },
        }),
        this.solutionCategoryRepo.find({
          where: { langId, status: In([Status.Normal, Status.Hidden]) },
          order: { sort: 'ASC', id: 'ASC' },
        }),
      ]);

    const selectedProductIds = (solution.relatedProductIds ?? '')
      .split(',')
      .map((s) => parseInt(s.trim(), 10))
      .filter((n) => Number.isFinite(n));
    const selectedCaseIds = (solution.relatedIndustryCaseIds ?? '')
      .split(',')
      .map((s) => parseInt(s.trim(), 10))
      .filter((n) => Number.isFinite(n));
    const selectedCategoryIds = (solution.categoryId ?? '')
      .split(',')
      .map((s) => parseInt(s.trim(), 10))
      .filter((id) => !isNaN(id));

    const transferProducts = {
      leftItems: productsForLang
        .filter((p) => !selectedProductIds.includes(p.id))
        .map((p) => ({
          id: p.id,
          label: `${p.name}${p.model ? ` (${p.model})` : ''}`,
        })),
      rightItems: productsForLang
        .filter((p) => selectedProductIds.includes(p.id))
        .map((p) => ({
          id: p.id,
          label: `${p.name}${p.model ? ` (${p.model})` : ''}`,
        })),
      leftTitle: '可选产品',
      rightTitle: '已选产品',
      inputName: 'relatedProductIds',
      value: selectedProductIds.join(','),
    };
    const transferCases = {
      leftItems: casesForLang
        .filter((c) => !selectedCaseIds.includes(c.id))
        .map((c) => ({ id: c.id, label: c.title })),
      rightItems: casesForLang
        .filter((c) => selectedCaseIds.includes(c.id))
        .map((c) => ({ id: c.id, label: c.title })),
      leftTitle: '可选应用案例',
      rightTitle: '已选应用案例',
      inputName: 'relatedIndustryCaseIds',
      value: selectedCaseIds.join(','),
    };
    const transferCategories = {
      leftItems: solutionCategoriesForLang
        .filter((c) => !selectedCategoryIds.includes(c.id))
        .map((c) => ({ id: c.id, label: c.title })),
      rightItems: solutionCategoriesForLang
        .filter((c) => selectedCategoryIds.includes(c.id))
        .map((c) => ({ id: c.id, label: c.title })),
      leftTitle: '可选解决方案分类',
      rightTitle: '已选解决方案分类',
      inputName: 'categoryId',
      value: selectedCategoryIds.join(','),
    };

    const data = {
      title: '编辑解决方案',
      activeMenu: 'solutions',
      username: session?.adminUsername || 'admin',
      csrfToken: csrfToken ?? '',
      solution,
      langs,
      defaultLangId: langId,
      transferProducts,
      transferCases,
      transferCategories,
      solutionCategoriesForLang,
    };
    if (modal === '1')
      return (reply as any).view('admin/solution-edit-form', data);
    return reply.redirect('/admin/solutions', 302);
  }

  @Post('solutions/save')
  @UseGuards(AdminAuthGuard, CsrfGuard)
  async solutionSave(
    @Body() body: Record<string, unknown>,
    @Res() reply: FastifyReply,
  ) {
    const id = body.id != null ? parseInt(String(body.id), 10) : 0;
    const title = String(body.title ?? '').trim();
    const langId = parseInt(String(body.langId ?? ''), 10) || 0;
    const bannerBgUrl = String(body.bannerBgUrl ?? '').trim() || null;
    const bannerTitle = String(body.bannerTitle ?? '').trim() || null;
    const bannerDesc = String(body.bannerDesc ?? '').trim() || null;
    const kehuBannerUrl = String(body.kehuBannerUrl ?? '').trim() || null;
    const metaTitle = String(body.metaTitle ?? '').trim() || title;
    const metaKeywords = String(body.metaKeywords ?? '').trim() || null;
    const metaDescription = String(body.metaDescription ?? '').trim() || null;
    const status = body.status === '0' ? Status.Hidden : Status.Normal;
    const relatedProductIds =
      typeof body.relatedProductIds === 'string'
        ? body.relatedProductIds.trim() || null
        : null;
    const relatedIndustryCaseIds =
      typeof body.relatedIndustryCaseIds === 'string'
        ? body.relatedIndustryCaseIds.trim() || null
        : null;
    const categoryId =
      typeof body.categoryId === 'string'
        ? body.categoryId.trim() || null
        : null;
    const sort = parseInt(String(body.sort ?? ''), 10) || 0;

    let kehu: Array<{ title: string; content: string }> | null = null;
    if (
      body.kehu != null &&
      typeof body.kehu === 'string' &&
      body.kehu.trim()
    ) {
      try {
        const parsed = JSON.parse(body.kehu) as Array<{
          title?: string;
          content?: string;
        }>;
        if (Array.isArray(parsed)) {
          kehu = parsed
            .map((item) => ({
              title: String(item?.title ?? '').trim(),
              content: String(item?.content ?? '').trim(),
            }))
            .filter((item) => item.title || item.content);
          if (kehu.length === 0) kehu = null;
        }
      } catch {}
    } else if (body.kehu != null && Array.isArray(body.kehu)) {
      kehu = (body.kehu as Array<{ title?: string; content?: string }>)
        .map((item) => ({
          title: String(item?.title ?? '').trim(),
          content: String(item?.content ?? '').trim(),
        }))
        .filter((item) => item.title || item.content);
      if (kehu.length === 0) kehu = null;
    }

    if (!title)
      return reply.redirect(
        id ? `/admin/solutions/edit/${id}` : '/admin/solutions/edit',
        302,
      );
    if (!langId)
      return reply.redirect(
        id ? `/admin/solutions/edit/${id}` : '/admin/solutions/edit',
        302,
      );

    if (id) {
      await this.solutionRepo.update(id, {
        title,
        bannerBgUrl,
        bannerTitle,
        bannerDesc,
        kehuBannerUrl,
        kehu,
        metaTitle: metaTitle || title,
        metaKeywords,
        metaDescription,
        langId,
        status,
        relatedProductIds,
        relatedIndustryCaseIds,
        categoryId,
        sort,
      } as any);
    } else {
      const created = await this.solutionRepo.save(
        this.solutionRepo.create({
          solutionId: 0,
          title,
          bannerBgUrl,
          bannerTitle,
          bannerDesc,
          kehuBannerUrl,
          kehu,
          metaTitle: metaTitle || title,
          metaKeywords,
          metaDescription,
          langId,
          viewCount: 0,
          status,
          relatedProductIds,
          relatedIndustryCaseIds,
          categoryId,
          sort,
        } as any),
      );
      const createdId = Array.isArray(created)
        ? created[0]?.id
        : (created as Solution)?.id;
      if (createdId)
        await this.solutionRepo.update(createdId, {
          solutionId: createdId,
        } as any);
    }
    await this.redis.delPattern?.('pengcheng:*');
    return reply.redirect(
      getReturnPath(String(body.returnUrl ?? ''), '/admin/solutions'),
      302,
    );
  }

  @Post('solutions/delete/:id')
  @UseGuards(AdminAuthGuard, CsrfGuard)
  async solutionDelete(@Param('id') id: string, @Res() reply: FastifyReply) {
    await this.solutionRepo.delete(parseInt(id, 10));
    await this.redis.delPattern?.('pengcheng:*');
    return reply.redirect('/admin/solutions', 302);
  }

  @Post('solutions/batch-delete')
  @UseGuards(AdminAuthGuard, CsrfGuard)
  async solutionBatchDelete(
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
      await this.solutionRepo.delete({ id: In(ids) } as any);
      await this.redis.delPattern?.('pengcheng:*');
    }
    const referer = (req as any).headers?.referer || '/admin/solutions';
    return reply.redirect(referer, 302);
  }

  @Post('solutions/update-sort')
  @UseGuards(AdminAuthGuard, CsrfGuard)
  async solutionUpdateSort(
    @Body() body: { id: number; sort: number },
    @Res() reply: FastifyReply,
  ) {
    const { id, sort } = body;
    if (!id || !Number.isFinite(sort)) {
      return reply.send({ success: false, message: 'Invalid parameters' });
    }
    try {
      await this.solutionRepo.update(id, { sort } as any);
      await this.redis.delPattern?.('pengcheng:*');
      return reply.send({ success: true });
    } catch (error) {
      console.error('Error updating solution sort:', error);
      return reply.send({ success: false, message: 'Failed to update sort' });
    }
  }

  @Get('solution-category')
  @UseGuards(AdminAuthGuard)
  async solutionCategoryPage(
    @Res() reply: FastifyReply,
    @Req() req: FastifyRequest,
    @Query('langId') langId?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    const session = (req as any).session;
    const csrfToken = await (reply as any).generateCsrf?.();
    // 处理 pageSize 可能是数组的情况（当 URL 中出现重复参数时）
    let pageSizeValue = pageSize;
    if (Array.isArray(pageSize)) {
      pageSizeValue = pageSize[pageSize.length - 1]; // 取最后一个值
    }
    const pageSizeNum = Math.min(
      100,
      Math.max(5, parseInt(pageSizeValue || '15', 10) || 15),
    );
    const currentPage = Math.max(1, parseInt(page || '1', 10) || 1);
    const [allCategories, langs, defaultLangId] = await Promise.all([
      this.solutionCategoryRepo.find({
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
      '/admin/solution-category?' +
      (selectedLangId === ''
        ? 'langId=all&'
        : 'langId=' + encodeURIComponent(String(selectedLangId)) + '&') +
      'pageSize=' +
      encodeURIComponent(String(pageSizeNum));
    return (reply as any).view('admin/solution-category-list', {
      title: '解决方案分类',
      activeMenu: 'solution-category',
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

  @Get('solution-category/edit')
  @UseGuards(AdminAuthGuard)
  async solutionCategoryCreatePage(
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
      langs.find((l) => l.code === 'cn') ??
      langs.find((l) => l.code === 'zh') ??
      langs.find((l) => l.isDefault === 1) ??
      langs[0];
    const data = {
      title: '新增解决方案分类',
      activeMenu: 'solution-category',
      username: session?.adminUsername || 'admin',
      csrfToken: csrfToken ?? '',
      category: null,
      langs,
      defaultLangId: defaultLang?.id ?? 0,
    };
    if (modal === '1')
      return (reply as any).view('admin/solution-category-edit-form', data);
    return reply.redirect('/admin/solution-category', 302);
  }

  @Get('solution-category/edit/:id')
  @UseGuards(AdminAuthGuard)
  async solutionCategoryEditPage(
    @Param('id') id: string,
    @Res() reply: FastifyReply,
    @Req() req: FastifyRequest,
    @Query('modal') modal?: string,
  ) {
    const category = await this.solutionCategoryRepo.findOne({
      where: {
        id: parseInt(id, 10),
        status: In([Status.Normal, Status.Hidden]),
      },
      relations: ['lang'],
    });
    if (!category) return reply.redirect('/admin/solution-category', 302);
    const session = (req as any).session;
    const csrfToken = await (reply as any).generateCsrf?.();
    const langs = await this.langRepo.find({
      where: { status: Status.Normal },
      order: { id: 'ASC' },
    });
    const data = {
      title: '编辑解决方案分类',
      activeMenu: 'solution-category',
      username: session?.adminUsername || 'admin',
      csrfToken: csrfToken ?? '',
      category,
      langs,
      defaultLangId: category.langId,
    };
    if (modal === '1')
      return (reply as any).view('admin/solution-category-edit-form', data);
    return reply.redirect('/admin/solution-category', 302);
  }

  @Post('solution-category/save')
  @UseGuards(AdminAuthGuard, CsrfGuard)
  async solutionCategorySave(
    @Body() body: Record<string, string>,
    @Res() reply: FastifyReply,
  ) {
    const id = body.id ? parseInt(body.id, 10) : 0;
    const title = (body.title ?? '').trim();
    const metaTitle = (body.metaTitle ?? '').trim() || title;
    const metaKeywords = (body.metaKeywords ?? '').trim() || null;
    const metaDescription = (body.metaDescription ?? '').trim() || null;
    const langId = parseInt(body.langId, 10) || 0;
    const sort = parseInt(body.sort, 10) || 0;
    const type = parseInt(body.type, 10) || 2;
    const status = body.status === '0' ? Status.Hidden : Status.Normal;
    if (!title)
      return reply.redirect(
        id
          ? `/admin/solution-category/edit/${id}`
          : '/admin/solution-category/edit',
        302,
      );
    if (!langId)
      return reply.redirect(
        id
          ? `/admin/solution-category/edit/${id}`
          : '/admin/solution-category/edit',
        302,
      );
    if (id) {
      await this.solutionCategoryRepo.update(id, {
        title,
        metaTitle: metaTitle || title,
        metaKeywords,
        metaDescription,
        langId,
        sort,
        type,
        status,
      } as any);
    } else {
      const created = await this.solutionCategoryRepo.save(
        this.solutionCategoryRepo.create({
          title,
          metaTitle: metaTitle || title,
          metaKeywords,
          metaDescription,
          langId,
          sort,
          type,
          status,
        } as any),
      );
      const createdId = Array.isArray(created)
        ? created[0]?.id
        : (created as SolutionCategory)?.id;
      if (createdId)
        await this.solutionCategoryRepo.update(createdId, {
          solutionCategoryId: createdId,
        } as any);
    }
    await this.redis.delPattern?.('pengcheng:*');
    return reply.redirect(
      getReturnPath(body.returnUrl, '/admin/solution-category'),
      302,
    );
  }

  @Post('solution-category/delete/:id')
  @UseGuards(AdminAuthGuard, CsrfGuard)
  async solutionCategoryDelete(
    @Param('id') id: string,
    @Res() reply: FastifyReply,
  ) {
    await this.solutionCategoryRepo.delete(parseInt(id, 10));
    await this.redis.delPattern?.('pengcheng:*');
    return reply.redirect('/admin/solution-category', 302);
  }

  @Post('solution-category/batch-delete')
  @UseGuards(AdminAuthGuard, CsrfGuard)
  async solutionCategoryBatchDelete(
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
      await this.solutionCategoryRepo.delete({ id: In(ids) });
      await this.redis.delPattern?.('pengcheng:*');
    }
    const referer = (req as any).headers?.referer || '/admin/solution-category';
    return reply.redirect(referer, 302);
  }
}
