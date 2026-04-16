import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Lang } from '../../entities/lang.entity';
import { ProductParamCategory } from '../../entities/product-param-category.entity';
import { Status } from '../../common/entities/base.entity';
import { DeepseekTranslateService } from '../config-custom/deepseek-translate.service';
import { RedisService } from '../redis/redis.service';

export interface MissingLangDto {
  id: number;
  name: string;
  code: string;
}

@Injectable()
export class ProductParamCategoryTranslateService {
  constructor(
    @InjectRepository(ProductParamCategory)
    private readonly categoryRepo: Repository<ProductParamCategory>,
    @InjectRepository(Lang) private readonly langRepo: Repository<Lang>,
    private readonly translateService: DeepseekTranslateService,
    private readonly redis: RedisService,
  ) {}

  /** 获取同一 product_param_category_id 下缺失的语言；retranslate 为 true 时返回除源语言外的所有语言 */
  async getMissingLangs(
    idOrSourceId: number,
    retranslate = false,
  ): Promise<MissingLangDto[]> {
    const source = await this.categoryRepo.findOne({
      where: { id: idOrSourceId, status: In([Status.Normal, Status.Hidden]) },
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
    if (!source) return [];
    const effectiveId = source.productParamCategoryId ?? source.id;
    const sameGroup = await this.categoryRepo.find({
      where: [
        {
          productParamCategoryId: effectiveId,
          status: In([Status.Normal, Status.Hidden]),
        },
        { id: effectiveId, status: In([Status.Normal, Status.Hidden]) },
      ],
    });
    const existingLangIds = [...new Set(sameGroup.map((c) => c.langId))];
    return allLangs
      .filter((l) => !existingLangIds.includes(l.id))
      .map((l) => ({ id: l.id, name: l.name, code: l.code }));
  }

  /** 翻译参数分类到目标语言：title */
  async translateCategory(
    sourceId: number,
    targetLangIds: number[],
  ): Promise<{ created: number; updated: number }> {
    const source = await this.categoryRepo.findOne({
      where: { id: sourceId, status: In([Status.Normal, Status.Hidden]) },
    });
    if (!source) throw new Error('源参数分类不存在');
    const effectiveId = source.productParamCategoryId ?? source.id;

    let created = 0;
    let updated = 0;
    for (const langId of targetLangIds) {
      if (langId === source.langId) continue;
      const targetLang = await this.langRepo.findOne({
        where: { id: langId, status: Status.Normal },
      });
      if (!targetLang) continue;

      const title = source.title
        ? await this.translateService.translateText(
            source.title,
            targetLang.name,
            targetLang.code,
          )
        : '';

      const existing = await this.categoryRepo.findOne({
        where: {
          productParamCategoryId: effectiveId,
          langId,
          status: In([Status.Normal, Status.Hidden]),
        },
      });
      if (existing) {
        await this.categoryRepo.update(existing.id, {
          title,
          sort: source.sort,
          status: source.status,
        } as any);
        updated += 1;
      } else {
        await this.categoryRepo.save(
          this.categoryRepo.create({
            productParamCategoryId: effectiveId,
            langId,
            title,
            sort: source.sort,
            status: source.status,
          } as any),
        );
        created += 1;
      }
    }
    await this.redis.delPattern?.('pengcheng:*');
    return { created, updated };
  }

  async translateCategoryBatch(
    sourceIds: number[],
    targetLangIds: number[],
  ): Promise<{ translatedCount: number; created: number; updated: number }> {
    if (!sourceIds.length || !targetLangIds.length)
      return { translatedCount: 0, created: 0, updated: 0 };
    let totalCreated = 0;
    let totalUpdated = 0;
    for (const sourceId of sourceIds) {
      const result = await this.translateCategory(sourceId, targetLangIds);
      totalCreated += result.created;
      totalUpdated += result.updated;
    }
    return {
      translatedCount: sourceIds.length,
      created: totalCreated,
      updated: totalUpdated,
    };
  }
}
