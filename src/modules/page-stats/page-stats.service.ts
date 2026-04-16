import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PageStats } from '../../entities/page-stats.entity';
import { PageVisitLog } from '../../entities/page-visit-log.entity';
import { Status } from '../../common/entities/base.entity';
import { RedisService } from '../redis/redis.service';
import {
  shanghaiYmdCompact,
  ttlSecondsUntilShanghaiNext005,
} from './page-view-shanghai.util';
import {
  hashNormalizedPageUrl,
  normalizePageUrlForDedupe,
  truncatePageUrlForDb,
} from './page-view-url.util';

const PV_PREFIX = 'pengcheng:pageview:';
const BAN_TTL_SEC = 7 * 24 * 60 * 60;
const RL_SEC = 1;
const DEDUP_SEC = 120;
const MAX_REQUESTS_PER_DAY = 1000;

export type PageViewRecordReason =
  | 'bad_request'
  | 'redis_down'
  | 'banned'
  | 'rate_limited'
  | 'deduped';

export type PageViewRecordResult =
  | { ok: true; counted: true }
  | { ok: true; counted: false; reason: 'deduped' }
  | { ok: false; reason: PageViewRecordReason };

@Injectable()
export class PageStatsService {
  private readonly log = new Logger(PageStatsService.name);

  constructor(
    @InjectRepository(PageStats) private readonly repo: Repository<PageStats>,
    @InjectRepository(PageVisitLog)
    private readonly visitRepo: Repository<PageVisitLog>,
    private readonly redisService: RedisService,
  ) {}

  async recordView(
    langId: number,
    pageType: string,
    memberUserId?: number | null,
  ): Promise<void> {
    let row = await this.repo.findOne({ where: { langId, pageType } });
    if (!row) {
      row = this.repo.create({
        langId,
        pageType,
        viewCount: 0,
        userId:
          memberUserId != null && memberUserId > 0
            ? Math.floor(memberUserId)
            : null,
      });
      await this.repo.save(row);
    }
    await this.repo.increment({ id: row.id }, 'viewCount', 1);
    const patch: { lastViewAt: Date; userId?: number | null } = {
      lastViewAt: new Date(),
    };
    if (memberUserId != null && memberUserId > 0) {
      patch.userId = Math.floor(memberUserId);
    }
    await this.repo.update(row.id, patch);
  }

  async getStats(langId?: number): Promise<PageStats[]> {
    const qb = this.repo.createQueryBuilder('p').orderBy('p.viewCount', 'DESC');
    if (langId != null) qb.where('p.langId = :langId', { langId });
    return qb.getMany();
  }

  /** 后台汇总：按访问量降序；传 langId 时仅该语言 */
  async findAllAggregatedStats(langId?: number): Promise<PageStats[]> {
    const qb = this.repo
      .createQueryBuilder('p')
      .orderBy('p.viewCount', 'DESC')
      .addOrderBy('p.id', 'ASC');
    if (langId != null && langId > 0) {
      qb.andWhere('p.langId = :langId', { langId });
    }
    return qb.getMany();
  }

  /** 某语言 + 页面类型 的访问明细（分页） */
  async findVisitLogsByLangAndPageType(
    langId: number,
    pageType: string,
    page: number,
    pageSize: number,
  ): Promise<{ rows: PageVisitLog[]; total: number }> {
    const qb = this.visitRepo
      .createQueryBuilder('v')
      .where('v.status IN (:...st)', { st: [Status.Normal, Status.Hidden] })
      .andWhere('v.langId = :langId', { langId })
      .andWhere('v.pageType = :pageType', { pageType })
      .orderBy('v.id', 'DESC');
    const total = await qb.getCount();
    const rows = await qb
      .skip((page - 1) * pageSize)
      .take(pageSize)
      .getMany();
    return { rows, total };
  }

  async findVisitLogsPage(
    page: number,
    pageSize: number,
  ): Promise<{ rows: PageVisitLog[]; total: number }> {
    const qb = this.visitRepo
      .createQueryBuilder('v')
      .where('v.status IN (:...st)', { st: [Status.Normal, Status.Hidden] })
      .orderBy('v.id', 'DESC');
    const total = await qb.getCount();
    const rows = await qb
      .skip((page - 1) * pageSize)
      .take(pageSize)
      .getMany();
    return { rows, total };
  }

  /**
   * 公开上报：Redis 门禁 + 明细 + 聚合（顺序见 design spec）
   */
  async tryRecordPageView(params: {
    langId: unknown;
    pageUrl: unknown;
    pageType: unknown;
    browserHint?: unknown;
    clientIp: string;
    userAgent: string | null;
    /** 前台用户 website_user.id */
    userId?: unknown;
  }): Promise<PageViewRecordResult> {
    const langId = params.langId;
    const pageUrlRaw = params.pageUrl;
    const pageTypeRaw = params.pageType;

    if (
      typeof langId !== 'number' ||
      !Number.isFinite(langId) ||
      langId < 1 ||
      typeof pageUrlRaw !== 'string' ||
      !pageUrlRaw.trim() ||
      typeof pageTypeRaw !== 'string' ||
      !pageTypeRaw.trim() ||
      pageTypeRaw.length > 64
    ) {
      return { ok: false, reason: 'bad_request' };
    }

    const pageType = pageTypeRaw.trim();
    const normalizedUrl = normalizePageUrlForDedupe(pageUrlRaw);
    const urlHash = hashNormalizedPageUrl(normalizedUrl);
    const pageUrlDb = truncatePageUrlForDb(pageUrlRaw);

    const browserHint =
      typeof params.browserHint === 'string' && params.browserHint.trim()
        ? params.browserHint.trim().slice(0, 128)
        : null;

    const rawUid = params.userId;
    let memberUserIdOrNull: number | null = null;
    if (typeof rawUid === 'number' && Number.isFinite(rawUid) && rawUid > 0) {
      memberUserIdOrNull = Math.floor(rawUid);
    } else if (typeof rawUid === 'string' && rawUid.trim()) {
      const n = parseInt(rawUid.trim(), 10);
      if (Number.isFinite(n) && n > 0) memberUserIdOrNull = n;
    }

    const redis = this.redisService.getClient();
    const ip = params.clientIp || '0.0.0.0';

    try {
      const banKey = `${PV_PREFIX}ban:${ip}`;
      const banned = await redis.exists(banKey);
      if (banned) {
        return { ok: false, reason: 'banned' };
      }

      const rlKey = `${PV_PREFIX}rl:${ip}`;
      const rlOk = await redis.set(rlKey, '1', 'EX', RL_SEC, 'NX');
      if (rlOk !== 'OK') {
        return { ok: false, reason: 'rate_limited' };
      }

      const ymd = shanghaiYmdCompact();
      const dayKey = `${PV_PREFIX}day:${ymd}:${ip}`;
      const dayCount = await redis.incr(dayKey);
      if (dayCount === 1) {
        await redis.expire(dayKey, ttlSecondsUntilShanghaiNext005());
      }
      if (dayCount > MAX_REQUESTS_PER_DAY) {
        await redis.set(banKey, '1', 'EX', BAN_TTL_SEC);
        return { ok: false, reason: 'banned' };
      }

      const dedupeKey = `${PV_PREFIX}dedupe:${ip}:${langId}:${urlHash}`;
      const dedupeOk = await redis.set(dedupeKey, '1', 'EX', DEDUP_SEC, 'NX');
      if (dedupeOk !== 'OK') {
        return { ok: true, counted: false, reason: 'deduped' };
      }

      try {
        const logRow = this.visitRepo.create({
          langId,
          pageUrl: pageUrlDb,
          pageType,
          clientIp: ip.slice(0, 64),
          userAgent: params.userAgent,
          browserHint,
          userId: memberUserIdOrNull,
          status: Status.Normal,
        });
        await this.visitRepo.save(logRow);
        await this.recordView(langId, pageType, memberUserIdOrNull);
      } catch (dbErr) {
        await redis.del(dedupeKey).catch(() => undefined);
        this.log.error(`page view db error: ${(dbErr as Error).message}`);
        return { ok: false, reason: 'bad_request' };
      }
      return { ok: true, counted: true };
    } catch (e) {
      this.log.warn(`page view redis error: ${(e as Error).message}`);
      return { ok: false, reason: 'redis_down' };
    }
  }
}
