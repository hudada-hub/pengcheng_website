import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { News } from '../../entities/news.entity';
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
export class NewsTranslateService {
  constructor(
    @InjectRepository(News) private readonly newsRepo: Repository<News>,
    @InjectRepository(NewsCategory)
    private readonly newsCategoryRepo: Repository<NewsCategory>,
    @InjectRepository(Lang) private readonly langRepo: Repository<Lang>,
    private readonly translateService: DeepseekTranslateService,
    private readonly redis: RedisService,
  ) {}

  async getMissingLangs(
    idOrSourceId: number,
    retranslate = false,
  ): Promise<MissingLangDto[]> {
    const source = await this.newsRepo.findOne({
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
    const effectiveId = source.newsId;
    const sameGroup = await this.newsRepo.find({
      where: [
        { newsId: effectiveId, status: In([Status.Normal, Status.Hidden]) },
        { id: effectiveId, status: In([Status.Normal, Status.Hidden]) },
      ],
    });
    const existingLangIds = [...new Set(sameGroup.map((n) => n.langId))];
    return allLangs
      .filter((l) => !existingLangIds.includes(l.id))
      .map((l) => ({ id: l.id, name: l.name, code: l.code }));
  }

  async translateNews(
    sourceId: number,
    targetLangIds: number[],
  ): Promise<{ created: number; updated: number }> {
    const source = await this.newsRepo.findOne({
      where: { id: sourceId, status: In([Status.Normal, Status.Hidden]) },
    });
    if (!source) throw new Error('源新闻不存在');
    const effectiveId = source.newsId;

    if (!source.categoryId) {
      throw new Error('源新闻未设置新闻分类，请先在编辑页选择分类后再翻译');
    }
    const sourceCat = await this.newsCategoryRepo.findOne({
      where: {
        id: source.categoryId,
        status: In([Status.Normal, Status.Hidden]),
        type: 1,
      },
    });
    if (!sourceCat) {
      throw new Error('源新闻的新闻分类不存在或已失效，请重新保存新闻后再翻译');
    }
    const groupId = sourceCat.newsCategoryId ?? sourceCat.id;

    let created = 0;
    let updated = 0;
    for (const langId of targetLangIds) {
      if (langId === source.langId) continue;
      const targetLang = await this.langRepo.findOne({
        where: { id: langId, status: Status.Normal },
      });
      if (!targetLang) continue;

      const targetCat = await this.newsCategoryRepo.findOne({
        where: {
          langId,
          newsCategoryId: groupId,
          status: Status.Normal,
          type: 1,
        },
      });
      if (!targetCat) {
        throw new Error(
          '目标语言下缺少与源新闻同组的新闻分类（请先在该语言下维护对应「新闻分类」后再翻译）',
        );
      }
      const targetCategoryId = targetCat.id;

      const [
        title,
        content,
        summary,
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
        source.summary
          ? this.translateService.translateText(
              source.summary,
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

      const existing = await this.newsRepo.findOne({
        where: {
          newsId: effectiveId,
          langId,
          status: In([Status.Normal, Status.Hidden]),
        },
      });
      if (existing) {
        await this.newsRepo.update(existing.id, {
          title,
          content,
          summary,
          metaTitle: metaTitle ?? title,
          metaKeywords,
          metaDescription,
          categoryId: targetCategoryId,
          thumbUrl: source.thumbUrl,
          publishAt: source.publishAt,
          isTop: source.isTop,
          status: source.status,
        } as any);
        updated += 1;
      } else {
        await this.newsRepo.save(
          this.newsRepo.create({
            newsId: effectiveId,
            langId,
            title,
            content,
            summary,
            metaTitle: metaTitle ?? title,
            metaKeywords,
            metaDescription,
            categoryId: targetCategoryId,
            thumbUrl: source.thumbUrl,
            publishAt: source.publishAt,
            isTop: source.isTop,
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

  /** 批量翻译：将多条新闻（按 id）翻译到多个目标语言 */
  async translateNewsBatch(
    sourceIds: number[],
    targetLangIds: number[],
  ): Promise<{ translatedCount: number; created: number; updated: number }> {
    if (!sourceIds.length || !targetLangIds.length) {
      return { translatedCount: 0, created: 0, updated: 0 };
    }
    let totalCreated = 0;
    let totalUpdated = 0;
    for (const sourceId of sourceIds) {
      const result = await this.translateNews(sourceId, targetLangIds);
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
