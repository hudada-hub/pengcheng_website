import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import { DbBackupService } from './db-backup.service.js';

/**
 * 生产环境不使用 docker-compose 时：
 * - 程序首次启动（库为空/无 lang 数据）时自动从 storage/db-backups 恢复最新 .sql
 */
@Injectable()
export class DbBackupFirstRestoreService implements OnModuleInit {
  private readonly logger = new Logger(DbBackupFirstRestoreService.name);

  constructor(
    private readonly backups: DbBackupService,
    private readonly config: ConfigService,
    private readonly dataSource: DataSource,
  ) {}

  async onModuleInit() {
    // 仅在 production 且显式允许时执行（避免误覆盖开发/测试数据）
    // 你如果希望生产也强制开启，把下面条件改掉即可。
    if (process.env.NODE_ENV !== 'production') return;
    if (this.config.get<string>('DB_RESTORE_ON_FIRST_START') === 'false')
      return;

    const database = this.config.get<string>('database.database');
    if (!database) {
      this.logger.warn('DB restore skipped: database.database 未配置');
      return;
    }

    try {
      const tablesCount = await this.dataSource.query(
        'SELECT COUNT(*) AS cnt FROM information_schema.tables WHERE table_schema = ? AND table_type = "BASE TABLE"',
        [database],
      );

      const cnt = Number(tablesCount?.[0]?.cnt ?? 0);
      if (cnt > 0) {
        // 只有在“数据库没有任何表”时才触发恢复，避免因为表已存在导致导入 SQL 发生冲突。
        this.logger.log(
          `DB restore skipped: tables already exist (tables=${cnt})`,
        );
        return;
      }

      const latest = (await this.backups.listBackups())[0];
      if (!latest) {
        this.logger.warn(
          'DB restore skipped: storage/db-backups 没找到任何 .sql 备份',
        );
        return;
      }

      this.logger.warn(
        `DB restore triggered: tablesCount=${cnt}, restoring latest backup=${latest.fileName}`,
      );
      await this.backups.restoreBackup(latest.fileName);
      this.logger.warn(`DB restore finished: ${latest.fileName}`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      // 恢复失败不直接崩溃整个服务，避免线上因为备份文件/权限问题完全不可用。
      this.logger.error(`DB restore failed: ${msg}`);
    }
  }
}
