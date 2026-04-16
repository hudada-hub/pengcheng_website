import { Module } from '@nestjs/common';
import { DbBackupService } from './db-backup.service.js';
import { DbBackupAdminController } from './db-backup.admin.controller.js';
import { DbBackupScheduler } from './db-backup.scheduler.js';
// import { DbBackupFirstRestoreService } from './db-backup-first-restore.service.js';
import { CsrfGuard } from '../../common/guards/csrf.guard';

@Module({
  controllers: [DbBackupAdminController],
  providers: [
    DbBackupService,
    DbBackupScheduler,
    //  DbBackupFirstRestoreService,
    CsrfGuard,
  ],
  exports: [DbBackupService],
})
export class DbBackupModule {}
