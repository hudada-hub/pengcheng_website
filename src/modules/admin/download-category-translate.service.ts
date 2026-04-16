import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { DownloadCategory } from '../../entities/download-category.entity';
import { Lang } from '../../entities/lang.entity';
import { DeepseekTranslateService } from '../config-custom/deepseek-translate.service';
import { RedisService } from '../redis/redis.service';
import { Status } from '../../common/entities/base.entity';

export interface MissingLangDto {
  id: number;
  name: string;
  code: string;
}

@Injectable()
export class DownloadCategoryTranslateService {
  constructor(
    @InjectRepository(DownloadCategory)
    private readonly downloadCategoryRepo: Repository<DownloadCategory>,
    @InjectRepository(Lang) private readonly langRepo: Repository<Lang>,
    private readonly translateService: DeepseekTranslateService,
    private readonly redis: RedisService,
  ) {}

  async getMissingLangs(
    idOrSourceId: number,
    retranslate = false,
  ): Promise<MissingLangDto[]> {
    const source = await this.downloadCategoryRepo.findOne({
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
    const effectiveId = source.categoryId ?? source.id;
    const sameGroup = await this.downloadCategoryRepo.find({
      where: [
        { categoryId: effectiveId, status: In([Status.Normal, Status.Hidden]) },
        { id: effectiveId, status: In([Status.Normal, Status.Hidden]) },
      ],
    });
    const existingLangIds = [...new Set(sameGroup.map((c) => c.langId))];
    return allLangs
      .filter((l) => !existingLangIds.includes(l.id))
      .map((l) => ({ id: l.id, name: l.name, code: l.code }));
  }

  async translateDownloadCategory(
    sourceId: number,
    targetLangIds: number[],
  ): Promise<{ created: number; updated: number }> {
    const source = await this.downloadCategoryRepo.findOne({
      where: { id: sourceId, status: In([Status.Normal, Status.Hidden]) },
    });
    if (!source) throw new Error('源资源下载分类不存在');
    const effectiveId = source.categoryId ?? source.id;

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

      const existing = await this.downloadCategoryRepo.findOne({
        where: {
          categoryId: effectiveId,
          langId,
          status: In([Status.Normal, Status.Hidden]),
        },
      });
      if (existing) {
        await this.downloadCategoryRepo.update(existing.id, {
          name,
          metaTitle: metaTitle ?? name,
          metaKeywords,
          metaDescription,
          parentId: source.parentId,
          sort: source.sort,
          status: source.status,
        } as any);
        updated += 1;
      } else {
        await this.downloadCategoryRepo.save(
          this.downloadCategoryRepo.create({
            categoryId: effectiveId,
            langId,
            name,
            metaTitle: metaTitle ?? name,
            metaKeywords,
            metaDescription,
            parentId: source.parentId,
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

  async translateDownloadCategoryBatch(
    sourceIds: number[],
    targetLangIds: number[],
  ): Promise<{ translatedCount: number; created: number; updated: number }> {
    if (!sourceIds.length || !targetLangIds.length) {
      return { translatedCount: 0, created: 0, updated: 0 };
    }
    let totalCreated = 0;
    let totalUpdated = 0;
    for (const sourceId of sourceIds) {
      const result = await this.translateDownloadCategory(
        sourceId,
        targetLangIds,
      );
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
