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
import { In, Not, Repository } from 'typeorm';
import { Product } from '../../entities/product.entity';
import { ProductCategory } from '../../entities/product-category.entity';
import { ProductParamCategory } from '../../entities/product-param-category.entity';
import { ProductParamValue } from '../../entities/product-param-value.entity';
import { ProductParamValueRel } from '../../entities/product-param-value-rel.entity';
import { Lang } from '../../entities/lang.entity';
import { Status } from '../../common/entities/base.entity';
import { AdminAuthGuard } from '../../common/guards/admin-auth.guard';
import { CsrfGuard } from '../../common/guards/csrf.guard';
import { RedisService } from '../redis/redis.service';
import { AdminLangService } from './admin-lang.service';
import { ProductService } from '../product/product.service';
import { getReturnPath } from '../../common/utils/admin-redirect';

@Controller('admin')
export class AdminProductController {
  constructor(
    @InjectRepository(Product)
    private readonly productRepo: Repository<Product>,
    @InjectRepository(ProductCategory)
    private readonly productCategoryRepo: Repository<ProductCategory>,
    @InjectRepository(ProductParamCategory)
    private readonly productParamCategoryRepo: Repository<ProductParamCategory>,
    @InjectRepository(ProductParamValue)
    private readonly productParamValueRepo: Repository<ProductParamValue>,
    @InjectRepository(ProductParamValueRel)
    private readonly productParamValueRelRepo: Repository<ProductParamValueRel>,
    @InjectRepository(Lang) private readonly langRepo: Repository<Lang>,
    private readonly redis: RedisService,
    private readonly adminLangService: AdminLangService,
    private readonly productService: ProductService,
  ) {}

  @Get('products')
  @UseGuards(AdminAuthGuard)
  async productsPage(
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
    const [allProducts, langs, defaultLangId] = await Promise.all([
      this.productRepo.find({
        where: { status: In([Status.Normal, Status.Hidden]) },
        relations: ['lang', 'category'],
        order: { sort: 'DESC', id: 'DESC' },
      }),
      this.langRepo.find({
        where: { status: Status.Normal },
        order: { id: 'ASC' },
      }),
      this.adminLangService.getDefaultLangId(),
    ]);

    // 处理语言参数
    const raw = (langId ?? '').toString().trim();
    const showAll = raw === 'all' || raw === '0' || raw.toLowerCase() === 'all';
    const filterByLang = raw !== '' && !showAll;
    const selectedLangId = filterByLang
      ? parseInt(raw, 10)
      : showAll
        ? undefined
        : defaultLangId || undefined;

    // 根据语言获取分类树
    const categories =
      await this.productService.getCategoriesTree(selectedLangId);

    let list = filterByLang
      ? allProducts.filter((p) => p.langId === selectedLangId)
      : showAll
        ? allProducts
        : allProducts.filter((p) => p.langId === defaultLangId);
    const catIdRaw = (categoryId ?? '').toString().trim();
    if (catIdRaw) {
      const catId = parseInt(catIdRaw, 10);
      if (Number.isFinite(catId)) {
        // 查找该分类下的所有子分类 ID（包括自身）
        const childCategoryIds = this.getChildCategoryIds(categories, catId);
        if (childCategoryIds.length > 0) {
          // 如果有子分类，筛选出这些子分类下的所有产品
          list = list.filter((p) =>
            childCategoryIds.includes((p as any).categoryId),
          );
        } else {
          // 如果没有子分类，只筛选该分类的产品
          list = list.filter((p) => (p as any).categoryId === catId);
        }
      }
    }
    const total = list.length;
    const totalPages = Math.max(1, Math.ceil(total / pageSizeNum));
    const from = (currentPage - 1) * pageSizeNum;
    const productList = list.slice(from, from + pageSizeNum);
    const baseUrl =
      '/admin/products' +
      (selectedLangId
        ? '?langId=' + encodeURIComponent(String(selectedLangId))
        : '?langId=all') +
      (catIdRaw ? '&categoryId=' + encodeURIComponent(catIdRaw) : '') +
      '&pageSize=' +
      encodeURIComponent(String(pageSizeNum));
    return (reply as any).view('admin/product-list', {
      title: '产品管理',
      activeMenu: 'products',
      username: session?.adminUsername || 'admin',
      csrfToken: csrfToken ?? '',
      productList,
      langs,
      defaultLangId,
      selectedLangId: selectedLangId || '',
      categories,
      selectedCategoryId: catIdRaw || '',
      selectedCategoryIdNum: catIdRaw ? parseInt(catIdRaw, 10) : null,
      pagination: {
        currentPage,
        totalPages,
        total,
        pageSize: pageSizeNum,
        baseUrl,
      },
    });
  }

  @Get('products/edit')
  @UseGuards(AdminAuthGuard)
  async productCreatePage(
    @Res() reply: FastifyReply,
    @Req() req: FastifyRequest,
    @Query('modal') modal?: string,
  ) {
    const session = (req as any).session;
    const csrfToken = await (reply as any).generateCsrf?.();
    const [langs, defaultLang] = await Promise.all([
      this.langRepo.find({
        where: { status: Status.Normal },
        order: { id: 'ASC' },
      }),
      this.adminLangService.getDefaultLangId(),
    ]);
    // 使用 service 层的树形方法，根据默认语言过滤
    const categories = await this.productService.getCategoriesTree(
      defaultLang || undefined,
    );

    // 获取当前语言下的产品列表（用于关联产品选择）
    const productsForLang = await this.productRepo.find({
      where: {
        langId: defaultLang,
        status: In([Status.Normal, Status.Hidden]),
      },
      order: { sort: 'DESC', id: 'DESC' },
    });

    // 参数分类/值（按默认语言）
    const paramLangId = defaultLang || undefined;
    const [paramCategories, paramValues] = await Promise.all([
      this.productParamCategoryRepo.find({
        where: {
          status: In([Status.Normal, Status.Hidden]),
          ...(paramLangId != null ? { langId: paramLangId } : {}),
        },
        relations: ['lang'],
        order: { sort: 'ASC', id: 'ASC' },
      } as any),
      this.productParamValueRepo.find({
        where: {
          status: In([Status.Normal, Status.Hidden]),
          ...(paramLangId != null ? { langId: paramLangId } : {}),
        },
        relations: ['lang', 'category'],
        order: { sort: 'ASC', id: 'ASC' },
      } as any),
    ]);

    const data = {
      title: '新增产品',
      activeMenu: 'products',
      username: session?.adminUsername || 'admin',
      csrfToken: csrfToken ?? '',
      product: null,
      langs,
      categories,
      paramCategories,
      paramValues,
      selectedParamValueIds: [],
      defaultLangId: defaultLang ?? 0,
      transferRelatedProducts: {
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
    };
    if (modal === '1')
      return (reply as any).view('admin/product-edit-form', data);
    return reply.redirect('/admin/products', 302);
  }

  @Get('products/edit/:id')
  @UseGuards(AdminAuthGuard)
  async productEditPage(
    @Param('id') id: string,
    @Res() reply: FastifyReply,
    @Req() req: FastifyRequest,
    @Query('modal') modal?: string,
  ) {
    const product = await this.productRepo.findOne({
      where: {
        id: parseInt(id, 10),
        status: In([Status.Normal, Status.Hidden]),
      },
      relations: ['lang', 'category'],
    });
    if (!product) return reply.redirect('/admin/products', 302);
    const session = (req as any).session;
    const csrfToken = await (reply as any).generateCsrf?.();
    const [langs] = await Promise.all([
      this.langRepo.find({
        where: { status: Status.Normal },
        order: { id: 'ASC' },
      }),
    ]);
    // 使用 service 层的树形方法，根据产品语言过滤
    const categories = await this.productService.getCategoriesTree(
      product.langId,
    );

    // 获取当前语言下的产品列表（用于关联产品选择），排除当前正在编辑的产品
    const productsForLang = await this.productRepo.find({
      where: {
        langId: product.langId,
        status: In([Status.Normal, Status.Hidden]),
        id: Not(product.id),
      },
      order: { sort: 'DESC', id: 'DESC' },
    });

    const [paramCategories, paramValues, rels] = await Promise.all([
      this.productParamCategoryRepo.find({
        where: {
          status: In([Status.Normal, Status.Hidden]),
          langId: product.langId,
        },
        relations: ['lang'],
        order: { sort: 'ASC', id: 'ASC' },
      }),
      this.productParamValueRepo.find({
        where: {
          status: In([Status.Normal, Status.Hidden]),
          langId: product.langId,
        },
        relations: ['lang', 'category'],
        order: { sort: 'ASC', id: 'ASC' },
      }),
      this.productParamValueRelRepo.find({
        where: { productRowId: product.id },
        order: { sort: 'ASC', id: 'ASC' },
      }),
    ]);
    const selectedParamValueIds = rels.map((r) => r.paramValueId);

    // 处理关联产品
    const selectedProductIds = (product.relatedProductIds ?? [])
      .map((id: number) => parseInt(String(id), 10))
      .filter((n: number) => Number.isFinite(n));

    const transferRelatedProducts = {
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

    const data = {
      title: '编辑产品',
      activeMenu: 'products',
      username: session?.adminUsername || 'admin',
      csrfToken: csrfToken ?? '',
      product,
      langs,
      categories,
      paramCategories,
      paramValues,
      selectedParamValueIds,
      defaultLangId: (product as any).langId,
      transferRelatedProducts,
    };
    if (modal === '1')
      return (reply as any).view('admin/product-edit-form', data);
    return reply.redirect('/admin/products', 302);
  }

  @Post('products/save')
  @UseGuards(AdminAuthGuard, CsrfGuard)
  async productSave(
    @Body() body: Record<string, any>,
    @Res() reply: FastifyReply,
  ) {
    // 原逻辑较长，保持不变（复制自原 AdminController）
    const id = body.id ? parseInt(String(body.id), 10) : 0;
    const name = (body.name ?? '').trim();
    const langId = parseInt(String(body.langId), 10) || 0;
    if (!name)
      return reply.redirect(
        id ? `/admin/products/edit/${id}` : '/admin/products/edit',
        302,
      );
    if (!langId)
      return reply.redirect(
        id ? `/admin/products/edit/${id}` : '/admin/products/edit',
        302,
      );
    const categoryId = body.categoryId
      ? parseInt(String(body.categoryId), 10) || null
      : null;
    const thumbUrl = (body.thumbUrl ?? '').trim() || null;
    const detailTitle = (body.detailTitle ?? '').trim() || null;
    const model = (body.model ?? '').trim() || null;
    let summary: string[] | null = null;
    if (body.summary != null) {
      if (Array.isArray(body.summary)) {
        const arr = body.summary
          .map((s: string) => String(s ?? '').trim())
          .filter(Boolean);
        summary = arr.length ? arr : null;
      } else if (typeof body.summary === 'string' && body.summary.trim()) {
        try {
          const parsed = JSON.parse(body.summary) as unknown;
          if (Array.isArray(parsed)) {
            const arr = parsed
              .map((s: unknown) => String(s ?? '').trim())
              .filter(Boolean);
            summary = arr.length ? arr : null;
          }
        } catch {
          summary = null;
        }
      }
    }
    const bannerUrl = (body.bannerUrl ?? '').trim() || null;
    const advantageSummary = (body.advantageSummary ?? '').trim() || null;
    const metaTitle = (body.metaTitle ?? '').trim() || name;
    const metaKeywords = (body.metaKeywords ?? '').trim() || null;
    const metaDescription = (body.metaDescription ?? '').trim() || null;
    const status = body.status === '0' ? Status.Hidden : Status.Normal;
    const sort = parseInt(String(body.sort), 10) || 0;

    // 处理关联产品
    let relatedProductIds: number[] | null = null;
    if (body.relatedProductIds != null) {
      if (
        typeof body.relatedProductIds === 'string' &&
        body.relatedProductIds.trim()
      ) {
        relatedProductIds = body.relatedProductIds
          .split(',')
          .map((s: string) => parseInt(s.trim(), 10))
          .filter((n: number) => Number.isFinite(n));
        if (relatedProductIds.length === 0) relatedProductIds = null;
      } else if (Array.isArray(body.relatedProductIds)) {
        relatedProductIds = body.relatedProductIds
          .map((id: any) => parseInt(String(id), 10))
          .filter((n: number) => Number.isFinite(n));
        if (relatedProductIds.length === 0) relatedProductIds = null;
      }
    }

    let mainPics: string[] | null = null;
    if (body.mainPics != null) {
      if (Array.isArray(body.mainPics))
        mainPics = body.mainPics.filter((s: string) => (s ?? '').trim());
      else if (typeof body.mainPics === 'string' && body.mainPics.trim()) {
        try {
          const parsed = JSON.parse(body.mainPics);
          mainPics = Array.isArray(parsed)
            ? parsed.map((s: unknown) => String(s ?? '').trim()).filter(Boolean)
            : body.mainPics
                .split(',')
                .map((s: string) => s.trim())
                .filter(Boolean);
        } catch {
          mainPics = body.mainPics
            .split(',')
            .map((s: string) => s.trim())
            .filter(Boolean);
        }
      }
    }
    let features: string[] | null = null;
    if (body.features != null) {
      if (Array.isArray(body.features))
        features = body.features.filter((s: string) => (s ?? '').trim());
      else if (typeof body.features === 'string')
        features = body.features.trim() ? JSON.parse(body.features) : null;
    }
    let coreParams: string[] | null = null;
    if (body.coreParams != null) {
      if (Array.isArray(body.coreParams))
        coreParams = body.coreParams.filter((s: string) => (s ?? '').trim());
      else if (typeof body.coreParams === 'string')
        coreParams = body.coreParams.trim()
          ? JSON.parse(body.coreParams)
          : null;
    }
    let paramsJson: { title: string; data: string }[] | null = null;
    if (body.paramsJson != null) {
      try {
        let raw = body.paramsJson;
        if (typeof raw === 'string' && raw.trim())
          raw = JSON.parse(raw) as unknown;
        if (Array.isArray(raw)) {
          paramsJson = raw.map((item: any) => {
            const title = String(item?.title ?? '').trim();
            let data = item?.data;
            if (typeof data !== 'string')
              data = data != null ? JSON.stringify(data) : '';
            return { title, data: String(data).trim() };
          });
        }
      } catch {
        paramsJson = null;
      }
    }
    let paramsTitle: string | null = null;
    if (body.paramsTitle != null) {
      paramsTitle =
        typeof body.paramsTitle === 'string' ? body.paramsTitle.trim() : null;
    }
    let advantages:
      | {
          title: string;
          description: string;
          expandedDescription?: string;
          picUrl?: string;
        }[]
      | null = null;
    if (
      body.advantages != null &&
      typeof body.advantages === 'string' &&
      body.advantages.trim()
    ) {
      try {
        const raw = JSON.parse(body.advantages) as unknown;
        if (Array.isArray(raw)) {
          advantages = raw.map((item: any) => {
            const ex = String(item?.expandedDescription ?? '').trim();
            return {
              title: String(item?.title ?? '').trim(),
              description: String(item?.description ?? '').trim(),
              ...(ex ? { expandedDescription: ex } : {}),
              picUrl: String(item?.picUrl ?? '').trim() || undefined,
            };
          });
        }
      } catch {
        advantages = null;
      }
    }
    let certifications: string[] | null = null;
    if (
      body.certifications != null &&
      typeof body.certifications === 'string' &&
      body.certifications.trim()
    ) {
      try {
        certifications = JSON.parse(body.certifications);
      } catch {
        certifications = null;
      }
    }
    const updatePayload: Partial<Product> = {
      name,
      detailTitle,
      categoryId,
      thumbUrl,
      mainPics,
      model,
      features,
      coreParams,
      summary,
      bannerUrl,
      paramsJson,
      paramsTitle,
      advantageSummary,
      advantages,
      certifications,
      metaTitle: metaTitle || name,
      metaKeywords,
      metaDescription,
      langId,
      status,
      sort,
      relatedProductIds,
    };
    if (id) {
      await this.productRepo.update(id, updatePayload as any);
    } else {
      const created = await this.productRepo.save(
        this.productRepo.create({
          productId: 0,
          name,
          detailTitle,
          categoryId,
          thumbUrl,
          mainPics,
          model,
          features,
          coreParams,
          summary,
          bannerUrl,
          paramsJson,
          paramsTitle,
          advantageSummary,
          advantages,
          certifications,
          metaTitle: metaTitle || name,
          metaKeywords,
          metaDescription,
          langId,
          viewCount: 0,
          status,
          sort,
          relatedProductIds,
        } as any),
      );
      const createdId = Array.isArray(created)
        ? created[0]?.id
        : (created as Product)?.id;
      if (createdId)
        await this.productRepo.update(createdId, { productId: createdId });
      // 新增时把 id 补回变量，方便后续关联写入
      body.id = String(createdId || '');
    }

    // 处理产品参数值关联（按产品行 id）
    const productRowId = id || parseInt(String(body.id || '0'), 10) || 0;
    if (productRowId) {
      let ids: number[] = [];
      const raw = body.paramValueIds;
      if (Array.isArray(raw)) {
        ids = raw
          .map((x: any) => parseInt(String(x), 10))
          .filter((n: number) => Number.isFinite(n) && n > 0);
      } else if (typeof raw === 'string' && raw.trim()) {
        try {
          const parsed = JSON.parse(raw) as unknown;
          if (Array.isArray(parsed)) {
            ids = parsed
              .map((x) => parseInt(String(x), 10))
              .filter((n) => Number.isFinite(n) && n > 0);
          } else {
            ids = raw
              .split(',')
              .map((s: string) => parseInt(s.trim(), 10))
              .filter((n: number) => Number.isFinite(n) && n > 0);
          }
        } catch {
          ids = raw
            .split(',')
            .map((s: string) => parseInt(s.trim(), 10))
            .filter((n: number) => Number.isFinite(n) && n > 0);
        }
      }
      ids = [...new Set(ids)];

      await this.productParamValueRelRepo.delete({ productRowId } as any);
      if (ids.length) {
        const rows = ids.map((paramValueId, idx) =>
          this.productParamValueRelRepo.create({
            productRowId,
            paramValueId,
            sort: idx,
            status: Status.Normal,
          } as any),
        );
        await this.productParamValueRelRepo.save(rows as any);
      }
    }
    await this.redis.delPattern?.('pengcheng:*');
    return reply.redirect(
      getReturnPath(body.returnUrl, '/admin/products'),
      302,
    );
  }

  @Post('products/delete/:id')
  @UseGuards(AdminAuthGuard, CsrfGuard)
  async productDelete(@Param('id') id: string, @Res() reply: FastifyReply) {
    await this.productRepo.delete(parseInt(id, 10));
    await this.redis.delPattern?.('pengcheng:*');
    return reply.redirect('/admin/products', 302);
  }

  @Post('products/batch-delete')
  @UseGuards(AdminAuthGuard, CsrfGuard)
  async productBatchDelete(
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
      await this.productRepo.delete({ id: In(ids) } as any);
      await this.redis.delPattern?.('pengcheng:*');
    }
    const referer = (req as any).headers?.referer || '/admin/products';
    return reply.redirect(referer, 302);
  }

  @Post('products/update-sort')
  @UseGuards(AdminAuthGuard, CsrfGuard)
  async productUpdateSort(
    @Body() body: { id: number; sort: number },
    @Res() reply: FastifyReply,
  ) {
    const { id, sort } = body;
    if (!id || !Number.isFinite(sort)) {
      return reply.send({ success: false, message: 'Invalid parameters' });
    }
    try {
      await this.productRepo.update(id, { sort } as any);
      await this.redis.delPattern?.('pengcheng:*');
      return reply.send({ success: true });
    } catch (error) {
      console.error('Error updating product sort:', error);
      return reply.send({ success: false, message: 'Failed to update sort' });
    }
  }

  /** 分类管理（不放左侧菜单） */
  @Get('product-param-categories')
  @UseGuards(AdminAuthGuard)
  async productParamCategoriesPage(
    @Res() reply: FastifyReply,
    @Req() req: FastifyRequest,
    @Query('langId') langId?: string,
  ) {
    const session = (req as any).session;
    const csrfToken = await (reply as any).generateCsrf?.();
    const [allParams, langs, defaultLangId] = await Promise.all([
      this.productParamCategoryRepo.find({
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
    const params = filterByLang
      ? allParams.filter((p) => p.langId === selectedLangId)
      : showAll
        ? allParams
        : allParams.filter((p) => p.langId === defaultLangId);
    return (reply as any).view('admin/product-param-list', {
      title: '产品参数分类',
      activeMenu: 'product-params',
      username: session?.adminUsername || 'admin',
      csrfToken: csrfToken ?? '',
      params,
      langs,
      defaultLangId,
      selectedLangId: selectedLangId === '' ? '' : selectedLangId,
    });
  }

  @Get('product-param-categories/edit')
  @UseGuards(AdminAuthGuard)
  async productParamCategoryCreatePage(
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
      title: '新增产品参数分类',
      activeMenu: 'product-params',
      username: session?.adminUsername || 'admin',
      csrfToken: csrfToken ?? '',
      param: null,
      langs,
      defaultLangId: defaultLang?.id ?? 0,
    };
    if (modal === '1')
      return (reply as any).view('admin/product-param-edit-form', data);
    return reply.redirect('/admin/product-param-categories', 302);
  }

  @Get('product-param-categories/edit/:id')
  @UseGuards(AdminAuthGuard)
  async productParamCategoryEditPage(
    @Param('id') id: string,
    @Res() reply: FastifyReply,
    @Req() req: FastifyRequest,
    @Query('modal') modal?: string,
  ) {
    const param = await this.productParamCategoryRepo.findOne({
      where: {
        id: parseInt(id, 10),
        status: In([Status.Normal, Status.Hidden]),
      },
      relations: ['lang'],
    });
    if (!param) return reply.redirect('/admin/product-param-categories', 302);
    const session = (req as any).session;
    const csrfToken = await (reply as any).generateCsrf?.();
    const langs = await this.langRepo.find({
      where: { status: Status.Normal },
      order: { id: 'ASC' },
    });
    const data = {
      title: '编辑产品参数分类',
      activeMenu: 'product-params',
      username: session?.adminUsername || 'admin',
      csrfToken: csrfToken ?? '',
      param,
      langs,
      defaultLangId: (param as any).langId,
    };
    if (modal === '1')
      return (reply as any).view('admin/product-param-edit-form', data);
    return reply.redirect('/admin/product-param-categories', 302);
  }

  @Post('product-param-categories/save')
  @UseGuards(AdminAuthGuard, CsrfGuard)
  async productParamCategorySave(
    @Body() body: Record<string, string>,
    @Res() reply: FastifyReply,
  ) {
    const id = body.id ? parseInt(body.id, 10) : 0;
    const title = (body.title ?? '').trim();
    const langId = parseInt(body.langId, 10) || 0;
    const sort = parseInt(body.sort, 10) || 0;
    const status = body.status === '0' ? Status.Hidden : Status.Normal;
    if (!title)
      return reply.redirect(
        id
          ? `/admin/product-param-categories/edit/${id}`
          : '/admin/product-param-categories/edit',
        302,
      );
    if (!langId)
      return reply.redirect(
        id
          ? `/admin/product-param-categories/edit/${id}`
          : '/admin/product-param-categories/edit',
        302,
      );
    if (id) {
      await this.productParamCategoryRepo.update(id, {
        title,
        langId,
        sort,
        status,
      } as any);
    } else {
      const created = await this.productParamCategoryRepo.save(
        this.productParamCategoryRepo.create({
          title,
          langId,
          sort,
          status,
        } as any),
      );
      const createdId = Array.isArray(created)
        ? created[0]?.id
        : (created as ProductParamCategory)?.id;
      if (createdId)
        await this.productParamCategoryRepo.update(createdId, {
          productParamCategoryId: createdId,
        } as any);
    }
    await this.redis.delPattern?.('pengcheng:*');
    return reply.redirect(
      getReturnPath(body.returnUrl, '/admin/product-param-categories'),
      302,
    );
  }

  @Post('product-param-categories/delete/:id')
  @UseGuards(AdminAuthGuard, CsrfGuard)
  async productParamCategoryDelete(
    @Param('id') id: string,
    @Res() reply: FastifyReply,
  ) {
    await this.productParamCategoryRepo.delete(parseInt(id, 10));
    await this.redis.delPattern?.('pengcheng:*');
    return reply.redirect('/admin/product-param-categories', 302);
  }

  @Post('product-param-categories/batch-delete')
  @UseGuards(AdminAuthGuard, CsrfGuard)
  async productParamCategoryBatchDelete(
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
      await this.productParamCategoryRepo.delete({ id: In(ids) } as any);
      await this.redis.delPattern?.('pengcheng:*');
    }
    const referer =
      (req as any).headers?.referer || '/admin/product-param-categories';
    return reply.redirect(referer, 302);
  }

  /** 参数值（左侧菜单入口） */
  @Get('product-params')
  @UseGuards(AdminAuthGuard)
  async productParamValuesPage(
    @Res() reply: FastifyReply,
    @Req() req: FastifyRequest,
    @Query('langId') langId?: string,
    @Query('categoryId') categoryId?: string,
  ) {
    const session = (req as any).session;
    const csrfToken = await (reply as any).generateCsrf?.();
    const [allValues, langs, defaultLangId, allCategories] = await Promise.all([
      this.productParamValueRepo.find({
        where: { status: In([Status.Normal, Status.Hidden]) },
        relations: ['lang', 'category'],
        order: { sort: 'ASC', id: 'ASC' },
      }),
      this.langRepo.find({
        where: { status: Status.Normal },
        order: { id: 'ASC' },
      }),
      this.adminLangService.getDefaultLangId(),
      this.productParamCategoryRepo.find({
        where: { status: In([Status.Normal, Status.Hidden]) },
        relations: ['lang'],
        order: { sort: 'ASC', id: 'ASC' },
      }),
    ]);
    const raw = (langId ?? '').toString().trim();
    const showAll = raw === 'all' || raw === '0' || raw.toLowerCase() === 'all';
    const filterByLang = raw !== '' && !showAll;
    const selectedLangId = filterByLang
      ? parseInt(raw, 10)
      : showAll
        ? ''
        : defaultLangId || '';

    const catRaw = (categoryId ?? '').toString().trim();
    const selectedCategoryId = catRaw ? parseInt(catRaw, 10) : 0;

    let values = filterByLang
      ? allValues.filter((v) => v.langId === selectedLangId)
      : showAll
        ? allValues
        : allValues.filter((v) => v.langId === defaultLangId);
    if (selectedCategoryId)
      values = values.filter((v) => v.categoryId === selectedCategoryId);

    const categories = filterByLang
      ? allCategories.filter((c) => c.langId === selectedLangId)
      : showAll
        ? allCategories
        : allCategories.filter((c) => c.langId === defaultLangId);

    return (reply as any).view('admin/product-param-value-list', {
      title: '产品参数值',
      activeMenu: 'product-params',
      username: session?.adminUsername || 'admin',
      csrfToken: csrfToken ?? '',
      values,
      categories,
      langs,
      defaultLangId,
      selectedLangId: selectedLangId === '' ? '' : selectedLangId,
      selectedCategoryId: selectedCategoryId || '',
    });
  }

  /** 兼容旧地址 */
  @Get('product-param-values')
  @UseGuards(AdminAuthGuard)
  async productParamValuesLegacyRedirect(
    @Res() reply: FastifyReply,
    @Req() _req: FastifyRequest,
  ) {
    return reply.redirect('/admin/product-params', 302);
  }

  @Get('product-param-values/edit')
  @UseGuards(AdminAuthGuard)
  async productParamValueCreatePage(
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
    const categories = await this.productParamCategoryRepo.find({
      where: {
        status: In([Status.Normal, Status.Hidden]),
        langId: defaultLang?.id ?? 0,
      },
      relations: ['lang'],
      order: { sort: 'ASC', id: 'ASC' },
    });
    const data = {
      title: '新增产品参数值',
      activeMenu: 'product-param-values',
      username: session?.adminUsername || 'admin',
      csrfToken: csrfToken ?? '',
      valueRow: null,
      langs,
      categories,
      defaultLangId: defaultLang?.id ?? 0,
    };
    if (modal === '1')
      return (reply as any).view('admin/product-param-value-edit-form', data);
    return reply.redirect('/admin/product-param-values', 302);
  }

  @Get('product-param-values/edit/:id')
  @UseGuards(AdminAuthGuard)
  async productParamValueEditPage(
    @Param('id') id: string,
    @Res() reply: FastifyReply,
    @Req() req: FastifyRequest,
    @Query('modal') modal?: string,
  ) {
    const valueRow = await this.productParamValueRepo.findOne({
      where: {
        id: parseInt(id, 10),
        status: In([Status.Normal, Status.Hidden]),
      },
      relations: ['lang', 'category'],
    });
    if (!valueRow) return reply.redirect('/admin/product-param-values', 302);
    const session = (req as any).session;
    const csrfToken = await (reply as any).generateCsrf?.();
    const langs = await this.langRepo.find({
      where: { status: Status.Normal },
      order: { id: 'ASC' },
    });
    const categories = await this.productParamCategoryRepo.find({
      where: {
        status: In([Status.Normal, Status.Hidden]),
        langId: valueRow.langId,
      },
      relations: ['lang'],
      order: { sort: 'ASC', id: 'ASC' },
    });
    const data = {
      title: '编辑产品参数值',
      activeMenu: 'product-param-values',
      username: session?.adminUsername || 'admin',
      csrfToken: csrfToken ?? '',
      valueRow,
      langs,
      categories,
      defaultLangId: valueRow.langId,
    };
    if (modal === '1')
      return (reply as any).view('admin/product-param-value-edit-form', data);
    return reply.redirect('/admin/product-param-values', 302);
  }

  @Post('product-param-values/save')
  @UseGuards(AdminAuthGuard, CsrfGuard)
  async productParamValueSave(
    @Body() body: Record<string, string>,
    @Res() reply: FastifyReply,
  ) {
    const id = body.id ? parseInt(body.id, 10) : 0;
    const value = (body.value ?? '').trim();
    const categoryId = parseInt(body.categoryId, 10) || 0;
    const langId = parseInt(body.langId, 10) || 0;
    const sort = parseInt(body.sort, 10) || 0;
    const status = body.status === '0' ? Status.Hidden : Status.Normal;
    if (!value)
      return reply.redirect(
        id
          ? `/admin/product-param-values/edit/${id}`
          : '/admin/product-param-values/edit',
        302,
      );
    if (!langId)
      return reply.redirect(
        id
          ? `/admin/product-param-values/edit/${id}`
          : '/admin/product-param-values/edit',
        302,
      );
    if (!categoryId)
      return reply.redirect(
        id
          ? `/admin/product-param-values/edit/${id}`
          : '/admin/product-param-values/edit',
        302,
      );

    if (id) {
      await this.productParamValueRepo.update(id, {
        value,
        categoryId,
        langId,
        sort,
        status,
      } as any);
    } else {
      const created = await this.productParamValueRepo.save(
        this.productParamValueRepo.create({
          value,
          categoryId,
          langId,
          sort,
          status,
        } as any),
      );
      const createdId = Array.isArray(created)
        ? created[0]?.id
        : (created as ProductParamValue)?.id;
      if (createdId)
        await this.productParamValueRepo.update(createdId, {
          productParamValueId: createdId,
        } as any);
    }
    await this.redis.delPattern?.('pengcheng:*');
    return reply.redirect(
      getReturnPath(body.returnUrl, '/admin/product-param-values'),
      302,
    );
  }

  @Post('product-param-values/delete/:id')
  @UseGuards(AdminAuthGuard, CsrfGuard)
  async productParamValueDelete(
    @Param('id') id: string,
    @Res() reply: FastifyReply,
  ) {
    await this.productParamValueRepo.delete(parseInt(id, 10));
    await this.redis.delPattern?.('pengcheng:*');
    return reply.redirect('/admin/product-param-values', 302);
  }

  @Post('product-param-values/batch-delete')
  @UseGuards(AdminAuthGuard, CsrfGuard)
  async productParamValueBatchDelete(
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
      await this.productParamValueRepo.delete({ id: In(ids) } as any);
      await this.redis.delPattern?.('pengcheng:*');
    }
    const referer = (req as any).headers?.referer || '/admin/product-params';
    return reply.redirect(referer, 302);
  }

  /**
   * 递归获取分类及其所有子分类的 ID
   * @param categories 扁平化的分类数组（包含 id, parentId, level 字段）
   * @param parentId 父分类 ID
   */
  private getChildCategoryIds(
    categories: ProductCategory[],
    parentId: number,
  ): number[] {
    const result: number[] = [parentId]; // 包含父分类自身

    // 查找所有直接子分类
    const directChildren = categories.filter((c) => c.parentId === parentId);

    // 递归查找每个子分类的后代
    for (const child of directChildren) {
      const grandchildren = this.getChildCategoryIds(categories, child.id);
      result.push(...grandchildren);
    }

    return result;
  }
}
