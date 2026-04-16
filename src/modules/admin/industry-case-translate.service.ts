import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { IndustryCase } from '../../entities/industry-case.entity';
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
export class IndustryCaseTranslateService {
  constructor(
    @InjectRepository(IndustryCase)
    private readonly industryCaseRepo: Repository<IndustryCase>,
    @InjectRepository(Lang) private readonly langRepo: Repository<Lang>,
    private readonly translateService: DeepseekTranslateService,
    private readonly redis: RedisService,
  ) {}

  async getMissingLangs(
    idOrSourceId: number,
    retranslate = false,
  ): Promise<MissingLangDto[]> {
    const source = await this.industryCaseRepo.findOne({
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
    const effectiveId = source.industryCaseId;
    const sameGroup = await this.industryCaseRepo.find({
      where: [
        {
          industryCaseId: effectiveId,
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

  async translateIndustryCase(
    sourceId: number,
    targetLangIds: number[],
  ): Promise<{ created: number; updated: number }> {
    const source = await this.industryCaseRepo.findOne({
      where: { id: sourceId, status: In([Status.Normal, Status.Hidden]) },
    });
    if (!source) throw new Error('源行业应用案例不存在');
    const effectiveId = source.industryCaseId;

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
        content,
        specLine,
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
        source.content
          ? this.translateService.translateHtml(
              source.content,
              targetLang.name,
              targetLang.code,
            )
          : null,
        source.specLine
          ? this.translateService.translateText(
              source.specLine,
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

      let tags: string[] | null = null;
      if (source.tags && Array.isArray(source.tags) && source.tags.length > 0) {
        tags = await Promise.all(
          source.tags.map((t) =>
            t
              ? this.translateService.translateText(
                  t,
                  targetLang.name,
                  targetLang.code,
                )
              : '',
          ),
        );
      }

      const existing = await this.industryCaseRepo.findOne({
        where: {
          industryCaseId: effectiveId,
          langId,
          status: In([Status.Normal, Status.Hidden]),
        },
      });
      if (existing) {
        await this.industryCaseRepo.update(existing.id, {
          title,
          content,
          specLine,
          tags,
          metaTitle: metaTitle ?? title,
          metaKeywords,
          metaDescription,
          sort: source.sort,
          isTop: source.isTop,
          thumbnail: source.thumbnail,
          bannerUrl: source.bannerUrl,
          solutionIds: source.solutionIds,
          relatedProductIds: source.relatedProductIds,
          relatedSolutionIds: source.relatedSolutionIds,
          relatedIndustryCaseIds: source.relatedIndustryCaseIds,
          status: source.status,
        } as any);
        updated += 1;
      } else {
        await this.industryCaseRepo.save(
          this.industryCaseRepo.create({
            industryCaseId: effectiveId,
            langId,
            sort: source.sort,
            isTop: source.isTop,
            title,
            content,
            specLine,
            thumbnail: source.thumbnail,
            bannerUrl: source.bannerUrl,
            tags,
            solutionIds: source.solutionIds,
            relatedProductIds: source.relatedProductIds,
            relatedSolutionIds: source.relatedSolutionIds,
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

  /** 批量翻译：将多个行业案例（按 id）翻译到多个目标语言 */
  async translateIndustryCaseBatch(
    sourceIds: number[],
    targetLangIds: number[],
  ): Promise<{ translatedCount: number; created: number; updated: number }> {
    if (!sourceIds.length || !targetLangIds.length) {
      return { translatedCount: 0, created: 0, updated: 0 };
    }
    let totalCreated = 0;
    let totalUpdated = 0;
    for (const sourceId of sourceIds) {
      const result = await this.translateIndustryCase(sourceId, targetLangIds);
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
