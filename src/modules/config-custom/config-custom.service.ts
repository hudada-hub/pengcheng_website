import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { In } from 'typeorm';
import { Config } from '../../entities/config.entity';
import { ConfigCategory } from '../../entities/config-category.entity';
import { Lang } from '../../entities/lang.entity';
import { RedisService, CACHE_KEYS } from '../redis/redis.service';
import { DeepseekTranslateService } from './deepseek-translate.service';
import { Status } from '../../common/entities/base.entity';

export interface MissingLangDto {
  id: number;
  name: string;
  code: string;
}

@Injectable()
export class ConfigCustomService {
  constructor(
    @InjectRepository(Config) private readonly configRepo: Repository<Config>,
    @InjectRepository(ConfigCategory)
    private readonly categoryRepo: Repository<ConfigCategory>,
    @InjectRepository(Lang) private readonly langRepo: Repository<Lang>,
    private readonly redis: RedisService,
    private readonly translateService: DeepseekTranslateService,
  ) {}

  async findAllByLang(langId: number): Promise<Config[]> {
    return this.configRepo.find({
      where: { langId, status: Status.Normal },
      order: { id: 'ASC' },
    });
  }

  /** 查询所有语言的配置（用于「全部」显示） */
  async findAll(): Promise<Config[]> {
    return this.configRepo.find({
      where: { status: Status.Normal },
      relations: ['lang'],
      order: { id: 'ASC' },
    });
  }

  /** 分页列表，支持语言 / 分类筛选与名称/key 模糊搜索 */
  async findListWithPagination(options: {
    langId?: number;
    categoryId?: number;
    keyword?: string;
    page?: number;
    pageSize?: number;
  }): Promise<{
    list: Config[];
    total: number;
    totalPages: number;
    page: number;
    pageSize: number;
  }> {
    const page = Math.max(1, options.page ?? 1);
    const pageSize = Math.min(50, Math.max(5, options.pageSize ?? 15));
    const keyword = (options.keyword ?? '').trim();
    const hasLang = options.langId != null && options.langId > 0;
    const hasCategory = options.categoryId != null && options.categoryId > 0;
    const qb = this.configRepo
      .createQueryBuilder('c')
      .leftJoinAndSelect('c.lang', 'lang')
      .where('c.status = :status', { status: Status.Normal });
    if (hasLang) {
      qb.andWhere('c.lang_id = :langId', { langId: options.langId });
    }
    if (hasCategory) {
      qb.andWhere('c.category_id = :categoryId', {
        categoryId: options.categoryId,
      });
    }
    if (keyword) {
      qb.andWhere('(c.name LIKE :kw OR c.key_name LIKE :kw)', {
        kw: `%${keyword}%`,
      });
    }
    const total = await qb.getCount();
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const list = await qb
      .orderBy('c.id', 'ASC')
      .skip((page - 1) * pageSize)
      .take(pageSize)
      .getMany();
    return { list, total, totalPages, page, pageSize };
  }

  /** 批量物理删除（仅删除 deletable=1 的配置） */
  async batchRemove(ids: number[]): Promise<number> {
    if (!ids.length) return 0;
    const valid = await this.configRepo.find({
      where: { id: In(ids), status: Status.Normal, deletable: 1 },
      select: ['id'],
    });
    const idList = valid.map((c) => c.id);
    if (idList.length) {
      await this.configRepo.delete({ id: In(idList) });
      await this.redis.delPattern('pengcheng:config:*');
    }
    return idList.length;
  }

  async getByKey(langId: number, keyName: string): Promise<Config | null> {
    return this.configRepo.findOne({
      where: { langId, keyName, status: Status.Normal },
    });
  }

  async getFromCache(
    langId: number,
    keyName?: string,
  ): Promise<Config | Config[] | null> {
    const lang = await this.langRepo.findOne({ where: { id: langId } });
    const code = lang?.code ?? String(langId);
    const key = CACHE_KEYS.CONFIG(code, keyName);
    const cached = await this.redis.get<Config | Config[]>(key);
    if (cached) return cached;
    if (keyName) {
      const one = await this.getByKey(langId, keyName);
      if (one) await this.redis.set(key, one);
      return one;
    }
    const list = await this.findAllByLang(langId);
    await this.redis.set(key, list);
    return list;
  }

  async create(dto: Partial<Config>): Promise<Config> {
    let payload = { ...dto };
    if (payload.configId != null && payload.keyName) {
      const anchor = await this.configRepo.findOne({
        where: { id: payload.configId, status: Status.Normal },
      });
      if (!anchor || anchor.keyName !== payload.keyName) {
        payload = { ...payload, configId: null };
      }
    }
    const config = this.configRepo.create(payload);
    const saved = await this.configRepo.save(config);
    const row = (Array.isArray(saved) ? saved[0] : saved) as Config;
    if (row?.id && (row.configId == null || row.configId === undefined)) {
      await this.configRepo.update(row.id, { configId: row.id });
      row.configId = row.id;
    }
    await this.redis.delPattern('pengcheng:config:*');
    return row;
  }

  async update(id: number, dto: Partial<Config>): Promise<Config> {
    await this.configRepo.update(id, dto as any);
    await this.redis.delPattern('pengcheng:config:*');
    return this.configRepo.findOne({ where: { id } }) as Promise<Config>;
  }

  async remove(id: number): Promise<void> {
    await this.configRepo.delete(id);
    await this.redis.delPattern('pengcheng:config:*');
  }

  async listCategories(): Promise<ConfigCategory[]> {
    return this.categoryRepo.find({
      where: { status: Status.Normal },
      order: { id: 'ASC' },
    });
  }

  /** 删除区块分类：分类下存在配置（未删除）则禁止删除 */
  async removeCategory(
    categoryId: number,
  ): Promise<{ ok: boolean; message?: string }> {
    if (!categoryId) return { ok: false, message: '分类不存在' };

    const category = await this.categoryRepo.findOne({
      where: { id: categoryId, status: Status.Normal },
      select: ['id'],
    });
    if (!category) return { ok: false, message: '分类不存在或已删除' };

    const usedCount = await this.configRepo.count({
      where: { categoryId, status: In([Status.Normal, Status.Hidden]) as any },
    });
    if (usedCount > 0) {
      return { ok: false, message: '该分类下存在配置，无法删除' };
    }

    await this.categoryRepo.delete(categoryId);
    await this.redis.delPattern('pengcheng:config:*');
    return { ok: true, message: '分类已删除' };
  }

  async getById(id: number): Promise<Config | null> {
    return this.configRepo.findOne({
      where: { id, status: Status.Normal },
      relations: ['lang'],
    });
  }

  /** 获取同一 configId 下缺失的语言（可翻译目标）；retranslate 为 true 时返回除源语言外的所有语言，用于重新翻译 */
  async getMissingLangs(
    configIdOrSourceId: number,
    retranslate = false,
  ): Promise<MissingLangDto[]> {
    const source = await this.configRepo.findOne({
      where: { id: configIdOrSourceId, status: Status.Normal },
    });
    const allLangs = await this.langRepo.find({
      where: { status: Status.Normal },
      order: { id: 'ASC' },
    });
    if (retranslate && source) {
      return allLangs
        .filter((l) => l.id !== source.langId)
        .map((l) => ({ id: l.id, name: l.name, code: l.code }));
    }
    const effectiveConfigId = source
      ? (source.configId ?? source.id)
      : configIdOrSourceId;
    const sameGroup = await this.configRepo.find({
      where: [
        { configId: effectiveConfigId, status: Status.Normal },
        { id: effectiveConfigId, status: Status.Normal },
      ],
    });
    const existingLangIds = [...new Set(sameGroup.map((c) => c.langId))];
    return allLangs
      .filter((l) => !existingLangIds.includes(l.id))
      .map((l) => ({ id: l.id, name: l.name, code: l.code }));
  }

  /** 翻译配置到目标语言：title/description/content 内文案翻译；其余字段（含视频地址、图片 URL 等）原样复制 */
  async translateConfig(
    sourceConfigId: number,
    targetLangIds: number[],
  ): Promise<{ created: number; updated: number }> {
    const source = await this.configRepo.findOne({
      where: { id: sourceConfigId, status: Status.Normal },
    });
    if (!source) throw new Error('源配置不存在');
    const effectiveConfigId = source.configId ?? source.id;

    const copiedFromSource = {
      name: source.name,
      keyName: source.keyName,
      bgPicUrl: source.bgPicUrl,
      videoUrl: source.videoUrl,
      isArray: source.isArray,
      type: source.type,
      categoryId: source.categoryId,
      linkUrl: source.linkUrl,
      deletable: source.deletable,
    };

    let created = 0;
    let updated = 0;
    for (const langId of targetLangIds) {
      if (langId === source.langId) continue;
      const targetLang = await this.langRepo.findOne({
        where: { id: langId, status: Status.Normal },
      });
      if (!targetLang) continue;

      const translatedTitle = source.title
        ? await this.translateService.translateText(
            source.title,
            targetLang.name,
            targetLang.code,
          )
        : null;
      const translatedDesc = source.description
        ? await this.translateService.translateText(
            source.description,
            targetLang.name,
            targetLang.code,
          )
        : null;
      const translatedContent = await this.translateContent(
        source.content,
        targetLang.name,
        targetLang.code,
        source.type,
      );

      const existing = await this.configRepo.findOne({
        where: { configId: effectiveConfigId, langId, status: Status.Normal },
      });
      if (existing) {
        await this.configRepo.update(existing.id, {
          ...copiedFromSource,
          title: translatedTitle,
          description: translatedDesc,
          content: translatedContent,
        } as any);
        updated += 1;
      } else {
        await this.configRepo.save(
          this.configRepo.create({
            ...copiedFromSource,
            title: translatedTitle,
            description: translatedDesc,
            content: translatedContent,
            langId,
            configId: effectiveConfigId,
            status: Status.Normal,
          }),
        );
        created += 1;
      }
    }
    await this.redis.delPattern('pengcheng:config:*');
    return { created, updated };
  }

  private async translateContent(
    content: Record<string, unknown> | unknown[] | null,
    targetLangName: string,
    targetLangCode: string,
    configType?: number,
  ): Promise<Record<string, unknown> | unknown[] | null> {
    if (content == null) return content;
    const arr = Array.isArray(content) ? content : [content];
    const out: Record<string, unknown>[] = [];
    for (const item of arr) {
      if (item == null || typeof item !== 'object') {
        out.push(item as Record<string, unknown>);
        continue;
      }
      const obj = { ...(item as Record<string, unknown>) };
      if (typeof obj.title === 'string' && obj.title.trim()) {
        obj.title = await this.translateService.translateText(
          obj.title,
          targetLangName,
          targetLangCode,
        );
      }
      if (typeof obj.content === 'string' && obj.content.trim()) {
        obj.content =
          configType === 13
            ? await this.translateService.translateHtml(
                obj.content,
                targetLangName,
                targetLangCode,
              )
            : await this.translateService.translateText(
                obj.content,
                targetLangName,
                targetLangCode,
              );
      }
      if (typeof obj.description === 'string' && obj.description.trim()) {
        obj.description = await this.translateService.translateText(
          obj.description,
          targetLangName,
          targetLangCode,
        );
      }
      if (typeof obj.bigTitle === 'string' && obj.bigTitle.trim()) {
        obj.bigTitle = await this.translateService.translateText(
          obj.bigTitle,
          targetLangName,
          targetLangCode,
        );
      }
      if (typeof obj.subtitle === 'string' && obj.subtitle.trim()) {
        obj.subtitle = await this.translateService.translateText(
          obj.subtitle,
          targetLangName,
          targetLangCode,
        );
      }
      if (typeof obj.subDescription === 'string' && obj.subDescription.trim()) {
        obj.subDescription = await this.translateService.translateText(
          obj.subDescription,
          targetLangName,
          targetLangCode,
        );
      }
      out.push(obj);
    }
    return Array.isArray(content) ? out : (out[0] ?? null);
  }

  /** 批量翻译：将多条配置（按 id）翻译到多个目标语言 */
  async translateConfigBatch(
    sourceIds: number[],
    targetLangIds: number[],
  ): Promise<{ translatedCount: number; created: number; updated: number }> {
    if (!sourceIds.length || !targetLangIds.length) {
      return { translatedCount: 0, created: 0, updated: 0 };
    }

    let created = 0;
    let updated = 0;

    for (const sourceId of sourceIds) {
      const result = await this.translateConfig(sourceId, targetLangIds);
      created += result.created;
      updated += result.updated;
    }

    return {
      translatedCount: sourceIds.length,
      created,
      updated,
    };
  }
}
