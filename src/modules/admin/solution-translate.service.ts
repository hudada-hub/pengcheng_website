import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Solution } from '../../entities/solution.entity';
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
export class SolutionTranslateService {
  constructor(
    @InjectRepository(Solution)
    private readonly solutionRepo: Repository<Solution>,
    @InjectRepository(Lang) private readonly langRepo: Repository<Lang>,
    private readonly translateService: DeepseekTranslateService,
    private readonly redis: RedisService,
  ) {}

  async getMissingLangs(
    idOrSourceId: number,
    retranslate = false,
  ): Promise<MissingLangDto[]> {
    const source = await this.solutionRepo.findOne({
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
    const effectiveId = source.solutionId;
    const sameGroup = await this.solutionRepo.find({
      where: [
        { solutionId: effectiveId, status: In([Status.Normal, Status.Hidden]) },
        { id: effectiveId, status: In([Status.Normal, Status.Hidden]) },
      ],
    });
    const existingLangIds = [...new Set(sameGroup.map((s) => s.langId))];
    return allLangs
      .filter((l) => !existingLangIds.includes(l.id))
      .map((l) => ({ id: l.id, name: l.name, code: l.code }));
  }

  async translateSolution(
    sourceId: number,
    targetLangIds: number[],
  ): Promise<{ created: number; updated: number }> {
    const source = await this.solutionRepo.findOne({
      where: { id: sourceId, status: In([Status.Normal, Status.Hidden]) },
    });
    if (!source) throw new Error('源解决方案不存在');
    const effectiveId = source.solutionId;

    let created = 0;
    let updated = 0;
    for (const langId of targetLangIds) {
      if (langId === source.langId) continue;
      const targetLang = await this.langRepo.findOne({
        where: { id: langId, status: Status.Normal },
      });
      if (!targetLang) continue;

      const [
        title,
        bannerTitle,
        bannerDesc,
        metaTitle,
        metaKeywords,
        metaDescription,
      ] = await Promise.all([
        source.title
          ? this.translateService.translateText(
              source.title,
              targetLang.name,
              targetLang.code,
            )
          : '',
        source.bannerTitle
          ? this.translateService.translateText(
              source.bannerTitle,
              targetLang.name,
              targetLang.code,
            )
          : null,
        source.bannerDesc
          ? this.translateService.translateText(
              source.bannerDesc,
              targetLang.name,
              targetLang.code,
            )
          : null,
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

      let kehu: Array<{ title: string; content: string }> | null = null;
      if (source.kehu && Array.isArray(source.kehu) && source.kehu.length > 0) {
        kehu = await Promise.all(
          source.kehu.map(async (item) => ({
            title: item.title
              ? await this.translateService.translateText(
                  item.title,
                  targetLang.name,
                  targetLang.code,
                )
              : '',
            content: item.content
              ? await this.translateService.translateText(
                  item.content,
                  targetLang.name,
                  targetLang.code,
                )
              : '',
          })),
        );
      }

      const existing = await this.solutionRepo.findOne({
        where: {
          solutionId: effectiveId,
          langId,
          status: In([Status.Normal, Status.Hidden]),
        },
      });
      if (existing) {
        await this.solutionRepo.update(existing.id, {
          title,
          bannerTitle,
          bannerDesc,
          kehu,
          metaTitle: metaTitle ?? title,
          metaKeywords,
          metaDescription,
          bannerBgUrl: source.bannerBgUrl,
          kehuBannerUrl: source.kehuBannerUrl,
          relatedProductIds: source.relatedProductIds,
          relatedIndustryCaseIds: source.relatedIndustryCaseIds,
          status: source.status,
        } as any);
        updated += 1;
      } else {
        await this.solutionRepo.save(
          this.solutionRepo.create({
            solutionId: effectiveId,
            langId,
            title,
            bannerBgUrl: source.bannerBgUrl,
            bannerTitle,
            bannerDesc,
            kehuBannerUrl: source.kehuBannerUrl,
            kehu,
            relatedProductIds: source.relatedProductIds,
            relatedIndustryCaseIds: source.relatedIndustryCaseIds,
            metaTitle: metaTitle ?? title,
            metaKeywords,
            metaDescription,
            viewCount: 0,
            status: source.status,
          } as any),
        );
        created += 1;
      }
    }
    await this.redis.delPattern?.('pengcheng:*');
    return { created, updated };
  }

  /** 批量翻译：将多个解决方案（按 id）翻译到多个目标语言 */
  async translateSolutionBatch(
    sourceIds: number[],
    targetLangIds: number[],
  ): Promise<{ translatedCount: number; created: number; updated: number }> {
    if (!sourceIds.length || !targetLangIds.length) {
      return { translatedCount: 0, created: 0, updated: 0 };
    }
    let totalCreated = 0;
    let totalUpdated = 0;
    for (const sourceId of sourceIds) {
      const result = await this.translateSolution(sourceId, targetLangIds);
      totalCreated += result.created;
      totalUpdated += result.updated;
    }
    await this.redis.delPattern?.('pengcheng:*');
    return {
      translatedCount: sourceIds.length,
      created: totalCreated,
      updated: totalUpdated,
    };
  }
}
