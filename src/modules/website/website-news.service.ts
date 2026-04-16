import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { News } from '../../entities/news.entity';
import { Status } from '../../common/entities/base.entity';

export type NewsListFilters = {
  langId: number;
  year: number | null;
  month: number | null;
  page: number;
  pageSize: number;
};

@Injectable()
export class WebsiteNewsService {
  constructor(
    @InjectRepository(News) private readonly newsRepo: Repository<News>,
  ) {}

  /** 当前语言下已发布新闻的年份（降序） */
  async listDistinctYears(langId: number): Promise<number[]> {
    const raw = await this.newsRepo
      .createQueryBuilder('n')
      .select('YEAR(n.publishAt)', 'y')
      .where('n.langId = :langId', { langId })
      .andWhere('n.status = :st', { st: Status.Normal })
      .andWhere('n.publishAt IS NOT NULL')
      .groupBy('YEAR(n.publishAt)')
      .orderBy('y', 'DESC')
      .getRawMany();
    return raw
      .map((r) => parseInt(String(r.y), 10))
      .filter((n) => Number.isFinite(n) && n > 0);
  }

  /** 指定年内有新闻的月份 1–12 */
  async listDistinctMonths(langId: number, year: number): Promise<number[]> {
    const raw = await this.newsRepo
      .createQueryBuilder('n')
      .select('MONTH(n.publishAt)', 'm')
      .where('n.langId = :langId', { langId })
      .andWhere('n.status = :st', { st: Status.Normal })
      .andWhere('n.publishAt IS NOT NULL')
      .andWhere('YEAR(n.publishAt) = :year', { year })
      .groupBy('MONTH(n.publishAt)')
      .orderBy('m', 'ASC')
      .getRawMany();
    return raw
      .map((r) => parseInt(String(r.m), 10))
      .filter((n) => Number.isFinite(n) && n >= 1 && n <= 12);
  }

  async countPublishedFiltered(f: NewsListFilters): Promise<number> {
    const qb = this.baseListQuery(f);
    return qb.getCount();
  }

  async findPublishedPage(f: NewsListFilters): Promise<News[]> {
    const qb = this.baseListQuery(f);
    qb.orderBy('n.sort', 'DESC')
      .addOrderBy('n.publishAt', 'DESC')
      .addOrderBy('n.id', 'DESC');
    qb.skip((f.page - 1) * f.pageSize).take(f.pageSize);
    return qb.getMany();
  }

  private baseListQuery(f: NewsListFilters) {
    const qb = this.newsRepo
      .createQueryBuilder('n')
      .where('n.langId = :langId', { langId: f.langId })
      .andWhere('n.status = :st', { st: Status.Normal })
      .andWhere('n.publishAt IS NOT NULL');
    if (f.year != null && f.year > 0) {
      qb.andWhere('YEAR(n.publishAt) = :year', { year: f.year });
    }
    if (
      f.month != null &&
      f.month >= 1 &&
      f.month <= 12 &&
      f.year != null &&
      f.year > 0
    ) {
      qb.andWhere('MONTH(n.publishAt) = :month', { month: f.month });
    }
    return qb;
  }

  /**
   * 详情：优先按业务 newsId + 语言；若无则按行 id（兼容旧链接）
   */
  async findPublishedDetail(
    langId: number,
    paramId: number,
  ): Promise<News | null> {
    let row = await this.newsRepo.findOne({
      where: { newsId: paramId, langId, status: Status.Normal },
    });
    if (!row) {
      row = await this.newsRepo.findOne({
        where: { id: paramId, langId, status: Status.Normal },
      });
    }
    return row;
  }

  /**
   * 返回当前新闻的上一条和下一条（按 publishAt DESC, id DESC 排序）
   */
  async findAdjacentNews(
    langId: number,
    currentNewsId: number,
  ): Promise<{ prev: News | null; next: News | null }> {
    const all = await this.newsRepo.find({
      where: { langId, status: Status.Normal },
      order: { sort: 'DESC', publishAt: 'DESC', id: 'DESC' },
    });
    const idx = all.findIndex(
      (n) => n.newsId === currentNewsId || n.id === currentNewsId,
    );
    if (idx === -1) return { prev: null, next: null };
    return {
      prev: idx > 0 ? all[idx - 1] : null,
      next: idx < all.length - 1 ? all[idx + 1] : null,
    };
  }
}
