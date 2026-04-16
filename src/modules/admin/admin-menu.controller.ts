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
import { Menu } from '../../entities/menu.entity';
import { Lang } from '../../entities/lang.entity';
import { Status } from '../../common/entities/base.entity';
import { AdminAuthGuard } from '../../common/guards/admin-auth.guard';
import { CsrfGuard } from '../../common/guards/csrf.guard';
import { RedisService } from '../redis/redis.service';
import { AdminLangService } from './admin-lang.service';
import { buildAdminFlatTree } from '../../common/utils/admin-tree';
import { getReturnPath } from '../../common/utils/admin-redirect';

@Controller('admin')
export class AdminMenuController {
  constructor(
    @InjectRepository(Menu) private readonly menuRepo: Repository<Menu>,
    @InjectRepository(Lang) private readonly langRepo: Repository<Lang>,
    private readonly redis: RedisService,
    private readonly adminLangService: AdminLangService,
  ) {}

  @Get('menu')
  @UseGuards(AdminAuthGuard)
  async menuPage(
    @Res() reply: FastifyReply,
    @Req() req: FastifyRequest,
    @Query('langId') langId?: string,
  ) {
    const session = (req as any).session;
    const csrfToken = await (reply as any).generateCsrf?.();
    const [allMenus, langs, defaultLangId] = await Promise.all([
      this.menuRepo.find({
        where: { status: In([Status.Normal, Status.Hidden]) },
        relations: ['lang'],
        order: { parentId: 'ASC', sortOrder: 'ASC', id: 'ASC' },
      }),
      this.langRepo.find({
        where: { status: Status.Normal },
        order: { id: 'ASC' },
      }),
      this.adminLangService.getDefaultLangId(),
    ]);
    const raw = (langId ?? '').toString().trim();
    const filterByLang =
      raw !== '' && raw !== '0' && raw.toLowerCase() !== 'all';
    const selectedLangId = filterByLang
      ? parseInt(raw, 10)
      : defaultLangId || '';
    const menus = filterByLang
      ? allMenus.filter((m) => m.langId === selectedLangId)
      : defaultLangId
        ? allMenus.filter((m) => m.langId === defaultLangId)
        : allMenus;
    const menuTree = buildAdminFlatTree(menus as any, 0, 0).map((item) => ({
      item,
      level: item.depth,
    }));
    return (reply as any).view('admin/menu-list', {
      title: '导航菜单',
      activeMenu: 'menu',
      username: session?.adminUsername || 'admin',
      csrfToken: csrfToken ?? '',
      menus,
      menuTree,
      langs,
      defaultLangId,
      selectedLangId: selectedLangId === '' ? '' : selectedLangId,
    });
  }

  @Get('menu/edit')
  @UseGuards(AdminAuthGuard)
  async menuEditPage(
    @Res() reply: FastifyReply,
    @Req() req: FastifyRequest,
    @Query('modal') modal?: string,
  ) {
    const session = (req as any).session;
    const csrfToken = await (reply as any).generateCsrf?.();
    const [langs, allMenus] = await Promise.all([
      this.langRepo.find({
        where: { status: Status.Normal },
        order: { id: 'ASC' },
      }),
      this.menuRepo.find({
        where: { status: In([Status.Normal, Status.Hidden]) },
        order: { parentId: 'ASC', sortOrder: 'ASC', id: 'ASC' },
      }),
    ]);
    const defaultLang =
      langs.find((l) => l.code === 'zh') ??
      langs.find((l) => l.isDefault === 1) ??
      langs[0];
    const defaultLangId = defaultLang?.id ?? 0;
    // 构建带层级的菜单树
    const menuTree = buildAdminFlatTree(allMenus as any, 0, 0);
    const data = {
      title: '新增菜单',
      activeMenu: 'menu',
      username: session?.adminUsername || 'admin',
      csrfToken: csrfToken ?? '',
      menu: null,
      langs,
      menus: allMenus,
      menuTree,
      defaultLangId,
    };
    if (modal === '1') return (reply as any).view('admin/menu-edit-form', data);
    return reply.redirect('/admin/menu', 302);
  }

  @Get('menu/edit/:id')
  @UseGuards(AdminAuthGuard)
  async menuEditIdPage(
    @Param('id') id: string,
    @Res() reply: FastifyReply,
    @Req() req: FastifyRequest,
    @Query('modal') modal?: string,
  ) {
    const menu = await this.menuRepo.findOne({
      where: { id: parseInt(id, 10) },
      relations: ['lang'],
    });
    if (!menu) return reply.redirect('/admin/menu', 302);
    const session = (req as any).session;
    const csrfToken = await (reply as any).generateCsrf?.();
    const [langs, allMenus] = await Promise.all([
      this.langRepo.find({
        where: { status: Status.Normal },
        order: { id: 'ASC' },
      }),
      this.menuRepo.find({
        where: { status: In([Status.Normal, Status.Hidden]) },
        order: { parentId: 'ASC', sortOrder: 'ASC', id: 'ASC' },
      }),
    ]);
    const menus = allMenus.filter((m) => m.langId === menu.langId);
    // 构建带层级的菜单树
    const menuTree = buildAdminFlatTree(menus as any, 0, 0);
    const data = {
      title: '编辑菜单',
      activeMenu: 'menu',
      username: session?.adminUsername || 'admin',
      csrfToken: csrfToken ?? '',
      menu,
      langs,
      menus,
      menuTree,
    };
    if (modal === '1') return (reply as any).view('admin/menu-edit-form', data);
    return reply.redirect('/admin/menu', 302);
  }

  @Post('menu/save')
  @UseGuards(AdminAuthGuard, CsrfGuard)
  async menuSave(
    @Body() body: Record<string, string>,
    @Res() reply: FastifyReply,
  ) {
    const id = body.id ? parseInt(body.id, 10) : null;
    const status = body.status === '1' ? Status.Normal : Status.Hidden;
    const payload = {
      name: body.name?.trim() || '',
      langId: parseInt(body.langId, 10) || 0,
      parentId: parseInt(body.parentId, 10) || 0,
      linkUrl: body.linkUrl?.trim() || null,
      menuPicUrl: body.menuPicUrl?.trim() || null,
      bannerUrl: body.bannerUrl?.trim() || null,
      bannerTitle: body.bannerTitle?.trim() || null,
      bannerDesc: body.bannerDesc?.trim() || null,
      metaTitle: body.metaTitle?.trim() || null,
      metaKeywords: body.metaKeywords?.trim() || null,
      metaDescription: body.metaDescription?.trim() || null,
      status,
    };
    if (id) {
      await this.menuRepo.update(id, payload as any);
      await this.redis.delPattern?.('pengcheng:menu:*');
    } else {
      const raw = await this.menuRepo
        .createQueryBuilder('m')
        .select('MAX(m.menuId)', 'max')
        .getRawOne<{ max: number | null }>();
      const menuId = (raw?.max ?? 0) + 1;
      await this.menuRepo.save(
        this.menuRepo.create({ ...payload, menuId } as any),
      );
      await this.redis.delPattern?.('pengcheng:menu:*');
    }
    return reply.redirect(getReturnPath(body.returnUrl, '/admin/menu'), 302);
  }

  @Post('menu/delete/:id')
  @UseGuards(AdminAuthGuard, CsrfGuard)
  async menuDelete(@Param('id') id: string, @Res() reply: FastifyReply) {
    await this.menuRepo.delete(parseInt(id, 10));
    await this.redis.delPattern?.('pengcheng:menu:*');
    return reply.redirect('/admin/menu', 302);
  }

  @Post('menu/delete-batch')
  @UseGuards(AdminAuthGuard, CsrfGuard)
  async menuDeleteBatch(
    @Body() body: Record<string, string>,
    @Res() reply: FastifyReply,
  ) {
    const raw = (body.ids ?? '').toString().trim();
    const ids = raw
      .split(',')
      .map((s) => parseInt(s.trim(), 10))
      .filter((n) => Number.isFinite(n) && n > 0);
    if (ids.length) {
      await this.menuRepo.delete({ id: In(ids) } as any);
      await this.redis.delPattern?.('pengcheng:menu:*');
    }
    return reply.redirect('/admin/menu', 302);
  }
}
