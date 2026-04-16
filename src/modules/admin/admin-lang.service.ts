import { Injectable, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Lang } from '../../entities/lang.entity';
import { Status } from '../../common/entities/base.entity';
import { RedisService } from '../redis/redis.service';

@Injectable()
export class AdminLangService implements OnModuleInit {
  private readonly DEFAULT_LANG_KEY = 'pengcheng:admin:defaultLangId';

  constructor(
    @InjectRepository(Lang)
    private readonly langRepo: Repository<Lang>,
    private readonly redis: RedisService,
  ) {}

  /** 模块初始化时，将默认语言 ID 缓存到 Redis */
  async onModuleInit() {
    await this.refreshDefaultLangId();
  }

  /** 从数据库获取默认语言 ID 并缓存到 Redis（与后台「是否默认」一致；勿优先写死 cn，否则会忽略 isDefault） */
  async refreshDefaultLangId(): Promise<number> {
    const langs = await this.langRepo.find({
      where: { status: Status.Normal },
      order: { id: 'ASC' },
    });
    const defaultLang =
      langs.find((l) => l.isDefault === 1) ??
      langs.find((l) => l.code === 'cn') ??
      langs.find((l) => l.code === 'zh') ??
      langs[0];
    const defaultLangId = defaultLang?.id ?? (langs.length ? langs[0].id : 0);

    // 缓存到 Redis，7 天过期
    await this.redis.set(
      this.DEFAULT_LANG_KEY,
      String(defaultLangId),
      60 * 60 * 24 * 7,
    );

    return defaultLangId;
  }

  /** 从 Redis 获取默认语言 ID，如果没有则重新缓存 */
  async getDefaultLangId(): Promise<number> {
    const cached = await this.redis.get(this.DEFAULT_LANG_KEY);
    if (cached) {
      return parseInt(String(cached), 10);
    }
    // 如果缓存不存在，重新从数据库获取并缓存
    return this.refreshDefaultLangId();
  }

  /** 从 Redis 获取默认语言 ID（同步方法，如果缓存不存在返回 0） */
  async getDefaultLangIdOrZero(): Promise<number> {
    const cached = await this.redis.get(this.DEFAULT_LANG_KEY);
    return cached ? parseInt(String(cached), 10) : 0;
  }
}
