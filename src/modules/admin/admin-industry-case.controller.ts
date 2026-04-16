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
import { IndustryCase } from '../../entities/industry-case.entity';
import { Lang } from '../../entities/lang.entity';
import { Solution } from '../../entities/solution.entity';
import { Product } from '../../entities/product.entity';
import { SolutionCategory } from '../../entities/solution-category.entity';
import { Status } from '../../common/entities/base.entity';
import { AdminAuthGuard } from '../../common/guards/admin-auth.guard';
import { CsrfGuard } from '../../common/guards/csrf.guard';
import { RedisService } from '../redis/redis.service';
import { AdminLangService } from './admin-lang.service';
import { getReturnPath } from '../../common/utils/admin-redirect';

@Controller('admin')
export class AdminIndustryCaseController {
  constructor(
    @InjectRepository(IndustryCase)
    private readonly industryCaseRepo: Repository<IndustryCase>,
    @InjectRepository(Lang) private readonly langRepo: Repository<Lang>,
    @InjectRepository(Solution)
    private readonly solutionRepo: Repository<Solution>,
    @InjectRepository(Product)
    private readonly productRepo: Repository<Product>,
    @InjectRepository(SolutionCategory)
    private readonly solutionCategoryRepo: Repository<SolutionCategory>,
    private readonly redis: RedisService,
    private readonly adminLangService: AdminLangService,
  ) {}

  @Get('industry-cases')
  @UseGuards(AdminAuthGuard)
  async industryCasesPage(
    @Res() reply: FastifyReply,
    @Req() req: FastifyRequest,
    @Query('langId') langId?: string,
    @Query('categoryId') categoryId?: string,
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
    const [allCases, langs, defaultLangId] = await Promise.all([
      this.industryCaseRepo.find({
        where: { status: In([Status.Normal, Status.Hidden]) },
        relations: ['lang'],
        order: { isTop: 'DESC', sort: 'DESC', id: 'DESC' },
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
    
    // 根据当前选择的语言获取分类数据
    let categories: any[] = [];
    if (selectedLangId) {
      categories = await this.solutionCategoryRepo.find({
        where: { type: 1, status: Status.Normal, langId: selectedLangId },
        order: { id: 'ASC' },
      });
    } else {
      // 如果选择了所有语言，获取所有语言的分类
      categories = await this.solutionCategoryRepo.find({
        where: { type: 1, status: Status.Normal },
        order: { id: 'ASC' },
      });
    }

    const categoryRaw = (categoryId ?? '').toString().trim();
    const showAllCategories =
      categoryRaw === 'all' ||
      categoryRaw === '0' ||
      categoryRaw.toLowerCase() === 'all';
    const filterByCategory = categoryRaw !== '' && !showAllCategories;
    const selectedCategoryId = filterByCategory
      ? parseInt(categoryRaw, 10)
      : '';

    let list = filterByLang
      ? allCases.filter((c) => c.langId === selectedLangId)
      : showAll
        ? allCases
        : allCases.filter((c) => c.langId === defaultLangId);

    if (filterByCategory) {
      list = list.filter((c) => {
        const categoryIds = (c.categoryId ?? '')
          .split(',')
          .map((id) => parseInt(id.trim(), 10))
          .filter((id) => Number.isFinite(id));
        return categoryIds.includes(selectedCategoryId as number);
      });
    }

    // 为每个案例添加分类名称
    const categoryMap = new Map(categories.map((c) => [c.id, c.title]));
    const caseListWithCategories = list.map((c) => {
      const categoryIds = (c.categoryId ?? '')
        .split(',')
        .map((id) => parseInt(id.trim(), 10))
        .filter((id) => Number.isFinite(id));
      const categoryNames = categoryIds
        .map((id) => categoryMap.get(id))
        .filter(Boolean);
      return {
        ...c,
        categories: categoryNames,
      };
    });

    const total = caseListWithCategories.length;
    const totalPages = Math.max(1, Math.ceil(total / pageSizeNum));
    const from = (currentPage - 1) * pageSizeNum;
    const caseList = caseListWithCategories.slice(from, from + pageSizeNum);

    const baseUrl =
      '/admin/industry-cases' +
      (selectedLangId !== ''
        ? '?langId=' + encodeURIComponent(String(selectedLangId))
        : '?langId=all') +
      (selectedCategoryId !== ''
        ? '&categoryId=' + encodeURIComponent(String(selectedCategoryId))
        : '') +
      '&pageSize=' +
      encodeURIComponent(String(pageSizeNum));

    return (reply as any).view('admin/industry-case-list', {
      title: '行业应用案例',
      activeMenu: 'industry-cases',
      username: session?.adminUsername || 'admin',
      csrfToken: csrfToken ?? '',
      caseList,
      langs,
      categories,
      defaultLangId,
      selectedLangId: selectedLangId === '' ? '' : selectedLangId,
      selectedCategoryId: selectedCategoryId === '' ? '' : selectedCategoryId,
      pagination: {
        currentPage,
        totalPages,
        total,
        pageSize: pageSizeNum,
        baseUrl,
      },
    });
  }

  @Get('industry-cases/edit')
  @UseGuards(AdminAuthGuard)
  async industryCaseCreatePage(
    @Res() reply: FastifyReply,
    @Req() req: FastifyRequest,
    @Query('modal') modal?: string,
  ) {
    const session = (req as any).session;
    const csrfToken = await (reply as any).generateCsrf?.();
    const [langs, solutions] = await Promise.all([
      this.langRepo.find({
        where: { status: Status.Normal },
        order: { id: 'ASC' },
      }),
      this.solutionRepo.find({
        where: { status: In([Status.Normal, Status.Hidden]) },
        relations: ['lang'],
        order: { id: 'DESC' },
        take: 500,
      }),
    ]);
    const defaultLang = langs.find((l) => l.code === 'zh') ?? langs.find((l) => l.isDefault === 1) ?? langs[0];
    const langId = defaultLang?.id ?? 0;
    const categories = await this.solutionCategoryRepo.find({
      where: { type: 1, status: Status.Normal, langId },
      order: { id: 'ASC' },
    });
    const productsForLang = await this.productRepo.find({
      where: { langId, status: In([Status.Normal, Status.Hidden]) },
      order: { id: 'ASC' },
      take: 800,
    });
    const solutionsForLang = solutions.filter(
      (s) => (s as any).langId === langId,
    );
    const data = {
      title: '新增行业应用案例',
      activeMenu: 'industry-cases',
      username: session?.adminUsername || 'admin',
      csrfToken: csrfToken ?? '',
      industryCase: null,
      tagsStr: '',
      solutionIdsStr: '',
      relatedIndustryCaseIdsStr: '',
      langs,
      categories,
      defaultLangId: langId,
      solutions,
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
      transferSolutions: {
        leftItems: solutionsForLang.map((s) => ({ id: s.id, label: s.title })),
        rightItems: [] as { id: number; label: string }[],
        leftTitle: '可选解决方案',
        rightTitle: '已选解决方案',
        inputName: 'relatedSolutionIds',
        value: '',
      },
    };
    if (modal === '1')
      return (reply as any).view('admin/industry-case-edit-form', data);
    return reply.redirect('/admin/industry-cases', 302);
  }

  @Get('industry-cases/edit/:id')
  @UseGuards(AdminAuthGuard)
  async industryCaseEditPage(
    @Param('id') id: string,
    @Res() reply: FastifyReply,
    @Req() req: FastifyRequest,
    @Query('modal') modal?: string,
  ) {
    const industryCase = await this.industryCaseRepo.findOne({
      where: {
        id: parseInt(id, 10),
        status: In([Status.Normal, Status.Hidden]),
      },
      relations: ['lang'],
    });
    if (!industryCase) return reply.redirect('/admin/industry-cases', 302);
    const session = (req as any).session;
    const csrfToken = await (reply as any).generateCsrf?.();
    const [langs, solutions] = await Promise.all([
      this.langRepo.find({
        where: { status: Status.Normal },
        order: { id: 'ASC' },
      }),
      this.solutionRepo.find({
        where: { status: In([Status.Normal, Status.Hidden]) },
        relations: ['lang'],
        order: { id: 'DESC' },
        take: 500,
      }),
    ]);
    const langId = (industryCase as any).langId;
    const categories = await this.solutionCategoryRepo.find({
      where: { type: 1, status: Status.Normal, langId },
      order: { id: 'ASC' },
    });
    const productsForLang = await this.productRepo.find({
      where: { langId, status: In([Status.Normal, Status.Hidden]) },
      order: { id: 'ASC' },
      take: 800,
    });
    const solutionsForLang = solutions.filter(
      (s) => (s as any).langId === langId,
    );
    const selectedProductIds = ((industryCase as any).relatedProductIds ?? '')
      .toString()
      .split(',')
      .map((s) => parseInt(s.trim(), 10))
      .filter((n) => Number.isFinite(n));
    const selectedSolutionIds = (
      ((industryCase as any).relatedSolutionIds ?? '') ||
      ((industryCase as any).solutionIds || []).join(',')
    )
      .toString()
      .split(',')
      .map((s) => parseInt(s.trim(), 10))
      .filter((n) => Number.isFinite(n));
    const data = {
      title: '编辑行业应用案例',
      activeMenu: 'industry-cases',
      username: session?.adminUsername || 'admin',
      csrfToken: csrfToken ?? '',
      industryCase,
      tagsStr: ((industryCase as any).tags || []).join(', '),
      solutionIdsStr: ((industryCase as any).solutionIds || []).join(','),
      relatedIndustryCaseIdsStr: (
        (industryCase as any).relatedIndustryCaseIds || []
      ).join(','),
      langs,
      categories,
      defaultLangId: langId,
      solutions,
      transferProducts: {
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
      },
      transferSolutions: {
        leftItems: solutionsForLang
          .filter((s) => !selectedSolutionIds.includes(s.id))
          .map((s) => ({ id: s.id, label: s.title })),
        rightItems: solutionsForLang
          .filter((s) => selectedSolutionIds.includes(s.id))
          .map((s) => ({ id: s.id, label: s.title })),
        leftTitle: '可选解决方案',
        rightTitle: '已选解决方案',
        inputName: 'relatedSolutionIds',
        value: selectedSolutionIds.join(','),
      },
    };
    if (modal === '1')
      return (reply as any).view('admin/industry-case-edit-form', data);
    return reply.redirect('/admin/industry-cases', 302);
  }

  @Post('industry-cases/save')
  @UseGuards(AdminAuthGuard, CsrfGuard)
  async industryCaseSave(
    @Body() body: Record<string, unknown>,
    @Res() reply: FastifyReply,
  ) {
    const id = body.id != null ? parseInt(String(body.id), 10) : 0;
    const title = String(body.title ?? '').trim();
    const specLine = String(body.specLine ?? '').trim() || null;
    const content = String(body.content ?? '').trim() || null;
    const langId = parseInt(String(body.langId ?? ''), 10) || 0;
    const sort = parseInt(String(body.sort ?? '0'), 10) || 0;
    const isTop = body.isTop === '1' || body.isTop === 1 ? 1 : 0;
    const thumbnail = String(body.thumbnail ?? '').trim() || null;
    const bannerUrl = String(body.bannerUrl ?? '').trim() || null;
    const metaTitle = String(body.metaTitle ?? '').trim() || title;
    const metaKeywords = String(body.metaKeywords ?? '').trim() || null;
    const metaDescription = String(body.metaDescription ?? '').trim() || null;
    const status = body.status === '0' ? Status.Hidden : Status.Normal;
    const relatedProductIds =
      typeof body.relatedProductIds === 'string'
        ? body.relatedProductIds.trim() || null
        : null;
    const relatedSolutionIds =
      typeof body.relatedSolutionIds === 'string'
        ? body.relatedSolutionIds.trim() || null
        : null;
    const categoryId =
      typeof body.categoryId === 'string'
        ? body.categoryId.trim() || null
        : null;

    let tags: string[] | null = null;
    const tagsStr = (body.tags ?? '').toString().trim();
    if (tagsStr) {
      try {
        const parsed = JSON.parse(tagsStr) as unknown;
        if (Array.isArray(parsed)) {
          tags = parsed.map((t) => String(t ?? '').trim()).filter(Boolean);
          if (tags.length === 0) tags = null;
        }
      } catch {
        const parts = tagsStr
          .split(/[,，]/)
          .map((s) => s.trim())
          .filter(Boolean);
        if (parts.length) tags = parts;
      }
    }

    let solutionIds: number[] | null = null;
    const solutionIdsStr = (
      relatedSolutionIds ?? (body.solutionIds ?? '').toString().trim()
    )
      .toString()
      .trim();
    if (solutionIdsStr) {
      try {
        const parsed = JSON.parse(solutionIdsStr) as unknown;
        if (Array.isArray(parsed)) {
          solutionIds = parsed
            .map((n) => parseInt(String(n), 10))
            .filter(Number.isFinite);
          if (solutionIds.length === 0) solutionIds = null;
        }
      } catch {}
      if (!solutionIds) {
        const parts = solutionIdsStr
          .split(/[,，]/)
          .map((s) => parseInt(s.trim(), 10))
          .filter((n) => Number.isFinite(n));
        if (parts.length) solutionIds = parts;
      }
    }

    let relatedIndustryCaseIds: number[] | null = null;
    const relatedStr = (body.relatedIndustryCaseIds ?? '').toString().trim();
    if (relatedStr) {
      try {
        const parsed = JSON.parse(relatedStr) as unknown;
        if (Array.isArray(parsed)) {
          relatedIndustryCaseIds = parsed
            .map((n) => parseInt(String(n), 10))
            .filter(Number.isFinite);
          if (relatedIndustryCaseIds.length === 0)
            relatedIndustryCaseIds = null;
        }
      } catch {}
    }

    if (!title)
      return reply.redirect(
        id ? `/admin/industry-cases/edit/${id}` : '/admin/industry-cases/edit',
        302,
      );
    if (!langId)
      return reply.redirect(
        id ? `/admin/industry-cases/edit/${id}` : '/admin/industry-cases/edit',
        302,
      );

    if (id) {
      await this.industryCaseRepo.update(id, {
        title,
        specLine,
        content,
        sort,
        isTop,
        thumbnail,
        bannerUrl,
        tags,
        solutionIds,
        relatedProductIds,
        relatedSolutionIds,
        relatedIndustryCaseIds,
        categoryId,
        metaTitle: metaTitle || title,
        metaKeywords,
        metaDescription,
        langId,
        status,
      } as any);
    } else {
      const created = await this.industryCaseRepo.save(
        this.industryCaseRepo.create({
          industryCaseId: 0,
          title,
          specLine,
          content,
          sort,
          isTop,
          thumbnail,
          bannerUrl,
          tags,
          solutionIds,
          relatedProductIds,
          relatedSolutionIds,
          relatedIndustryCaseIds,
          categoryId,
          metaTitle: metaTitle || title,
          metaKeywords,
          metaDescription,
          langId,
          viewCount: 0,
          status,
        } as any),
      );
      const createdId = Array.isArray(created)
        ? created[0]?.id
        : (created as IndustryCase)?.id;
      if (createdId)
        await this.industryCaseRepo.update(createdId, {
          industryCaseId: createdId,
        } as any);
    }
    await this.redis.delPattern?.('pengcheng:*');
    return reply.redirect(
      getReturnPath(
        typeof body.returnUrl === 'string' ? body.returnUrl : undefined,
        '/admin/industry-cases',
      ),
      302,
    );
  }

  @Post('industry-cases/delete/:id')
  @UseGuards(AdminAuthGuard, CsrfGuard)
  async industryCaseDelete(
    @Param('id') id: string,
    @Res() reply: FastifyReply,
  ) {
    await this.industryCaseRepo.delete(parseInt(id, 10));
    await this.redis.delPattern?.('pengcheng:*');
    return reply.redirect('/admin/industry-cases', 302);
  }

  @Post('industry-cases/batch-delete')
  @UseGuards(AdminAuthGuard, CsrfGuard)
  async industryCaseBatchDelete(
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
      await this.industryCaseRepo.delete({ id: In(ids) } as any);
      await this.redis.delPattern?.('pengcheng:*');
    }
    const referer = (req as any).headers?.referer || '/admin/industry-cases';
    return reply.redirect(referer, 302);
  }

  @Post('industry-cases/update-sort')
  @UseGuards(AdminAuthGuard, CsrfGuard)
  async industryCaseUpdateSort(
    @Body() body: { id: number; sort: number },
    @Res() reply: FastifyReply,
  ) {
    const { id, sort } = body;
    if (!id || !Number.isFinite(sort)) {
      return reply.send({ success: false, message: 'Invalid parameters' });
    }
    try {
      await this.industryCaseRepo.update(id, { sort } as any);
      await this.redis.delPattern?.('pengcheng:*');
      return reply.send({ success: true });
    } catch (error) {
      console.error('Error updating industry case sort:', error);
      return reply.send({ success: false, message: 'Failed to update sort' });
    }
  }
}
