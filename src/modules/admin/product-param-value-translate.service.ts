import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Lang } from '../../entities/lang.entity';
import { ProductParamValue } from '../../entities/product-param-value.entity';
import { Status } from '../../common/entities/base.entity';
import { DeepseekTranslateService } from '../config-custom/deepseek-translate.service';
import { RedisService } from '../redis/redis.service';

export interface MissingLangDto {
  id: number;
  name: string;
  code: string;
}

@Injectable()
export class ProductParamValueTranslateService {
  constructor(
    @InjectRepository(ProductParamValue)
    private readonly valueRepo: Repository<ProductParamValue>,
    @InjectRepository(Lang) private readonly langRepo: Repository<Lang>,
    private readonly translateService: DeepseekTranslateService,
    private readonly redis: RedisService,
  ) {}

  /** 获取同一 product_param_value_id 下缺失的语言；retranslate 为 true 时返回除源语言外的所有语言 */
  async getMissingLangs(
    idOrSourceId: number,
    retranslate = false,
  ): Promise<MissingLangDto[]> {
    const source = await this.valueRepo.findOne({
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
    const effectiveId = source.productParamValueId ?? source.id;
    const sameGroup = await this.valueRepo.find({
      where: [
        {
          productParamValueId: effectiveId,
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

  /** 翻译参数值到目标语言：title + value（categoryId 直接复用源 categoryId） */
  async translateParamValue(
    sourceId: number,
    targetLangIds: number[],
  ): Promise<{ created: number; updated: number }> {
    const source = await this.valueRepo.findOne({
      where: { id: sourceId, status: In([Status.Normal, Status.Hidden]) },
    });
    if (!source) throw new Error('源参数值不存在');
    const effectiveId = source.productParamValueId ?? source.id;

    let created = 0;
    let updated = 0;
    for (const langId of targetLangIds) {
      if (langId === source.langId) continue;
      const targetLang = await this.langRepo.findOne({
        where: { id: langId, status: Status.Normal },
      });
      if (!targetLang) continue;

      const translatedValue = source.value
        ? await this.translateService.translateText(
            source.value,
            targetLang.name,
            targetLang.code,
          )
        : '';

      const existing = await this.valueRepo.findOne({
        where: {
          productParamValueId: effectiveId,
          langId,
          status: In([Status.Normal, Status.Hidden]),
        },
      });
      if (existing) {
        await this.valueRepo.update(existing.id, {
          categoryId: source.categoryId,
          value: translatedValue,
          sort: source.sort,
          status: source.status,
        } as any);
        updated += 1;
      } else {
        await this.valueRepo.save(
          this.valueRepo.create({
            productParamValueId: effectiveId,
            categoryId: source.categoryId,
            langId,
            value: translatedValue,
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

  async translateParamValueBatch(
    sourceIds: number[],
    targetLangIds: number[],
  ): Promise<{ translatedCount: number; created: number; updated: number }> {
    if (!sourceIds.length || !targetLangIds.length)
      return { translatedCount: 0, created: 0, updated: 0 };
    let totalCreated = 0;
    let totalUpdated = 0;
    for (const sourceId of sourceIds) {
      const result = await this.translateParamValue(sourceId, targetLangIds);
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
