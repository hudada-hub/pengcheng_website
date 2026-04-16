import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SolutionCategory } from '../../entities/solution-category.entity';
import { Lang } from '../../entities/lang.entity';
import { DeepseekTranslateService } from '../config-custom/deepseek-translate.service';
import { RedisService } from '../redis/redis.service';
import { Status } from '../../common/entities/base.entity';
import { In } from 'typeorm';

export interface MissingLangDto {
  id: number;
  name: string;
  code: string;
}

@Injectable()
export class SolutionCategoryTranslateService {
  constructor(
    @InjectRepository(SolutionCategory)
    private readonly solutionCategoryRepo: Repository<SolutionCategory>,
    @InjectRepository(Lang) private readonly langRepo: Repository<Lang>,
    private readonly translateService: DeepseekTranslateService,
    private readonly redis: RedisService,
  ) {}

  /** 获取同一 solution_category_id 下缺失的语言；retranslate 为 true 时返回除源语言外的所有语言 */
  async getMissingLangs(
    idOrSourceId: number,
    retranslate = false,
  ): Promise<MissingLangDto[]> {
    const source = await this.solutionCategoryRepo.findOne({
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
    const effectiveId = source.solutionCategoryId ?? source.id;
    const sameGroup = await this.solutionCategoryRepo.find({
      where: [
        {
          solutionCategoryId: effectiveId,
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

  /** 翻译解决方案分类到目标语言：title, meta_title, meta_keywords, meta_description */
  async translateSolutionCategory(
    sourceId: number,
    targetLangIds: number[],
  ): Promise<{ created: number; updated: number }> {
    const source = await this.solutionCategoryRepo.findOne({
      where: { id: sourceId, status: In([Status.Normal, Status.Hidden]) },
    });
    if (!source) throw new Error('源分类不存在');
    const effectiveId = source.solutionCategoryId ?? source.id;

    let created = 0;
    let updated = 0;
    for (const langId of targetLangIds) {
      if (langId === source.langId) continue;
      const targetLang = await this.langRepo.findOne({
        where: { id: langId, status: Status.Normal },
      });
      if (!targetLang) continue;

      const [title, metaTitle, metaKeywords, metaDescription] =
        await Promise.all([
          source.title
            ? this.translateService.translateText(
                source.title,
                targetLang.name,
                targetLang.code,
              )
            : '',
          source.metaTitle || source.title
            ? this.translateService.translateText(
                source.metaTitle || source.title,
                targetLang.name,
                targetLang.code,
              )
            : null,
          source.metaKeywords
            ? this.translateService.translateText(
                source.metaKeywords,
                targetLang.name,
                targetLang.code,
              )
            : null,
          source.metaDescription
            ? this.translateService.translateText(
                source.metaDescription,
                targetLang.name,
                targetLang.code,
              )
            : null,
        ]);

      const existing = await this.solutionCategoryRepo.findOne({
        where: {
          solutionCategoryId: effectiveId,
          langId,
          status: In([Status.Normal, Status.Hidden]),
        },
      });
      if (existing) {
        await this.solutionCategoryRepo.update(existing.id, {
          title,
          metaTitle: metaTitle ?? title,
          metaKeywords,
          metaDescription,
          sort: source.sort,
          type: source.type,
          status: source.status,
        } as any);
        updated += 1;
      } else {
        await this.solutionCategoryRepo.save(
          this.solutionCategoryRepo.create({
            solutionCategoryId: effectiveId,
            langId,
            title,
            metaTitle: metaTitle ?? title,
            metaKeywords,
            metaDescription,
            sort: source.sort,
            type: source.type,
            status: source.status,
          } as any),
        );
        created += 1;
      }
    }
    await this.redis.delPattern?.('pengcheng:*');
    return { created, updated };
  }

  async translateSolutionCategoryBatch(
    sourceIds: number[],
    targetLangIds: number[],
  ): Promise<{ translatedCount: number; created: number; updated: number }> {
    if (!sourceIds.length || !targetLangIds.length) {
      return { translatedCount: 0, created: 0, updated: 0 };
    }
    let totalCreated = 0;
    let totalUpdated = 0;
    for (const sourceId of sourceIds) {
      const result = await this.translateSolutionCategory(
        sourceId,
        targetLangIds,
      );
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
