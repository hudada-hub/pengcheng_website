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
import { ProductCategory } from '../../entities/product-category.entity';
import { Lang } from '../../entities/lang.entity';
import { Status } from '../../common/entities/base.entity';
import { AdminAuthGuard } from '../../common/guards/admin-auth.guard';
import { CsrfGuard } from '../../common/guards/csrf.guard';
import { RedisService } from '../redis/redis.service';
import { AdminLangService } from './admin-lang.service';
import { buildAdminFlatTree } from '../../common/utils/admin-tree';
import { getReturnPath } from '../../common/utils/admin-redirect';

@Controller('admin')
export class AdminProductCategoryController {
  constructor(
    @InjectRepository(ProductCategory)
    private readonly productCategoryRepo: Repository<ProductCategory>,
    @InjectRepository(Lang) private readonly langRepo: Repository<Lang>,
    private readonly redis: RedisService,
    private readonly adminLangService: AdminLangService,
  ) {}

  @Get('product-category')
  @UseGuards(AdminAuthGuard)
  async productCategoryPage(
    @Res() reply: FastifyReply,
    @Req() req: FastifyRequest,
    @Query('langId') langId?: string,
  ) {
    const session = (req as any).session;
    const csrfToken = await (reply as any).generateCsrf?.();
    const [allCategories, langs, defaultLangId] = await Promise.all([
      this.productCategoryRepo.find({
        where: { status: In([Status.Normal, Status.Hidden]) },
        relations: ['lang'],
        // parentId + sort 保证树顺序稳定（类似菜单）
        order: { parentId: 'ASC' as any, sort: 'ASC', id: 'ASC' },
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
    const matchLangId =
      (c: { langId: number | string }) => (id: number | string) =>
        Number(c.langId) === Number(id);
    const categoriesRaw = filterByLang
      ? allCategories.filter((c) => matchLangId(c)(selectedLangId))
      : showAll
        ? allCategories
        : allCategories.filter((c) => matchLangId(c)(defaultLangId));

    // 产品分类需要层级 UI（最多三级），此处将列表构造成扁平树用于表格渲染
    // “全部语言”视图下 parentId 无法跨语言保证一致性，保持平铺
    const categories = showAll
      ? categoriesRaw
      : buildAdminFlatTree(
          (categoriesRaw as any[]).map((c) => ({
            ...c,
            parentId: c.parentId ?? 0,
          })),
          0,
          0,
        );

    return (reply as any).view('admin/product-category-list', {
      title: '产品分类',
      activeMenu: 'product-category',
      username: session?.adminUsername || 'admin',
      csrfToken: csrfToken ?? '',
      categories,
      langs,
      defaultLangId,
      selectedLangId: selectedLangId === '' ? '' : selectedLangId,
    });
  }

  @Get('product-category/edit')
  @UseGuards(AdminAuthGuard)
  async productCategoryCreatePage(
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
      this.productCategoryRepo.find({
        where: { status: In([Status.Normal, Status.Hidden]) },
        order: { parentId: 'ASC' as any, sort: 'ASC', id: 'ASC' },
      }),
    ]);
    const defaultLang =
      langs.find((l) => l.code === 'zh') ??
      langs.find((l) => l.isDefault === 1) ??
      langs[0];
    // 构建带层级的分类树
    const categoryTree = buildAdminFlatTree(allCategories as any, 0, 0);
    const data = {
      title: '新增产品分类',
      activeMenu: 'product-category',
      username: session?.adminUsername || 'admin',
      csrfToken: csrfToken ?? '',
      category: null,
      langs,
      defaultLangId: defaultLang?.id ?? 0,
      categories: allCategories,
      categoryTree,
    };
    if (modal === '1')
      return (reply as any).view('admin/product-category-edit-form', data);
    return reply.redirect('/admin/product-category', 302);
  }

  @Get('product-category/edit/:id')
  @UseGuards(AdminAuthGuard)
  async productCategoryEditPage(
    @Param('id') id: string,
    @Res() reply: FastifyReply,
    @Req() req: FastifyRequest,
    @Query('modal') modal?: string,
  ) {
    const category = await this.productCategoryRepo.findOne({
      where: {
        id: parseInt(id, 10),
        status: In([Status.Normal, Status.Hidden]),
      },
      relations: ['lang'],
    });
    if (!category) return reply.redirect('/admin/product-category', 302);
    const session = (req as any).session;
    const csrfToken = await (reply as any).generateCsrf?.();
    const [langs, allCategories] = await Promise.all([
      this.langRepo.find({
        where: { status: Status.Normal },
        order: { id: 'ASC' },
      }),
      this.productCategoryRepo.find({
        where: { status: In([Status.Normal, Status.Hidden]) },
        order: { parentId: 'ASC' as any, sort: 'ASC', id: 'ASC' },
      }),
    ]);
    const categories = allCategories.filter(
      (c) => c.langId === category.langId && c.id !== category.id,
    );
    // 构建带层级的分类树（过滤掉当前分类及其子分类，避免循环引用）
    const categoryTree = buildAdminFlatTree(categories as any, 0, 0);
    const data = {
      title: '编辑产品分类',
      activeMenu: 'product-category',
      username: session?.adminUsername || 'admin',
      csrfToken: csrfToken ?? '',
      category,
      langs,
      defaultLangId: category.langId,
      categories,
      categoryTree,
    };
    if (modal === '1')
      return (reply as any).view('admin/product-category-edit-form', data);
    return reply.redirect('/admin/product-category', 302);
  }

  @Post('product-category/save')
  @UseGuards(AdminAuthGuard, CsrfGuard)
  async productCategorySave(
    @Body() body: Record<string, string>,
    @Res() reply: FastifyReply,
  ) {
    const id = body.id ? parseInt(body.id, 10) : 0;
    const name = (body.name ?? '').trim();
    const metaTitle = (body.metaTitle ?? '').trim() || name;
    const metaKeywords = (body.metaKeywords ?? '').trim() || null;
    const metaDescription = (body.metaDescription ?? '').trim() || null;
    const langId = parseInt(body.langId, 10) || 0;
    const parentId = parseInt(body.parentId, 10) || 0;
    const sort = parseInt(body.sort, 10) || 0;
    const bannerUrl = (body.bannerUrl ?? '').trim() || null;
    const menuPicUrl = (body.menuPicUrl ?? '').trim() || null;
    const status = body.status === '0' ? Status.Hidden : Status.Normal;
    if (!name)
      return reply.redirect(
        id
          ? `/admin/product-category/edit/${id}`
          : '/admin/product-category/edit',
        302,
      );
    if (!langId)
      return reply.redirect(
        id
          ? `/admin/product-category/edit/${id}`
          : '/admin/product-category/edit',
        302,
      );
    if (id) {
      await this.productCategoryRepo.update(id, {
        name,
        metaTitle: metaTitle || name,
        metaKeywords,
        metaDescription,
        langId,
        parentId,
        sort,
        bannerUrl,
        menuPicUrl,
        status,
      } as any);
    } else {
      const created = await this.productCategoryRepo.save(
        this.productCategoryRepo.create({
          name,
          metaTitle: metaTitle || name,
          metaKeywords,
          metaDescription,
          langId,
          parentId,
          sort,
          bannerUrl,
          menuPicUrl,
          status,
          categoryId: null,
        } as any),
      );
      const createdId = Array.isArray(created)
        ? created[0]?.id
        : (created as ProductCategory)?.id;
      if (createdId)
        await this.productCategoryRepo.update(createdId, {
          categoryId: createdId,
        } as any);
    }
    await this.redis.delPattern?.('pengcheng:*');
    return reply.redirect(
      getReturnPath(body.returnUrl, '/admin/product-category'),
      302,
    );
  }

  @Post('product-category/delete/:id')
  @UseGuards(AdminAuthGuard, CsrfGuard)
  async productCategoryDelete(
    @Param('id') id: string,
    @Res() reply: FastifyReply,
  ) {
    await this.productCategoryRepo.delete(parseInt(id, 10));
    await this.redis.delPattern?.('pengcheng:*');
    return reply.redirect('/admin/product-category', 302);
  }

  @Post('product-category/delete-batch')
  @UseGuards(AdminAuthGuard, CsrfGuard)
  async productCategoryDeleteBatch(
    @Body() body: Record<string, string>,
    @Res() reply: FastifyReply,
  ) {
    const raw = (body.ids ?? '').toString().trim();
    const ids = raw
      .split(',')
      .map((s) => parseInt(s.trim(), 10))
      .filter((n) => Number.isFinite(n) && n > 0);
    if (ids.length) {
      await this.productCategoryRepo.delete({ id: In(ids) } as any);
      await this.redis.delPattern?.('pengcheng:*');
    }
    return reply.redirect('/admin/product-category', 302);
  }
}
