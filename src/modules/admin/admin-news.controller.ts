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
import { Lang } from '../../entities/lang.entity';
import { News } from '../../entities/news.entity';
import { NewsCategory } from '../../entities/news-category.entity';
import { RedisService } from '../redis/redis.service';
import { AdminLangService } from './admin-lang.service';
import { getReturnPath } from '../../common/utils/admin-redirect';

/** 供新闻编辑弹窗：下拉与切换语言时筛选（仅 type=1 新闻分类、正常状态） */
type NewsCategoryOptionDto = { id: number; name: string; langId: number };

@Controller('admin')
export class AdminNewsController {
  constructor(
    @InjectRepository(NewsCategory)
    private readonly newsCategoryRepo: Repository<NewsCategory>,
    @InjectRepository(News) private readonly newsRepo: Repository<News>,
    @InjectRepository(Lang) private readonly langRepo: Repository<Lang>,
    private readonly redis: RedisService,
    private readonly adminLangService: AdminLangService,
  ) {}

  private async getNewsCategoryOptionsForForm(): Promise<
    NewsCategoryOptionDto[]
  > {
    const rows = await this.newsCategoryRepo.find({
      where: { status: Status.Normal, type: 1 },
      order: { sort: 'ASC', id: 'ASC' },
    });
    return rows.map((c) => ({ id: c.id, name: c.name, langId: c.langId }));
  }

  @Get('news-category')
  @UseGuards(AdminAuthGuard)
  async newsCategoryPage(
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
      this.newsCategoryRepo.find({
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
      '/admin/news-category?' +
      (selectedLangId === ''
        ? 'langId=all&'
        : 'langId=' + encodeURIComponent(String(selectedLangId)) + '&') +
      'pageSize=' +
      encodeURIComponent(String(pageSizeNum));
    return (reply as any).view('admin/news-category-list', {
      title: '新闻分类',
      activeMenu: 'news-category',
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

  @Get('news-category/edit')
  @UseGuards(AdminAuthGuard)
  async newsCategoryCreatePage(
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
      title: '新增新闻分类',
      activeMenu: 'news-category',
      username: session?.adminUsername || 'admin',
      csrfToken: csrfToken ?? '',
      category: null,
      langs,
      defaultLangId: defaultLang?.id ?? 0,
    };
    if (modal === '1')
      return (reply as any).view('admin/news-category-edit-form', data);
    return reply.redirect('/admin/news-category', 302);
  }

  @Get('news-category/edit/:id')
  @UseGuards(AdminAuthGuard)
  async newsCategoryEditPage(
    @Param('id') id: string,
    @Res() reply: FastifyReply,
    @Req() req: FastifyRequest,
    @Query('modal') modal?: string,
  ) {
    const category = await this.newsCategoryRepo.findOne({
      where: {
        id: parseInt(id, 10),
        status: In([Status.Normal, Status.Hidden]),
      },
      relations: ['lang'],
    });
    if (!category) return reply.redirect('/admin/news-category', 302);
    const session = (req as any).session;
    const csrfToken = await (reply as any).generateCsrf?.();
    const langs = await this.langRepo.find({
      where: { status: Status.Normal },
      order: { id: 'ASC' },
    });
    const data = {
      title: '编辑新闻分类',
      activeMenu: 'news-category',
      username: session?.adminUsername || 'admin',
      csrfToken: csrfToken ?? '',
      category,
      langs,
      defaultLangId: category.langId,
    };
    if (modal === '1')
      return (reply as any).view('admin/news-category-edit-form', data);
    return reply.redirect('/admin/news-category', 302);
  }

  @Post('news-category/save')
  @UseGuards(AdminAuthGuard, CsrfGuard)
  async newsCategorySave(
    @Body() body: Record<string, string>,
    @Res() reply: FastifyReply,
  ) {
    const id = body.id ? parseInt(body.id, 10) : 0;
    const name = (body.name ?? '').trim();
    const metaTitle = (body.metaTitle ?? '').trim() || name;
    const metaKeywords = (body.metaKeywords ?? '').trim() || null;
    const metaDescription = (body.metaDescription ?? '').trim() || null;
    const type = Math.min(2, Math.max(1, parseInt(body.type, 10) || 1));
    const langId = parseInt(body.langId, 10) || 0;
    const sort = parseInt(body.sort, 10) || 0;
    const bannerUrl = (body.bannerUrl ?? '').trim() || null;
    const status = body.status === '0' ? Status.Hidden : Status.Normal;
    if (!name)
      return reply.redirect(
        id ? `/admin/news-category/edit/${id}` : '/admin/news-category/edit',
        302,
      );
    if (!langId)
      return reply.redirect(
        id ? `/admin/news-category/edit/${id}` : '/admin/news-category/edit',
        302,
      );
    if (id) {
      await this.newsCategoryRepo.update(id, {
        name,
        metaTitle: metaTitle || name,
        metaKeywords,
        metaDescription,
        type,
        langId,
        sort,
        bannerUrl,
        status,
      } as any);
    } else {
      const created = await this.newsCategoryRepo.save(
        this.newsCategoryRepo.create({
          name,
          metaTitle: metaTitle || name,
          metaKeywords,
          metaDescription,
          type,
          langId,
          sort,
          bannerUrl,
          status,
        } as any),
      );
      const createdId = Array.isArray(created)
        ? created[0]?.id
        : (created as NewsCategory)?.id;
      if (createdId)
        await this.newsCategoryRepo.update(createdId, {
          newsCategoryId: createdId,
        });
    }
    await this.redis.delPattern?.('pengcheng:*');
    return reply.redirect(
      getReturnPath(body.returnUrl, '/admin/news-category'),
      302,
    );
  }

  @Post('news-category/delete/:id')
  @UseGuards(AdminAuthGuard, CsrfGuard)
  async newsCategoryDelete(
    @Param('id') id: string,
    @Res() reply: FastifyReply,
  ) {
    await this.newsCategoryRepo.delete(parseInt(id, 10));
    await this.redis.delPattern?.('pengcheng:*');
    return reply.redirect('/admin/news-category', 302);
  }

  @Post('news-category/batch-delete')
  @UseGuards(AdminAuthGuard, CsrfGuard)
  async newsCategoryBatchDelete(
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
      await this.newsCategoryRepo.delete({ id: In(ids) });
      await this.redis.delPattern?.('pengcheng:*');
    }
    const referer = (req as any).headers?.referer || '/admin/news-category';
    return reply.redirect(referer, 302);
  }

  @Get('news')
  @UseGuards(AdminAuthGuard)
  async newsPage(
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
    const [allNews, langs, categories, defaultLangId] = await Promise.all([
      this.newsRepo.find({
        where: { status: In([Status.Normal, Status.Hidden]) },
        relations: ['lang', 'category'],
        order: { sort: 'DESC', publishAt: 'DESC', id: 'DESC' },
      }),
      this.langRepo.find({
        where: { status: Status.Normal },
        order: { id: 'ASC' },
      }),
      this.newsCategoryRepo.find({
        where: { status: Status.Normal, type: 1 },
        relations: ['lang'],
        order: { sort: 'ASC', id: 'ASC' },
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
    let list = filterByLang
      ? allNews.filter((n) => n.langId === selectedLangId)
      : showAll
        ? allNews
        : allNews.filter((n) => n.langId === defaultLangId);
    /** 工具栏「新闻分类」仅展示当前所选语言下的分类（语言为「全部」时展示全部分类） */
    const categoriesForToolbar =
      selectedLangId === ''
        ? categories
        : categories.filter((c) => c.langId === selectedLangId);
    const catIdRaw = (categoryId ?? '').toString().trim();
    let effectiveCatIdRaw = catIdRaw;
    if (effectiveCatIdRaw && selectedLangId !== '') {
      const catIdNum = parseInt(effectiveCatIdRaw, 10);
      if (
        !Number.isFinite(catIdNum) ||
        !categoriesForToolbar.some((c) => c.id === catIdNum)
      ) {
        effectiveCatIdRaw = '';
      }
    }
    if (effectiveCatIdRaw) {
      const catId = parseInt(effectiveCatIdRaw, 10);
      if (Number.isFinite(catId))
        list = list.filter((n) => n.categoryId === catId);
    }
    const total = list.length;
    const totalPages = Math.max(1, Math.ceil(total / pageSizeNum));
    const from = (currentPage - 1) * pageSizeNum;
    const newsList = list.slice(from, from + pageSizeNum).map((n) => ({
      ...n,
      publishAtFormatted:
        n.publishAt != null
          ? new Date(n.publishAt).toISOString().slice(0, 19).replace('T', ' ')
          : '-',
    }));
    const baseUrl =
      '/admin/news' +
      (selectedLangId !== ''
        ? '?langId=' + encodeURIComponent(selectedLangId)
        : '?langId=all') +
      (effectiveCatIdRaw
        ? '&categoryId=' + encodeURIComponent(effectiveCatIdRaw)
        : '') +
      '&pageSize=' +
      encodeURIComponent(String(pageSizeNum));
    return (reply as any).view('admin/news-list', {
      title: '新闻管理',
      activeMenu: 'news',
      username: session?.adminUsername || 'admin',
      csrfToken: csrfToken ?? '',
      newsList,
      langs,
      defaultLangId,
      selectedLangId: selectedLangId === '' ? '' : selectedLangId,
      categories: categoriesForToolbar,
      selectedCategoryId: effectiveCatIdRaw || '',
      selectedCategoryIdNum: effectiveCatIdRaw
        ? parseInt(effectiveCatIdRaw, 10)
        : null,
      pagination: {
        currentPage: currentPage,
        totalPages,
        total,
        pageSize: pageSizeNum,
        baseUrl,
      },
    });
  }

  @Get('news/edit')
  @UseGuards(AdminAuthGuard)
  async newsCreatePage(
    @Res() reply: FastifyReply,
    @Req() req: FastifyRequest,
    @Query('modal') modal?: string,
    @Query('langId') prefLangId?: string,
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
    const pref = parseInt((prefLangId ?? '').toString().trim(), 10);
    const defaultLangId =
      Number.isFinite(pref) && langs.some((l) => l.id === pref)
        ? pref
        : (defaultLang?.id ?? 0);
    const categoryOpts = await this.getNewsCategoryOptionsForForm();
    const newsCategoryOptionsJson = JSON.stringify(categoryOpts).replace(
      /</g,
      '\\u003c',
    );
    const data = {
      title: '新增新闻',
      activeMenu: 'news',
      username: session?.adminUsername || 'admin',
      csrfToken: csrfToken ?? '',
      news: null,
      langs,
      defaultLangId,
      newsCategoryOptionsJson,
      selectedCategoryId: null as number | null,
    };
    if (modal === '1') return (reply as any).view('admin/news-edit-form', data);
    return reply.redirect('/admin/news', 302);
  }

  @Get('news/edit/:id')
  @UseGuards(AdminAuthGuard)
  async newsEditPage(
    @Param('id') id: string,
    @Res() reply: FastifyReply,
    @Req() req: FastifyRequest,
    @Query('modal') modal?: string,
  ) {
    const news = await this.newsRepo.findOne({
      where: {
        id: parseInt(id, 10),
        status: In([Status.Normal, Status.Hidden]),
      },
      relations: ['lang'],
    });
    if (!news) return reply.redirect('/admin/news', 302);
    const session = (req as any).session;
    const csrfToken = await (reply as any).generateCsrf?.();
    const langs = await this.langRepo.find({
      where: { status: Status.Normal },
      order: { id: 'ASC' },
    });
    const publishAtFormatted =
      news.publishAt instanceof Date
        ? news.publishAt.toISOString().slice(0, 16)
        : news.publishAt
          ? new Date(news.publishAt).toISOString().slice(0, 16)
          : '';
    const categoryOpts = await this.getNewsCategoryOptionsForForm();
    const newsCategoryOptionsJson = JSON.stringify(categoryOpts).replace(
      /</g,
      '\\u003c',
    );
    const data = {
      title: '编辑新闻',
      activeMenu: 'news',
      username: session?.adminUsername || 'admin',
      csrfToken: csrfToken ?? '',
      news,
      langs,
      defaultLangId: news.langId,
      publishAtFormatted,
      newsCategoryOptionsJson,
      selectedCategoryId: news.categoryId,
    };
    if (modal === '1') return (reply as any).view('admin/news-edit-form', data);
    return reply.redirect('/admin/news', 302);
  }

  @Post('news/save')
  @UseGuards(AdminAuthGuard, CsrfGuard)
  async newsSave(
    @Body() body: Record<string, string>,
    @Res() reply: FastifyReply,
  ) {
    const id = body.id ? parseInt(body.id, 10) : 0;
    const title = (body.title ?? '').trim();
    const content = (body.content ?? '').trim() || null;
    const summary = (body.summary ?? '').trim() || null;
    const metaTitle = (body.metaTitle ?? '').trim() || title;
    const metaKeywords = (body.metaKeywords ?? '').trim() || null;
    const metaDescription = (body.metaDescription ?? '').trim() || null;
    const langId = parseInt(body.langId, 10) || 0;
    const categoryIdNum = parseInt(
      (body.categoryId ?? '').toString().trim(),
      10,
    );
    const thumbUrl = (body.thumbUrl ?? '').trim() || null;
    const status = body.status === '0' ? Status.Hidden : Status.Normal;
    const isTop = body.isTop === '1' ? 1 : 0;
    const sort = parseInt(body.sort, 10) || 0;
    if (!title)
      return reply.redirect(
        id ? `/admin/news/edit/${id}` : '/admin/news/edit',
        302,
      );
    if (!langId)
      return reply.redirect(
        id ? `/admin/news/edit/${id}` : '/admin/news/edit',
        302,
      );
    if (!Number.isFinite(categoryIdNum) || categoryIdNum <= 0) {
      return reply.redirect(
        id ? `/admin/news/edit/${id}` : '/admin/news/edit',
        302,
      );
    }
    const categoryOk = await this.newsCategoryRepo.findOne({
      where: { id: categoryIdNum, langId, status: Status.Normal, type: 1 },
    });
    if (!categoryOk) {
      return reply.redirect(
        id ? `/admin/news/edit/${id}` : '/admin/news/edit',
        302,
      );
    }
    if (id) {
      await this.newsRepo.update(id, {
        title,
        content,
        summary,
        metaTitle: metaTitle || title,
        metaKeywords,
        metaDescription,
        langId,
        categoryId: categoryIdNum,
        thumbUrl,
        status,
        isTop,
        sort,
      } as any);
    } else {
      const created = await this.newsRepo.save(
        this.newsRepo.create({
          newsId: 0,
          title,
          content,
          summary,
          metaTitle: metaTitle || title,
          metaKeywords,
          metaDescription,
          langId,
          categoryId: categoryIdNum,
          thumbUrl,
          publishAt: new Date(),
          viewCount: 0,
          status,
          isTop,
          sort,
        } as any),
      );
      const createdId = Array.isArray(created)
        ? created[0]?.id
        : (created as News)?.id;
      if (createdId)
        await this.newsRepo.update(createdId, { newsId: createdId });
    }
    await this.redis.delPattern?.('pengcheng:*');
    return reply.redirect(getReturnPath(body.returnUrl, '/admin/news'), 302);
  }

  @Post('news/toggle-top/:id')
  @UseGuards(AdminAuthGuard, CsrfGuard)
  async newsToggleTop(
    @Param('id') id: string,
    @Req() req: FastifyRequest,
    @Res() reply: FastifyReply,
  ) {
    const newsId = parseInt(id, 10);
    const news = await this.newsRepo.findOne({ where: { id: newsId } });
    if (!news) return reply.redirect('/admin/news', 302);
    const newIsTop = news.isTop === 1 ? 0 : 1;
    await this.newsRepo.update(newsId, { isTop: newIsTop } as any);
    await this.redis.delPattern?.('pengcheng:*');
    const referer = (req as any).headers?.referer || '/admin/news';
    return reply.redirect(referer, 302);
  }

  @Post('news/delete/:id')
  @UseGuards(AdminAuthGuard, CsrfGuard)
  async newsDelete(@Param('id') id: string, @Res() reply: FastifyReply) {
    await this.newsRepo.delete(parseInt(id, 10));
    await this.redis.delPattern?.('pengcheng:*');
    return reply.redirect('/admin/news', 302);
  }

  @Post('news/batch-delete')
  @UseGuards(AdminAuthGuard, CsrfGuard)
  async newsBatchDelete(
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
      await this.newsRepo.delete({ id: In(ids) });
      await this.redis.delPattern?.('pengcheng:*');
    }
    const referer = (req as any).headers?.referer || '/admin/news';
    return reply.redirect(referer, 302);
  }

  @Post('news/update-sort')
  @UseGuards(AdminAuthGuard, CsrfGuard)
  async newsUpdateSort(
    @Body() body: { id: number; sort: number },
    @Res() reply: FastifyReply,
  ) {
    const { id, sort } = body;
    if (!id || !Number.isFinite(sort)) {
      return reply.send({ success: false, message: 'Invalid parameters' });
    }
    try {
      await this.newsRepo.update(id, { sort } as any);
      await this.redis.delPattern?.('pengcheng:*');
      return reply.send({ success: true });
    } catch (error) {
      console.error('Error updating news sort:', error);
      return reply.send({ success: false, message: 'Failed to update sort' });
    }
  }
}
