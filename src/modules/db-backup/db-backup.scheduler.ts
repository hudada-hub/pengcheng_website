import { Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { DbBackupService } from './db-backup.service.js';

@Injectable()
export class DbBackupScheduler {
  private readonly logger = new Logger(DbBackupScheduler.name);
  private running = false;

  constructor(private readonly backups: DbBackupService) {}

  // 每 2 天备份一次（Interval 会在应用启动后开始计时）
  @Interval(2 * 24 * 60 * 60 * 1000)
  async backupEveryTwoDays() {
    if (this.running) return;
    this.running = true;
    try {
      await this.backups.createBackup('schedule');
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      this.logger.error(`定时备份失败：${msg}`);
    } finally {
      this.running = false;
    }
  }
}
