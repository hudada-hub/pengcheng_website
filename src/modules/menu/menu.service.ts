import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Menu } from '../../entities/menu.entity';
import { LangService } from '../../i18n/lang.service';
import { RedisService, CACHE_KEYS } from '../redis/redis.service';
import { Status } from '../../common/entities/base.entity';

@Injectable()
export class MenuService {
  constructor(
    @InjectRepository(Menu) private readonly menuRepo: Repository<Menu>,
    private readonly redis: RedisService,
    private readonly langService: LangService,
  ) {}

  async findAll(langId?: number): Promise<Menu[]> {
    const qb = this.menuRepo
      .createQueryBuilder('m')
      .where('m.status = :status', { status: Status.Normal })
      .orderBy('m.parentId', 'ASC')
      .addOrderBy('m.sortOrder', 'ASC')
      .addOrderBy('m.id', 'ASC');
    if (langId != null) qb.andWhere('m.langId = :langId', { langId });
    return qb.getMany();
  }

  async findTree(langId: number): Promise<Menu[]> {
    const list = await this.findAll(langId);
    const map = new Map<number, Menu & { children?: Menu[] }>();
    list.forEach((m) => map.set(m.id, { ...m, children: [] }));
    const roots: (Menu & { children?: Menu[] })[] = [];
    list.forEach((m) => {
      const node = map.get(m.id)!;
      if (m.parentId === 0) roots.push(node);
      else {
        const parent = map.get(m.parentId);
        if (parent) (parent as any).children.push(node);
        else roots.push(node);
      }
    });
    return roots;
  }

  async getFromCache(langId: number): Promise<Menu[]> {
    const lang = await this.langService.findById(langId);
    const code = lang?.code ?? String(langId);
    const key = CACHE_KEYS.MENU(code);
    const cached = await this.redis.get<Menu[]>(key);
    if (cached) return cached;
    const list = await this.findTree(langId);
    await this.redis.set(key, list);
    return list;
  }

  async create(dto: Partial<Menu>): Promise<Menu> {
    const menu = this.menuRepo.create(dto);
    await this.menuRepo.save(menu);
    await this.redis.delPattern('pengcheng:menu:*');
    return menu;
  }

  async update(id: number, dto: Partial<Menu>): Promise<Menu> {
    await this.menuRepo.update(id, dto as any);
    await this.redis.delPattern('pengcheng:menu:*');
    return this.menuRepo.findOne({ where: { id } }) as Promise<Menu>;
  }

  async remove(id: number): Promise<void> {
    await this.menuRepo.delete(id);
    await this.redis.delPattern('pengcheng:menu:*');
  }
}
