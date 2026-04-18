import { Module } from '@nestjs/common';
import { DbHeartbeatService } from './db-heartbeat.service.js';
import { DbHeartbeatScheduler } from './db-heartbeat.scheduler.js';
import { RedisModule } from '../redis/redis.module.js';

@Module({
  imports: [RedisModule],
  providers: [DbHeartbeatService, DbHeartbeatScheduler],
  exports: [DbHeartbeatService],
})
export class DbHeartbeatModule {}
