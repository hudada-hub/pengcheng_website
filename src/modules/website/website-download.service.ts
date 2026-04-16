import { Injectable } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { Download } from '../../entities/download.entity';
import { DownloadFileRecord } from '../../entities/download-file-record.entity';
import { DownloadCategory } from '../../entities/download-category.entity';
import { DownloadSeries } from '../../entities/download-series.entity';
import { DownloadFileType } from '../../entities/download-file-type.entity';
import { Lang } from '../../entities/lang.entity';
import { Status } from '../../common/entities/base.entity';

/** 前台下载列表：与后台翻译逻辑一致，用分组 id（category_id / download_series_id / download_file_type_id）跨语言对齐 */
@Injectable()
export class WebsiteDownloadService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    @InjectRepository(Download)
    private readonly downloadRepo: Repository<Download>,
    @InjectRepository(DownloadCategory)
    private readonly downloadCategoryRepo: Repository<DownloadCategory>,
    @InjectRepository(DownloadSeries)
    private readonly downloadSeriesRepo: Repository<DownloadSeries>,
    @InjectRepository(DownloadFileType)
    private readonly downloadFileTypeRepo: Repository<DownloadFileType>,
    @InjectRepository(Lang) private readonly langRepo: Repository<Lang>,
  ) {}

  /** 规范化客户端上报的来源页 URL，拒绝非 http(s) 与危险 scheme */
  sanitizeFromPageUrl(raw: unknown): string | null {
    if (raw == null) return null;
    const s0 = String(raw).trim();
    if (!s0) return null;
    const s = s0.length > 1024 ? s0.slice(0, 1024) : s0;
    const lower = s.toLowerCase();
    if (
      lower.startsWith('javascript:') ||
      lower.startsWith('data:') ||
      lower.startsWith('vbscript:')
    ) {
      return null;
    }
    if (s.startsWith('/') && !s.startsWith('//')) return s;
    try {
      const u = new URL(s);
      if (u.protocol === 'http:' || u.protocol === 'https:') return s;
    } catch {
      return null;
    }
    return null;
  }

  /**
   * 记录一次前台下载点击，并递增对应 `download.download_count`。
   * `downloadRowId` 为表 `download` 主键。
   */
  async recordPublicDownload(params: {
    downloadRowId: number;
    fromPageUrl: string | null;
    userId: number | null;
    userAgent: string | null;
  }): Promise<{ ok: true } | { ok: false; reason: string }> {
    const { downloadRowId, fromPageUrl, userId, userAgent } = params;
    if (!Number.isFinite(downloadRowId) || downloadRowId <= 0) {
      return { ok: false, reason: 'invalid_id' };
    }
    return this.dataSource.transaction(async (em) => {
      const d = await em.findOne(Download, {
        where: { id: downloadRowId, status: Status.Normal },
      });
      if (!d) {
        return { ok: false, reason: 'not_found' };
      }
      const ua =
        userAgent && String(userAgent).trim()
          ? String(userAgent).trim().slice(0, 4096)
          : null;
      await em.save(
        em.create(DownloadFileRecord, {
          fileId: downloadRowId,
          fromPageUrl,
          userId: typeof userId === 'number' && userId > 0 ? userId : null,
          userAgent: ua,
          status: Status.Normal,
        }),
      );
      await em.increment(Download, { id: downloadRowId }, 'downloadCount', 1);
      return { ok: true };
    });
  }

  categoryGroupId(row: DownloadCategory): number {
    return row.categoryId ?? row.id;
  }

  seriesGroupId(row: DownloadSeries): number {
    return row.downloadSeriesId ?? row.id;
  }

  fileTypeGroupId(row: DownloadFileType): number {
    return row.downloadFileTypeId ?? row.id;
  }

  async findSeriesRowForLang(
    rowId: number,
    langId: number,
  ): Promise<DownloadSeries | null> {
    return this.downloadSeriesRepo.findOne({
      where: { id: rowId, langId, status: Status.Normal },
    });
  }

  async findFileTypeRowForLang(
    rowId: number,
    langId: number,
  ): Promise<DownloadFileType | null> {
    return this.downloadFileTypeRepo.findOne({
      where: { id: rowId, langId, status: Status.Normal },
    });
  }

  async listTabCategories(langId: number): Promise<DownloadCategory[]> {
    const all = await this.downloadCategoryRepo.find({
      where: { langId, status: Status.Normal },
      order: { sort: 'ASC', id: 'ASC' },
    });
    const roots = all.filter((c) => !c.parentId);
    return roots.length ? roots : all;
  }

  async listSeriesForLang(langId: number): Promise<DownloadSeries[]> {
    return this.downloadSeriesRepo.find({
      where: { langId, status: Status.Normal },
      order: { sort: 'ASC', id: 'ASC' },
    });
  }

  async listFileTypesForLang(langId: number): Promise<DownloadFileType[]> {
    return this.downloadFileTypeRepo.find({
      where: { langId, status: Status.Normal },
      order: { sort: 'ASC', id: 'ASC' },
    });
  }

  async listActiveLangs(): Promise<Lang[]> {
    return this.langRepo.find({
      where: { status: Status.Normal },
      order: { id: 'ASC' },
    });
  }

  private async resolveCategoryRowIds(
    groupId: number,
    langId: number,
  ): Promise<number[]> {
    const rows = await this.downloadCategoryRepo.find({
      where: [
        { langId, status: Status.Normal, categoryId: groupId },
        { langId, status: Status.Normal, id: groupId },
      ],
    });
    return [...new Set(rows.map((r) => r.id))];
  }

  private async resolveSeriesRowIds(
    groupId: number,
    langId: number,
  ): Promise<number[]> {
    const rows = await this.downloadSeriesRepo.find({
      where: [
        { langId, status: Status.Normal, downloadSeriesId: groupId },
        { langId, status: Status.Normal, id: groupId },
      ],
    });
    return [...new Set(rows.map((r) => r.id))];
  }

  private async resolveFileTypeRowIds(
    groupId: number,
    langId: number,
  ): Promise<number[]> {
    const rows = await this.downloadFileTypeRepo.find({
      where: [
        { langId, status: Status.Normal, downloadFileTypeId: groupId },
        { langId, status: Status.Normal, id: groupId },
      ],
    });
    return [...new Set(rows.map((r) => r.id))];
  }

  async findPublicDownloads(params: {
    docLangId: number;
    categoryGroupId: number | null;
    seriesGroupId: number | null;
    fileTypeGroupId: number | null;
    page?: number;
    pageSize?: number;
  }): Promise<{ rows: Download[]; total: number }> {
    const { docLangId, categoryGroupId, seriesGroupId, fileTypeGroupId, page = 1, pageSize = 20 } = params;

    let resourceTypeIds: number[] | null = null;
    if (categoryGroupId != null) {
      resourceTypeIds = await this.resolveCategoryRowIds(
        categoryGroupId,
        docLangId,
      );
      if (!resourceTypeIds.length) return { rows: [], total: 0 };
    }

    let seriesIds: number[] | null = null;
    if (seriesGroupId != null) {
      seriesIds = await this.resolveSeriesRowIds(seriesGroupId, docLangId);
      if (!seriesIds.length) return { rows: [], total: 0 };
    }

    let fileTypeIds: number[] | null = null;
    if (fileTypeGroupId != null) {
      fileTypeIds = await this.resolveFileTypeRowIds(
        fileTypeGroupId,
        docLangId,
      );
      if (!fileTypeIds.length) return { rows: [], total: 0 };
    }

    const qb = this.downloadRepo
      .createQueryBuilder('d')
      .leftJoinAndSelect('d.series', 'series')
      .leftJoinAndSelect('d.downloadFileType', 'ft')
      .leftJoinAndSelect('d.lang', 'lang')
      .where('d.status = :st', { st: Status.Normal })
      .andWhere('d.lang_id = :docLang', { docLang: docLangId })
      .orderBy('d.id', 'DESC');

    if (resourceTypeIds?.length) {
      qb.andWhere('d.resource_type_id IN (:...rids)', {
        rids: resourceTypeIds,
      });
    }

    if (seriesIds?.length) {
      qb.andWhere('d.series_id IN (:...sids)', { sids: seriesIds });
    }

    if (fileTypeIds?.length) {
      qb.andWhere('d.download_file_type_id IN (:...fids)', {
        fids: fileTypeIds,
      });
    }

    const total = await qb.getCount();
    const rows = await qb.skip((page - 1) * pageSize).take(pageSize).getMany();
    return { rows, total };
  }
}
