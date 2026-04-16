import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { In } from 'typeorm';
import { ActivityCalendar } from '../../entities/activity-calendar.entity';
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
export class ActivityCalendarTranslateService {
  constructor(
    @InjectRepository(ActivityCalendar)
    private readonly repo: Repository<ActivityCalendar>,
    @InjectRepository(Lang) private readonly langRepo: Repository<Lang>,
    private readonly translateService: DeepseekTranslateService,
    private readonly redis: RedisService,
  ) {}

  async getMissingLangs(
    idOrSourceId: number,
    retranslate = false,
  ): Promise<MissingLangDto[]> {
    const source = await this.repo.findOne({
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
    const effectiveId = source.activityCalendarId ?? source.id;
    const sameGroup = await this.repo.find({
      where: [
        {
          activityCalendarId: effectiveId,
          status: In([Status.Normal, Status.Hidden]),
        },
        { id: effectiveId, status: In([Status.Normal, Status.Hidden]) },
      ],
    });
    const existingLangIds = [...new Set(sameGroup.map((a) => a.langId))];
    return allLangs
      .filter((l) => !existingLangIds.includes(l.id))
      .map((l) => ({ id: l.id, name: l.name, code: l.code }));
  }

  async translateActivityCalendar(
    sourceId: number,
    targetLangIds: number[],
  ): Promise<{ created: number; updated: number }> {
    const source = await this.repo.findOne({
      where: { id: sourceId, status: In([Status.Normal, Status.Hidden]) },
    });
    if (!source) throw new Error('源活动不存在');
    const effectiveId = source.activityCalendarId ?? source.id;

    let created = 0;
    let updated = 0;
    for (const langId of targetLangIds) {
      if (langId === source.langId) continue;
      const targetLang = await this.langRepo.findOne({
        where: { id: langId, status: Status.Normal },
      });
      if (!targetLang) continue;

      const [translatedTitle, translatedLocation, translatedContent] =
        await Promise.all([
          source.title
            ? this.translateService.translateText(
                source.title,
                targetLang.name,
                targetLang.code,
              )
            : null,
          source.location
            ? this.translateService.translateText(
                source.location,
                targetLang.name,
                targetLang.code,
              )
            : null,
          source.content?.trim()
            ? this.translateService.translateHtml(
                source.content,
                targetLang.name,
                targetLang.code,
              )
            : Promise.resolve(null as string | null),
        ]);

      const existing = await this.repo.findOne({
        where: {
          activityCalendarId: effectiveId,
          langId,
          status: In([Status.Normal, Status.Hidden]),
        },
      });
      if (existing) {
        await this.repo.update(existing.id, {
          title: translatedTitle,
          location: translatedLocation,
          content: translatedContent,
          thumbUrl: source.thumbUrl,
          eventDateStart: source.eventDateStart,
          eventDateEnd: source.eventDateEnd,
          url: source.url,
          viewCount: source.viewCount,
          status: source.status,
          isTop: source.isTop,
        } as any);
        updated += 1;
      } else {
        await this.repo.save(
          this.repo.create({
            activityCalendarId: effectiveId,
            langId,
            thumbUrl: source.thumbUrl,
            eventDateStart: source.eventDateStart,
            eventDateEnd: source.eventDateEnd,
            title: translatedTitle,
            location: translatedLocation,
            content: translatedContent,
            url: source.url,
            viewCount: source.viewCount,
            status: source.status,
            isTop: source.isTop,
          }),
        );
        created += 1;
      }
    }
    await this.redis.delPattern?.('pengcheng:*');
    return { created, updated };
  }

  /** 批量翻译：将多个活动（按 id）翻译到多个目标语言 */
  async translateActivityCalendarBatch(
    sourceIds: number[],
    targetLangIds: number[],
  ): Promise<{ translatedCount: number; created: number; updated: number }> {
    if (!sourceIds.length || !targetLangIds.length) {
      return { translatedCount: 0, created: 0, updated: 0 };
    }
    let totalCreated = 0;
    let totalUpdated = 0;
    for (const sourceId of sourceIds) {
      const result = await this.translateActivityCalendar(
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
