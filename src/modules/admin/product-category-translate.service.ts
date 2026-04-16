import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { In } from 'typeorm';
import { ProductCategory } from '../../entities/product-category.entity';
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
export class ProductCategoryTranslateService {
  constructor(
    @InjectRepository(ProductCategory)
    private readonly productCategoryRepo: Repository<ProductCategory>,
    @InjectRepository(Lang) private readonly langRepo: Repository<Lang>,
    private readonly translateService: DeepseekTranslateService,
    private readonly redis: RedisService,
  ) {}

  /** 获取同一节点（categoryId = 源记录 id）下缺失的语言；retranslate 为 true 时返回除源语言外的所有语言 */
  async getMissingLangs(
    idOrSourceId: number,
    retranslate = false,
  ): Promise<MissingLangDto[]> {
    const source = await this.productCategoryRepo.findOne({
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
    const nodeCategoryId = source.id;
    const sameGroup = await this.productCategoryRepo.find({
      where: [
        {
          categoryId: nodeCategoryId,
          status: In([Status.Normal, Status.Hidden]),
        },
        { id: nodeCategoryId, status: In([Status.Normal, Status.Hidden]) },
      ],
    });
    const existingLangIds = [...new Set(sameGroup.map((c) => c.langId))];
    return allLangs
      .filter((l) => !existingLangIds.includes(l.id))
      .map((l) => ({ id: l.id, name: l.name, code: l.code }));
  }

  /**
   * 按选中的 sourceIds 翻译对应记录；按 targetLangIds，用 langId + categoryId 判断：有则更新，无则插入。
   * 约定：同一节点在不同语言下用同一 categoryId（源记录 id），故 (categoryId, langId) 唯一。
   */
  async translateProductCategory(
    sourceId: number,
    targetLangIds: number[],
  ): Promise<{ created: number; updated: number }> {
    const source = await this.productCategoryRepo.findOne({
      where: { id: sourceId, status: In([Status.Normal, Status.Hidden]) },
    });
    if (!source) throw new Error('源分类不存在');
    const categoryId = source.id;

    let created = 0;
    let updated = 0;
    const sourceLangIdNum = Number(source.langId);
    for (const langId of targetLangIds) {
      const targetId = Number(langId);
      if (targetId === sourceLangIdNum) continue;
      const targetLang = await this.langRepo.findOne({
        where: { id: targetId, status: Status.Normal },
      });
      if (!targetLang) continue;

      let parentId = 0;
      const sourceParentId = (source as any)?.parentId ?? 0;
      if (sourceParentId) {
        const sourceParent = await this.productCategoryRepo.findOne({
          where: {
            id: sourceParentId,
            status: In([Status.Normal, Status.Hidden]),
          },
        });
        if (sourceParent) {
          let targetParent = await this.productCategoryRepo.findOne({
            where: {
              categoryId: sourceParent.id,
              langId: targetLang.id,
              status: In([Status.Normal, Status.Hidden]),
            },
          });
          if (!targetParent) {
            await this.translateProductCategory(sourceParent.id, [
              targetLang.id,
            ]);
            targetParent = await this.productCategoryRepo.findOne({
              where: {
                categoryId: sourceParent.id,
                langId: targetLang.id,
                status: In([Status.Normal, Status.Hidden]),
              },
            });
          }
          if (targetParent) parentId = targetParent.id;
        }
      }

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

      const existing = await this.productCategoryRepo.findOne({
        where: {
          categoryId,
          langId: targetLang.id,
          status: In([Status.Normal, Status.Hidden]),
        },
      });
      if (existing) {
        await this.productCategoryRepo.update(existing.id, {
          name,
          metaTitle: metaTitle ?? name,
          metaKeywords,
          metaDescription,
          parentId,
          sort: source.sort,
          bannerUrl: source.bannerUrl,
          menuPicUrl: source.menuPicUrl,
          status: source.status,
        } as any);
        updated += 1;
      } else {
        await this.productCategoryRepo.save(
          this.productCategoryRepo.create({
            categoryId,
            langId: targetLang.id,
            name,
            metaTitle: metaTitle ?? name,
            metaKeywords,
            metaDescription,
            bannerUrl: source.bannerUrl,
            menuPicUrl: source.menuPicUrl,
            sort: source.sort,
            parentId,
            status: source.status,
          } as any),
        );
        created += 1;
      }
    }
    await this.redis.delPattern?.('pengcheng:*');
    return { created, updated };
  }

  /** 批量翻译：将多个分类（按 id）翻译到多个目标语言 */
  async translateProductCategoryBatch(
    sourceIds: number[],
    targetLangIds: number[],
  ): Promise<{ translatedCount: number; created: number; updated: number }> {
    if (!sourceIds.length || !targetLangIds.length) {
      return { translatedCount: 0, created: 0, updated: 0 };
    }
    let totalCreated = 0;
    let totalUpdated = 0;
    for (const sourceId of sourceIds) {
      const result = await this.translateProductCategory(
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
