import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRedis } from '@nestjs-modules/ioredis';
import type Redis from 'ioredis';

export const CACHE_KEY_PREFIX = 'pengcheng:';
/** Redis 使用语言 code（如 cn、en）作为 key 后缀，不再使用 langId 或 layout 聚合 */
export const CACHE_KEYS = {
  /** menu:{code}，如 pengcheng:menu:cn */
  MENU: (code: string) => `${CACHE_KEY_PREFIX}menu:${code}`,
  /** productCategory:{code}，如 pengcheng:productCategory:cn */
  PRODUCT_CATEGORY: (code: string) =>
    `${CACHE_KEY_PREFIX}productCategory:${code}`,
  /** product:{code}，如 pengcheng:product:cn */
  PRODUCT: (code: string) => `${CACHE_KEY_PREFIX}product:${code}`,
  /** solutionCategory:{code} */
  SOLUTION_CATEGORY: (code: string) =>
    `${CACHE_KEY_PREFIX}solutionCategory:${code}`,
  /** solution:{code} */
  SOLUTION: (code: string) => `${CACHE_KEY_PREFIX}solution:${code}`,
  /** config:{code} 或 config:{code}:{key}，如 pengcheng:config:cn、pengcheng:config:cn:website-title */
  CONFIG: (code: string, key?: string) =>
    key
      ? `${CACHE_KEY_PREFIX}config:${code}:${key}`
      : `${CACHE_KEY_PREFIX}config:${code}`,
} as const;

@Injectable()
export class RedisService {
  private readonly ttl: number;

  constructor(
    @InjectRedis() private readonly redis: Redis,
    private readonly config: ConfigService,
  ) {
    this.ttl = this.config.get('redis.ttlSeconds', 7 * 24 * 60 * 60);
  }

  async get<T>(key: string): Promise<T | null> {
    const raw = await this.redis.get(key);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as T;
    } catch {
      return raw as unknown as T;
    }
  }

  async set(key: string, value: unknown, ttlSeconds?: number): Promise<void> {
    const serialized =
      typeof value === 'string' ? value : JSON.stringify(value);
    const ttl = ttlSeconds ?? this.ttl;
    if (ttl > 0) {
      await this.redis.setex(key, ttl, serialized);
    } else {
      await this.redis.set(key, serialized);
    }
  }

  async del(key: string): Promise<void> {
    await this.redis.del(key);
  }

  async delPattern(pattern: string): Promise<void> {
    const keys = await this.redis.keys(pattern);
    if (keys.length > 0) await this.redis.del(...keys);
  }

  /** 清除所有 pengcheng 缓存（配置、菜单等） */
  async clearCache(): Promise<void> {
    await this.delPattern(`${CACHE_KEY_PREFIX}*`);
  }

  /** 供 Session 使用的 Redis 客户端（可选，用于 session store） */
  getClient(): Redis {
    return this.redis;
  }

  /** 发送 Redis 心跳，保持连接活跃 */
  async ping(): Promise<void> {
    await this.redis.ping();
  }
}
