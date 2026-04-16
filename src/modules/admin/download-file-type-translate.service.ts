import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { DownloadFileType } from '../../entities/download-file-type.entity';
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
export class DownloadFileTypeTranslateService {
  constructor(
    @InjectRepository(DownloadFileType)
    private readonly downloadFileTypeRepo: Repository<DownloadFileType>,
    @InjectRepository(Lang) private readonly langRepo: Repository<Lang>,
    private readonly translateService: DeepseekTranslateService,
    private readonly redis: RedisService,
  ) {}

  async getMissingLangs(
    idOrSourceId: number,
    retranslate = false,
  ): Promise<MissingLangDto[]> {
    const source = await this.downloadFileTypeRepo.findOne({
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
    const effectiveId = source.downloadFileTypeId ?? source.id;
    const sameGroup = await this.downloadFileTypeRepo.find({
      where: [
        {
          downloadFileTypeId: effectiveId,
          status: In([Status.Normal, Status.Hidden]),
        },
        { id: effectiveId, status: In([Status.Normal, Status.Hidden]) },
      ],
    });
    const existingLangIds = [...new Set(sameGroup.map((r) => r.langId))];
    return allLangs
      .filter((l) => !existingLangIds.includes(l.id))
      .map((l) => ({ id: l.id, name: l.name, code: l.code }));
  }

  async translateDownloadFileType(
    sourceId: number,
    targetLangIds: number[],
  ): Promise<{ created: number; updated: number }> {
    const source = await this.downloadFileTypeRepo.findOne({
      where: { id: sourceId, status: In([Status.Normal, Status.Hidden]) },
    });
    if (!source) throw new Error('源产品文件类型不存在');
    const effectiveId = source.downloadFileTypeId ?? source.id;

    let created = 0;
    let updated = 0;
    for (const langId of targetLangIds) {
      if (langId === source.langId) continue;
      const targetLang = await this.langRepo.findOne({
        where: { id: langId, status: Status.Normal },
      });
      if (!targetLang) continue;

      const name = source.name
        ? await this.translateService.translateText(
            source.name,
            targetLang.name,
            targetLang.code,
          )
        : '';

      const existing = await this.downloadFileTypeRepo.findOne({
        where: {
          downloadFileTypeId: effectiveId,
          langId,
          status: In([Status.Normal, Status.Hidden]),
        },
      });
      if (existing) {
        await this.downloadFileTypeRepo.update(existing.id, {
          name,
          sort: source.sort,
          status: source.status,
        } as any);
        updated += 1;
      } else {
        await this.downloadFileTypeRepo.save(
          this.downloadFileTypeRepo.create({
            downloadFileTypeId: effectiveId,
            langId,
            name,
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

  async translateDownloadFileTypeBatch(
    sourceIds: number[],
    targetLangIds: number[],
  ): Promise<{ translatedCount: number; created: number; updated: number }> {
    if (!sourceIds.length || !targetLangIds.length) {
      return { translatedCount: 0, created: 0, updated: 0 };
    }
    let totalCreated = 0;
    let totalUpdated = 0;
    for (const sourceId of sourceIds) {
      const result = await this.translateDownloadFileType(
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
