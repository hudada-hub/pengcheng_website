import { Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { DbHeartbeatService } from './db-heartbeat.service.js';

@Injectable()
export class DbHeartbeatScheduler {
  private readonly logger = new Logger(DbHeartbeatScheduler.name);
  private running = false;

  constructor(private readonly heartbeatService: DbHeartbeatService) {}

  // 每 1 分钟发送一次心跳，保持连接活跃
  @Interval(1 * 60 * 1000)
  async sendHeartbeatEveryMinute() {
    if (this.running) return;
    this.running = true;
    try {
      await this.heartbeatService.sendHeartbeat();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      this.logger.error(`数据库心跳任务失败：${msg}`);
    } finally {
      this.running = false;
    }
  }
}
