import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { In } from 'typeorm';
import { Product } from '../../entities/product.entity';
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
export class ProductTranslateService {
  constructor(
    @InjectRepository(Product)
    private readonly productRepo: Repository<Product>,
    @InjectRepository(ProductCategory)
    private readonly categoryRepo: Repository<ProductCategory>,
    @InjectRepository(Lang) private readonly langRepo: Repository<Lang>,
    private readonly translateService: DeepseekTranslateService,
    private readonly redis: RedisService,
  ) {}

  async getMissingLangs(
    idOrSourceId: number,
    retranslate = false,
  ): Promise<MissingLangDto[]> {
    const source = await this.productRepo.findOne({
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
    const effectiveId = source.productId;
    const sameGroup = await this.productRepo.find({
      where: {
        productId: effectiveId,
        status: In([Status.Normal, Status.Hidden]),
      },
    });
    const existingLangIds = [...new Set(sameGroup.map((p) => p.langId))];
    return allLangs
      .filter((l) => !existingLangIds.includes(l.id))
      .map((l) => ({ id: l.id, name: l.name, code: l.code }));
  }

  async translateProduct(
    sourceId: number,
    targetLangIds: number[],
    opts?: { skipMissingTargetCategory?: boolean },
  ): Promise<{ created: number; updated: number; warnings: string[] }> {
    const source = await this.productRepo.findOne({
      where: { id: sourceId, status: In([Status.Normal, Status.Hidden]) },
    });
    if (!source) throw new Error('源产品不存在');
    const effectiveId = source.productId;
    const warnings: string[] = [];

    let created = 0;
    let updated = 0;
    for (const langId of targetLangIds) {
      if (langId === source.langId) continue;
      const targetLang = await this.langRepo.findOne({
        where: { id: langId, status: Status.Normal },
      });
      if (!targetLang) continue;

      // 产品.category_id → product_category.id（目标语言行主键）。同组匹配须兼容两种翻译写入：
      // - 从锚点行译出：目标行 category_id = 锚点 id（或列 category_id 指向的组键）
      // - 从某语言行译出：目标行 category_id = 源语言行主键 id（见 product-category-translate 写入 source.id）
      let targetCategoryId: number | null = null;
      if (source.categoryId) {
        const sourceCategory = await this.categoryRepo.findOne({
          where: {
            id: source.categoryId,
            status: In([Status.Normal, Status.Hidden]),
          },
        });
        if (!sourceCategory) {
          throw new Error(
            '源产品的产品分类不存在或已失效，请重新选择分类后再翻译',
          );
        }
        const anchorId = sourceCategory.categoryId ?? sourceCategory.id;
        const targetCategory = await this.categoryRepo.findOne({
          where: [
            {
              categoryId: sourceCategory.id,
              langId,
              status: In([Status.Normal, Status.Hidden]),
            },
            {
              categoryId: anchorId,
              langId,
              status: In([Status.Normal, Status.Hidden]),
            },
            {
              id: anchorId,
              langId,
              status: In([Status.Normal, Status.Hidden]),
            },
          ],
        });
        if (!targetCategory) {
          if (opts?.skipMissingTargetCategory) {
            const shortName = (source.name || '').trim().slice(0, 48);
            warnings.push(
              `产品 id=${sourceId}${shortName ? `「${shortName}」` : ''} → ${targetLang.name}：目标语言下缺少同组产品分类，已跳过`,
            );
            continue;
          }
          throw new Error(
            '目标语言下缺少与源产品同组的产品分类，请先在「产品分类」中维护该语言对应分类后再翻译',
          );
        }
        targetCategoryId = targetCategory.id;
      }

      const [
        name,
        model,
        detailTitle,
        metaTitle,
        metaKeywords,
        metaDescription,
        advantageSummary,
      ] = await Promise.all([
        source.name
          ? this.translateService.translateText(
              source.name,
              targetLang.name,
              targetLang.code,
            )
          : '',
        source.model
          ? this.translateService.translateText(
              source.model,
              targetLang.name,
              targetLang.code,
            )
          : null,
        source.detailTitle
          ? this.translateService.translateText(
              source.detailTitle,
              targetLang.name,
              targetLang.code,
            )
          : null,
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
        source.advantageSummary
          ? this.translateService.translateText(
              source.advantageSummary,
              targetLang.name,
              targetLang.code,
            )
          : null,
      ]);

      let summary: string[] | null = null;
      const srcSummary = source.summary as string[] | string | null | undefined;
      if (srcSummary && Array.isArray(srcSummary) && srcSummary.length > 0) {
        summary = await Promise.all(
          srcSummary.map((t) =>
            t
              ? this.translateService.translateText(
                  t,
                  targetLang.name,
                  targetLang.code,
                )
              : '',
          ),
        );
      } else if (typeof srcSummary === 'string' && srcSummary.trim()) {
        summary = [
          await this.translateService.translateText(
            srcSummary,
            targetLang.name,
            targetLang.code,
          ),
        ];
      }

      let features: string[] | null = null;
      if (
        source.features &&
        Array.isArray(source.features) &&
        source.features.length > 0
      ) {
        features = await Promise.all(
          source.features.map((t) =>
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

      let coreParams: string[] | null = null;
      if (
        source.coreParams &&
        Array.isArray(source.coreParams) &&
        source.coreParams.length > 0
      ) {
        coreParams = await Promise.all(
          source.coreParams.map((t) =>
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

      let paramsJson: { title: string; data: string }[] | null = null;
      if (
        source.paramsJson &&
        Array.isArray(source.paramsJson) &&
        source.paramsJson.length > 0
      ) {
        paramsJson = await Promise.all(
          source.paramsJson.map(async (item) => ({
            title: item.title
              ? await this.translateService.translateText(
                  item.title,
                  targetLang.name,
                  targetLang.code,
                )
              : '',
            data: item.data ?? '',
          })),
        );
      }

      let advantages:
        | {
            title: string;
            description: string;
            expandedDescription?: string;
            picUrl?: string;
          }[]
        | null = null;
      if (
        source.advantages &&
        Array.isArray(source.advantages) &&
        source.advantages.length > 0
      ) {
        advantages = await Promise.all(
          source.advantages.map(async (item) => {
            const expanded =
              item.expandedDescription &&
              String(item.expandedDescription).trim()
                ? await this.translateService.translateText(
                    String(item.expandedDescription),
                    targetLang.name,
                    targetLang.code,
                  )
                : '';
            return {
              title: item.title
                ? await this.translateService.translateText(
                    item.title,
                    targetLang.name,
                    targetLang.code,
                  )
                : '',
              description: item.description
                ? await this.translateService.translateText(
                    item.description,
                    targetLang.name,
                    targetLang.code,
                  )
                : '',
              ...(expanded ? { expandedDescription: expanded } : {}),
              picUrl: item.picUrl,
            };
          }),
        );
      }

      const existing = await this.productRepo.findOne({
        where: {
          productId: effectiveId,
          langId,
          status: In([Status.Normal, Status.Hidden]),
        },
      });
      if (existing) {
        await this.productRepo.update(existing.id, {
          name,
          model,
          detailTitle,
          metaTitle: metaTitle ?? name,
          metaKeywords,
          metaDescription,
          summary,
          advantageSummary,
          features,
          coreParams,
          paramsJson,
          advantages,
          categoryId: targetCategoryId,
          thumbUrl: source.thumbUrl,
          mainPics: source.mainPics,
          bannerUrl: source.bannerUrl,
          certifications: source.certifications,
          status: source.status,
        } as any);
        updated += 1;
      } else {
        await this.productRepo.save(
          this.productRepo.create({
            productId: effectiveId,
            langId,
            categoryId: targetCategoryId,
            name,
            detailTitle,
            thumbUrl: source.thumbUrl,
            mainPics: source.mainPics,
            model,
            features,
            coreParams,
            summary,
            bannerUrl: source.bannerUrl,
            paramsJson,
            advantageSummary,
            advantages,
            certifications: source.certifications,
            metaTitle: metaTitle ?? name,
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
    return { created, updated, warnings };
  }

  /** 批量翻译：将多个产品（按 id）翻译到多个目标语言 */
  async translateProductBatch(
    sourceIds: number[],
    targetLangIds: number[],
  ): Promise<{
    translatedCount: number;
    created: number;
    updated: number;
    warnings: string[];
  }> {
    if (!sourceIds.length || !targetLangIds.length) {
      return { translatedCount: 0, created: 0, updated: 0, warnings: [] };
    }
    let totalCreated = 0;
    let totalUpdated = 0;
    const warnings: string[] = [];
    for (const sourceId of sourceIds) {
      try {
        const result = await this.translateProduct(sourceId, targetLangIds, {
          skipMissingTargetCategory: true,
        });
        totalCreated += result.created;
        totalUpdated += result.updated;
        warnings.push(...result.warnings);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        warnings.push(`产品 id=${sourceId}：${msg}（本条未翻译）`);
      }
    }
    await this.redis.delPattern?.('pengcheng:*');
    return {
      translatedCount: sourceIds.length,
      created: totalCreated,
      updated: totalUpdated,
      warnings,
    };
  }
}
