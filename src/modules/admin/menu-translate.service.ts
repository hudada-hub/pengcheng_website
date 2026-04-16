import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Menu } from '../../entities/menu.entity';
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
export class MenuTranslateService {
  constructor(
    @InjectRepository(Menu) private readonly menuRepo: Repository<Menu>,
    @InjectRepository(Lang) private readonly langRepo: Repository<Lang>,
    private readonly translateService: DeepseekTranslateService,
    private readonly redis: RedisService,
  ) {}

  /** 获取同一 menuId 下缺失的语言（可翻译目标）；retranslate 为 true 时返回除源语言外的所有语言，用于重新翻译 */
  async getMissingLangs(
    menuIdOrSourceId: number,
    retranslate = false,
  ): Promise<MissingLangDto[]> {
    const source = await this.menuRepo.findOne({
      where: {
        id: menuIdOrSourceId,
        status: In([Status.Normal, Status.Hidden]),
      },
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
    const sameGroup = await this.menuRepo.find({
      where: {
        menuId: source.menuId,
        status: In([Status.Normal, Status.Hidden]),
      },
    });
    const existingLangIds = [...new Set(sameGroup.map((m) => m.langId))];
    return allLangs
      .filter((l) => !existingLangIds.includes(l.id))
      .map((l) => ({ id: l.id, name: l.name, code: l.code }));
  }

  /** 与翻译无关的字段：从源行原样复制（含图标、链接、Banner 图、排序、状态等） */
  private applyNonTranslatedFieldsFromSource(target: Menu, source: Menu): void {
    target.sortOrder = source.sortOrder;
    target.status = source.status;
    target.menuPicUrl = MenuTranslateService.copyNullableString(
      source.menuPicUrl,
    );
    target.linkUrl = MenuTranslateService.copyNullableString(source.linkUrl);
    target.bannerUrl = MenuTranslateService.copyNullableString(
      source.bannerUrl,
    );
  }

  private static copyNullableString(
    v: string | null | undefined,
  ): string | null {
    if (v == null) return null;
    const t = String(v).trim();
    return t.length ? t : null;
  }

  /**
   * 翻译菜单到目标语言：翻译 name、bannerTitle、bannerDesc、meta*；
   * 其余字段一律从源菜单复制（menuPicUrl、linkUrl、bannerUrl、sortOrder、status 等）。
   */
  async translateMenu(
    sourceMenuId: number,
    targetLangIds: number[],
  ): Promise<{ created: number; updated: number }> {
    const source = await this.menuRepo.findOne({
      where: { id: sourceMenuId, status: In([Status.Normal, Status.Hidden]) },
      relations: ['lang'],
    });
    if (!source) throw new Error('源菜单不存在');
    const effectiveMenuId = source.menuId;

    let created = 0;
    let updated = 0;
    for (const langId of targetLangIds) {
      if (langId === source.langId) continue;
      const targetLang = await this.langRepo.findOne({
        where: { id: langId, status: Status.Normal },
      });
      if (!targetLang) continue;

      const [
        name,
        bannerTitle,
        bannerDesc,
        metaTitle,
        metaKeywords,
        metaDescription,
      ] = await Promise.all([
        source.name
          ? this.translateService.translateText(
              source.name,
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
        source.metaTitle
          ? this.translateService.translateText(
              source.metaTitle,
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

      let parentId = 0;
      if (source.parentId) {
        const sourceParent = await this.menuRepo.findOne({
          where: {
            id: source.parentId,
            status: In([Status.Normal, Status.Hidden]),
          },
        });
        if (sourceParent) {
          let targetParent = await this.menuRepo.findOne({
            where: {
              menuId: sourceParent.menuId,
              langId,
              status: In([Status.Normal, Status.Hidden]),
            },
          });
          if (!targetParent) {
            await this.translateMenu(sourceParent.id, [langId]);
            targetParent = await this.menuRepo.findOne({
              where: {
                menuId: sourceParent.menuId,
                langId,
                status: In([Status.Normal, Status.Hidden]),
              },
            });
          }
          if (targetParent) parentId = targetParent.id;
        }
      }

      const existing = await this.menuRepo.findOne({
        where: {
          menuId: effectiveMenuId,
          langId,
          status: In([Status.Normal, Status.Hidden]),
        },
      });
      if (existing) {
        existing.name = name;
        existing.parentId = parentId;
        existing.bannerTitle = bannerTitle;
        existing.bannerDesc = bannerDesc;
        existing.metaTitle = metaTitle;
        existing.metaKeywords = metaKeywords;
        existing.metaDescription = metaDescription;
        this.applyNonTranslatedFieldsFromSource(existing, source);
        await this.menuRepo.save(existing);
        updated += 1;
      } else {
        const row = this.menuRepo.create({
          menuId: effectiveMenuId,
          langId,
          name,
          parentId,
          bannerTitle,
          bannerDesc,
          metaTitle,
          metaKeywords,
          metaDescription,
        });
        this.applyNonTranslatedFieldsFromSource(row, source);
        await this.menuRepo.save(row);
        created += 1;
      }
    }
    await this.redis.delPattern?.('pengcheng:menu:*');
    return { created, updated };
  }

  /** 批量翻译：将多个菜单（按 id）翻译到多个目标语言 */
  async translateMenuBatch(
    sourceIds: number[],
    targetLangIds: number[],
  ): Promise<{ translatedCount: number; created: number; updated: number }> {
    if (!sourceIds.length || !targetLangIds.length) {
      return { translatedCount: 0, created: 0, updated: 0 };
    }
    let totalCreated = 0;
    let totalUpdated = 0;
    for (const sourceId of sourceIds) {
      const result = await this.translateMenu(sourceId, targetLangIds);
      totalCreated += result.created;
      totalUpdated += result.updated;
    }
    await this.redis.delPattern?.('pengcheng:menu:*');
    return {
      translatedCount: sourceIds.length,
      created: totalCreated,
      updated: totalUpdated,
    };
  }
}
