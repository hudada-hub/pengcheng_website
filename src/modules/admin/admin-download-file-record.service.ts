import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { DownloadFileRecord } from '../../entities/download-file-record.entity';
import { Lang } from '../../entities/lang.entity';
import { Status } from '../../common/entities/base.entity';

@Injectable()
export class AdminDownloadFileRecordService {
  constructor(
    @InjectRepository(DownloadFileRecord)
    private readonly repo: Repository<DownloadFileRecord>,
    @InjectRepository(Lang) private readonly langRepo: Repository<Lang>,
  ) {}

  async findPage(params: {
    docLangId?: number;
    page: number;
    pageSize: number;
  }): Promise<{
    rows: DownloadFileRecord[];
    total: number;
  }> {
    const st = [Status.Normal, Status.Hidden];
    const countQb = this.repo
      .createQueryBuilder('r')
      .where('r.status IN (:...st)', { st });
    if (params.docLangId != null && params.docLangId > 0) {
      countQb
        .innerJoin('r.file', 'f')
        .andWhere('f.lang_id = :lid', { lid: params.docLangId });
    }
    const total = await countQb.getCount();

    const dataQb = this.repo
      .createQueryBuilder('r')
      .leftJoinAndSelect('r.file', 'f')
      .leftJoinAndSelect('f.lang', 'fl')
      .where('r.status IN (:...st)', { st })
      .orderBy('r.id', 'DESC');
    if (params.docLangId != null && params.docLangId > 0) {
      dataQb.andWhere('f.lang_id = :lid', { lid: params.docLangId });
    }
    const rows = await dataQb
      .skip((params.page - 1) * params.pageSize)
      .take(params.pageSize)
      .getMany();
    return { rows, total };
  }

  /** 条形图：按资料所属语言汇总下载次数 */
  async getChartRowsByDocLang(): Promise<
    { langId: number; name: string; value: number }[]
  > {
    const raw = await this.repo
      .createQueryBuilder('r')
      .select('f.lang_id', 'langId')
      .addSelect('COUNT(r.id)', 'cnt')
      .innerJoin('r.file', 'f')
      .where('r.status IN (:...st)', { st: [Status.Normal, Status.Hidden] })
      .groupBy('f.lang_id')
      .getRawMany();
    const langs = await this.langRepo.find({
      where: { status: In([Status.Normal, Status.Hidden]) },
      order: { id: 'ASC' },
    });
    const langMap = new Map(langs.map((l) => [l.id, l]));
    return raw
      .map((row) => {
        const lid = parseInt(String(row.langId), 10);
        const l = langMap.get(lid);
        const name = l ? `${l.name} (${l.code})` : `lang ${lid}`;
        return { langId: lid, name, value: parseInt(String(row.cnt), 10) || 0 };
      })
      .sort((a, b) => b.value - a.value);
  }

  async listLangOptionsForFilter(): Promise<{ id: number; label: string }[]> {
    const langs = await this.langRepo.find({
      where: { status: In([Status.Normal, Status.Hidden]) },
      order: { id: 'ASC' },
    });
    return langs.map((l) => ({ id: l.id, label: `${l.name} (${l.code})` }));
  }
}
