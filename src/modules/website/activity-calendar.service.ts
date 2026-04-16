import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ActivityCalendar } from '../../entities/activity-calendar.entity';
import { Status } from '../../common/entities/base.entity';

export type ActivityCalendarListFilters = {
  langId: number;
  year: number | null;
  month: number | null;
  page: number;
  pageSize: number;
};

@Injectable()
export class ActivityCalendarService {
  constructor(
    @InjectRepository(ActivityCalendar)
    private readonly repo: Repository<ActivityCalendar>,
  ) {}

  async listDistinctYears(langId: number): Promise<number[]> {
    const raw = await this.repo
      .createQueryBuilder('e')
      .select('YEAR(e.eventDateStart)', 'y')
      .where('e.langId = :langId', { langId })
      .andWhere('e.status = :st', { st: Status.Normal })
      .andWhere('e.eventDateStart IS NOT NULL')
      .groupBy('YEAR(e.eventDateStart)')
      .orderBy('y', 'DESC')
      .getRawMany();
    return raw
      .map((r) => parseInt(String(r.y), 10))
      .filter((n) => Number.isFinite(n) && n > 0);
  }

  async listDistinctMonthsForYear(
    langId: number,
    year: number,
  ): Promise<number[]> {
    const raw = await this.repo
      .createQueryBuilder('e')
      .select('MONTH(e.eventDateStart)', 'm')
      .where('e.langId = :langId', { langId })
      .andWhere('e.status = :st', { st: Status.Normal })
      .andWhere('e.eventDateStart IS NOT NULL')
      .andWhere('YEAR(e.eventDateStart) = :year', { year })
      .groupBy('MONTH(e.eventDateStart)')
      .orderBy('m', 'ASC')
      .getRawMany();
    return raw
      .map((r) => parseInt(String(r.m), 10))
      .filter((n) => Number.isFinite(n) && n >= 1 && n <= 12);
  }

  async countFiltered(f: ActivityCalendarListFilters): Promise<number> {
    return this.baseListQuery(f).getCount();
  }

  async findPage(f: ActivityCalendarListFilters): Promise<ActivityCalendar[]> {
    const qb = this.baseListQuery(f);
    qb.orderBy('e.sort', 'DESC')
      .addOrderBy('e.eventDateStart', 'DESC')
      .addOrderBy('e.id', 'DESC');
    qb.skip((f.page - 1) * f.pageSize).take(f.pageSize);
    return qb.getMany();
  }

  private baseListQuery(f: ActivityCalendarListFilters) {
    const qb = this.repo
      .createQueryBuilder('e')
      .where('e.langId = :langId', { langId: f.langId })
      .andWhere('e.status = :st', { st: Status.Normal })
      .andWhere('e.eventDateStart IS NOT NULL');
    if (f.year != null && f.year > 0) {
      qb.andWhere('YEAR(e.eventDateStart) = :year', { year: f.year });
    }
    if (
      f.month != null &&
      f.month >= 1 &&
      f.month <= 12 &&
      f.year != null &&
      f.year > 0
    ) {
      qb.andWhere('MONTH(e.eventDateStart) = :month', { month: f.month });
    }
    return qb;
  }

  /**
   * 详情：优先 activityCalendarId + 语言；否则按行 id（兼容）
   */
  async findPublishedDetail(
    langId: number,
    paramId: number,
  ): Promise<ActivityCalendar | null> {
    let row = await this.repo.findOne({
      where: { activityCalendarId: paramId, langId, status: Status.Normal },
    });
    if (!row) {
      row = await this.repo.findOne({
        where: { id: paramId, langId, status: Status.Normal },
      });
    }
    return row;
  }
}
