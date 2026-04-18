import { Injectable, Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { RedisService } from '../redis/redis.service';

@Injectable()
export class DbHeartbeatService {
  private readonly logger = new Logger(DbHeartbeatService.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly redisService: RedisService,
  ) {}

  /**
   * 发送数据库心跳，保持连接活跃
   */
  async sendHeartbeat(): Promise<void> {
    try {
      await this.dataSource.query('SELECT 1');
      this.logger.debug('数据库心跳发送成功');
    } catch (error) {
      this.logger.warn(`数据库心跳发送失败: ${error.message}`);
    }

    try {
      await this.redisService.ping();
      this.logger.debug('Redis心跳发送成功');
    } catch (error) {
      this.logger.warn(`Redis心跳发送失败: ${error.message}`);
    }
  }
}
