import { Module } from '@nestjs/common';
import { DbHeartbeatService } from './db-heartbeat.service.js';
import { DbHeartbeatScheduler } from './db-heartbeat.scheduler.js';

@Module({
  providers: [DbHeartbeatService, DbHeartbeatScheduler],
  exports: [DbHeartbeatService],
})
export class DbHeartbeatModule {}
