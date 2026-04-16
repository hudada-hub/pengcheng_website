import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Download } from '../../entities/download.entity';
import { DownloadCategory } from '../../entities/download-category.entity';
import { DownloadSeries } from '../../entities/download-series.entity';
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

const downloadDictStatus = In([Status.Normal, Status.Hidden]);

type CreateCtx = {
  categoryGroupId: number;
  sourceCat: DownloadCategory;
  seriesGroupId: number | null;
  sourceSeries: DownloadSeries | null;
  fileTypeGroupId: number | null;
  sourceFt: DownloadFileType | null;
};

@Injectable()
export class DownloadTranslateService {
  constructor(
    @InjectRepository(Download)
    private readonly downloadRepo: Repository<Download>,
    @InjectRepository(DownloadCategory)
    private readonly downloadCategoryRepo: Repository<DownloadCategory>,
    @InjectRepository(DownloadSeries)
    private readonly downloadSeriesRepo: Repository<DownloadSeries>,
    @InjectRepository(DownloadFileType)
    private readonly downloadFileTypeRepo: Repository<DownloadFileType>,
    @InjectRepository(Lang) private readonly langRepo: Repository<Lang>,
    private readonly translateService: DeepseekTranslateService,
    private readonly redis: RedisService,
  ) {}

  private effectiveDownloadId(source: Download): number {
    const d = source.downloadId;
    return d != null && d > 0 ? d : source.id;
  }

  /** 先按分组 id（category_id）匹配，失败则按源名称译名在目标语言下精确匹配唯一一条 */
  private async resolveTargetCategoryRow(
    sourceCat: DownloadCategory,
    categoryGroupId: number,
    langId: number,
    targetLang: Lang,
  ): Promise<DownloadCategory> {
    const row = await this.downloadCategoryRepo.findOne({
      where: {
        langId,
        categoryId: categoryGroupId,
        status: downloadDictStatus,
      },
    });
    if (row) return row;
    const rawName = (sourceCat.name ?? '').trim();
    if (rawName) {
      const translated = (
        await this.translateService.translateText(
          rawName,
          targetLang.name,
          targetLang.code,
        )
      ).trim();
      const list = await this.downloadCategoryRepo.find({
        where: { langId, name: translated, status: downloadDictStatus },
        order: { sort: 'ASC', id: 'ASC' },
        take: 3,
      });
      if (list.length === 1) return list[0];
      if (list.length > 1) {
        throw new Error(
          `目标语言下存在多条同名「资源类型」（与「${rawName}」译名相同），无法自动匹配，请调整分类名称或补全 category_id 关联`,
        );
      }
    }
    throw new Error(
      `目标语言下缺少与源对应的「资源类型」（未找到 category_id=${categoryGroupId}；按名称「${(sourceCat.name ?? '').trim() || '（空）'}」译名也未匹配到唯一项）`,
    );
  }

  private async resolveTargetSeriesRow(
    sourceSeries: DownloadSeries,
    seriesGroupId: number,
    langId: number,
    targetLang: Lang,
  ): Promise<DownloadSeries> {
    const row = await this.downloadSeriesRepo.findOne({
      where: {
        langId,
        downloadSeriesId: seriesGroupId,
        status: downloadDictStatus,
      },
    });
    if (row) return row;
    const rawName = (sourceSeries.name ?? '').trim();
    if (rawName) {
      const translated = (
        await this.translateService.translateText(
          rawName,
          targetLang.name,
          targetLang.code,
        )
      ).trim();
      const list = await this.downloadSeriesRepo.find({
        where: { langId, name: translated, status: downloadDictStatus },
        order: { sort: 'ASC', id: 'ASC' },
        take: 3,
      });
      if (list.length === 1) return list[0];
      if (list.length > 1) {
        throw new Error(
          `目标语言下存在多条同名「产品系列」（与「${rawName}」译名相同），无法自动匹配，请调整系列名称或补全 download_series_id 关联`,
        );
      }
    }
    throw new Error(
      `目标语言下缺少与源对应的「产品系列」（未找到 download_series_id=${seriesGroupId}；按名称「${(sourceSeries.name ?? '').trim() || '（空）'}」译名也未匹配到唯一项）`,
    );
  }

  private async resolveTargetFileTypeRow(
    sourceFt: DownloadFileType,
    fileTypeGroupId: number,
    langId: number,
    targetLang: Lang,
  ): Promise<DownloadFileType> {
    const row = await this.downloadFileTypeRepo.findOne({
      where: {
        langId,
        downloadFileTypeId: fileTypeGroupId,
        status: downloadDictStatus,
      },
    });
    if (row) return row;
    const rawName = (sourceFt.name ?? '').trim();
    if (rawName) {
      const translated = (
        await this.translateService.translateText(
          rawName,
          targetLang.name,
          targetLang.code,
        )
      ).trim();
      const list = await this.downloadFileTypeRepo.find({
        where: { langId, name: translated, status: downloadDictStatus },
        order: { sort: 'ASC', id: 'ASC' },
        take: 3,
      });
      if (list.length === 1) return list[0];
      if (list.length > 1) {
        throw new Error(
          `目标语言下存在多条同名「产品文件类型」（与「${rawName}」译名相同），无法自动匹配，请调整类型名称或补全 download_file_type_id 关联`,
        );
      }
    }
    throw new Error(
      `目标语言下缺少与源对应的「产品文件类型」（未找到 download_file_type_id=${fileTypeGroupId}；按名称「${(sourceFt.name ?? '').trim() || '（空）'}」译名也未匹配到唯一项）`,
    );
  }

  async getMissingLangs(
    idOrSourceId: number,
    retranslate = false,
  ): Promise<MissingLangDto[]> {
    const source = await this.downloadRepo.findOne({
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
    const effectiveId = this.effectiveDownloadId(source);
    const sameGroup = await this.downloadRepo.find({
      where: [
        { downloadId: effectiveId, status: In([Status.Normal, Status.Hidden]) },
        { id: effectiveId, status: In([Status.Normal, Status.Hidden]) },
      ],
    });
    const existingLangIds = [...new Set(sameGroup.map((d) => d.langId))];
    return allLangs
      .filter((l) => !existingLangIds.includes(l.id))
      .map((l) => ({ id: l.id, name: l.name, code: l.code }));
  }

  async translateDownload(
    sourceId: number,
    targetLangIds: number[],
  ): Promise<{ created: number; updated: number }> {
    const source = await this.downloadRepo.findOne({
      where: { id: sourceId, status: In([Status.Normal, Status.Hidden]) },
    });
    if (!source) throw new Error('源下载资源不存在');
    const effectiveId = this.effectiveDownloadId(source);

    let createCtx: CreateCtx | null = null;
    const loadCreateCtx = async (): Promise<CreateCtx> => {
      if (createCtx) return createCtx;
      const sourceCat = await this.downloadCategoryRepo.findOne({
        where: { id: source.resourceTypeId, status: downloadDictStatus },
      });
      if (!sourceCat)
        throw new Error('源资源类型不存在或已失效，请重新保存后再翻译');
      const categoryGroupId = sourceCat.categoryId ?? sourceCat.id;

      let sourceSeries: DownloadSeries | null = null;
      let seriesGroupId: number | null = null;
      if (source.seriesId != null) {
        const s = await this.downloadSeriesRepo.findOne({
          where: { id: source.seriesId, status: downloadDictStatus },
        });
        if (!s) throw new Error('源产品系列不存在或已失效');
        sourceSeries = s;
        seriesGroupId = s.downloadSeriesId ?? s.id;
      }

      let sourceFt: DownloadFileType | null = null;
      let fileTypeGroupId: number | null = null;
      if (source.downloadFileTypeId != null) {
        const ft = await this.downloadFileTypeRepo.findOne({
          where: { id: source.downloadFileTypeId, status: downloadDictStatus },
        });
        if (!ft) throw new Error('源产品文件类型不存在或已失效');
        sourceFt = ft;
        fileTypeGroupId = ft.downloadFileTypeId ?? ft.id;
      }

      createCtx = {
        categoryGroupId,
        sourceCat,
        seriesGroupId,
        sourceSeries,
        fileTypeGroupId,
        sourceFt,
      };
      return createCtx;
    };

    let created = 0;
    let updated = 0;
    for (const langId of targetLangIds) {
      if (langId === source.langId) continue;
      const targetLang = await this.langRepo.findOne({
        where: { id: langId, status: Status.Normal },
      });
      if (!targetLang) continue;

      const fileName = source.fileName
        ? await this.translateService.translateText(
            source.fileName,
            targetLang.name,
            targetLang.code,
          )
        : '';

      const existing = await this.downloadRepo.findOne({
        where: {
          downloadId: effectiveId,
          langId,
          status: In([Status.Normal, Status.Hidden]),
        },
      });

      const ctx = await loadCreateCtx();
      const targetCat = await this.resolveTargetCategoryRow(
        ctx.sourceCat,
        ctx.categoryGroupId,
        langId,
        targetLang,
      );

      let resolvedSeriesId: number | null = null;
      if (ctx.sourceSeries != null && ctx.seriesGroupId != null) {
        const ts = await this.resolveTargetSeriesRow(
          ctx.sourceSeries,
          ctx.seriesGroupId,
          langId,
          targetLang,
        );
        resolvedSeriesId = ts.id;
      }

      let resolvedFileTypeId: number | null = null;
      if (ctx.sourceFt != null && ctx.fileTypeGroupId != null) {
        const tf = await this.resolveTargetFileTypeRow(
          ctx.sourceFt,
          ctx.fileTypeGroupId,
          langId,
          targetLang,
        );
        resolvedFileTypeId = tf.id;
      }

      if (existing) {
        await this.downloadRepo.update(existing.id, {
          fileName,
          resourceTypeId: targetCat.id,
          seriesId: resolvedSeriesId,
          downloadFileTypeId: resolvedFileTypeId,
          downloadUrl: source.downloadUrl,
          status: source.status,
        } as any);
        updated += 1;
        continue;
      }

      await this.downloadRepo.save(
        this.downloadRepo.create({
          downloadId: effectiveId,
          fileName,
          resourceTypeId: targetCat.id,
          seriesId: resolvedSeriesId,
          langId,
          downloadFileTypeId: resolvedFileTypeId,
          fileType: null,
          productType: null,
          downloadUrl: source.downloadUrl,
          downloadCount: 0,
          status: source.status,
        } as any),
      );
      created += 1;
    }
    await this.redis.delPattern?.('pengcheng:*');
    return { created, updated };
  }

  async translateDownloadBatch(
    sourceIds: number[],
    targetLangIds: number[],
  ): Promise<{ translatedCount: number; created: number; updated: number }> {
    if (!sourceIds.length || !targetLangIds.length) {
      return { translatedCount: 0, created: 0, updated: 0 };
    }
    let totalCreated = 0;
    let totalUpdated = 0;
    for (const sourceId of sourceIds) {
      const result = await this.translateDownload(sourceId, targetLangIds);
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
