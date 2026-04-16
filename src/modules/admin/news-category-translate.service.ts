import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { NewsCategory } from '../../entities/news-category.entity';
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
export class NewsCategoryTranslateService {
  constructor(
    @InjectRepository(NewsCategory)
    private readonly newsCategoryRepo: Repository<NewsCategory>,
    @InjectRepository(Lang) private readonly langRepo: Repository<Lang>,
    private readonly translateService: DeepseekTranslateService,
    private readonly redis: RedisService,
  ) {}

  /** 获取同一 news_category_id 下缺失的语言；retranslate 为 true 时返回除源语言外的所有语言 */
  async getMissingLangs(
    idOrSourceId: number,
    retranslate = false,
  ): Promise<MissingLangDto[]> {
    const source = await this.newsCategoryRepo.findOne({
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
    const effectiveId = source.newsCategoryId ?? source.id;
    const sameGroup = await this.newsCategoryRepo.find({
      where: [
        {
          newsCategoryId: effectiveId,
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

  /** 翻译新闻分类到目标语言：name, meta_title, meta_keywords, meta_description */
  async translateNewsCategory(
    sourceId: number,
    targetLangIds: number[],
  ): Promise<{ created: number; updated: number }> {
    const source = await this.newsCategoryRepo.findOne({
      where: { id: sourceId, status: In([Status.Normal, Status.Hidden]) },
    });
    if (!source) throw new Error('源分类不存在');
    const effectiveId = source.newsCategoryId ?? source.id;

    let created = 0;
    let updated = 0;
    for (const langId of targetLangIds) {
      if (langId === source.langId) continue;
      const targetLang = await this.langRepo.findOne({
        where: { id: langId, status: Status.Normal },
      });
      if (!targetLang) continue;

      const [name, metaTitle, metaKeywords, metaDescription] =
        await Promise.all([
          source.name
            ? this.translateService.translateText(
                source.name,
                targetLang.name,
                targetLang.code,
              )
            : '',
          source.metaTitle || source.name
            ? this.translateService.translateText(
                source.metaTitle || source.name,
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

      const existing = await this.newsCategoryRepo.findOne({
        where: {
          newsCategoryId: effectiveId,
          langId,
          status: In([Status.Normal, Status.Hidden]),
        },
      });
      if (existing) {
        await this.newsCategoryRepo.update(existing.id, {
          name,
          metaTitle: metaTitle ?? name,
          metaKeywords,
          metaDescription,
          type: source.type,
          bannerUrl: source.bannerUrl,
          sort: source.sort,
          status: source.status,
        } as any);
        updated += 1;
      } else {
        await this.newsCategoryRepo.save(
          this.newsCategoryRepo.create({
            newsCategoryId: effectiveId,
            type: source.type,
            langId,
            name,
            metaTitle: metaTitle ?? name,
            metaKeywords,
            metaDescription,
            bannerUrl: source.bannerUrl,
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

  async translateNewsCategoryBatch(
    sourceIds: number[],
    targetLangIds: number[],
  ): Promise<{ translatedCount: number; created: number; updated: number }> {
    if (!sourceIds.length || !targetLangIds.length) {
      return { translatedCount: 0, created: 0, updated: 0 };
    }
    let totalCreated = 0;
    let totalUpdated = 0;
    for (const sourceId of sourceIds) {
      const result = await this.translateNewsCategory(sourceId, targetLangIds);
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
