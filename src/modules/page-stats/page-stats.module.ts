import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PageStats } from '../../entities/page-stats.entity';
import { PageVisitLog } from '../../entities/page-visit-log.entity';
import { PageStatsController } from './page-stats.controller';
import { PageStatsService } from './page-stats.service';

@Module({
  imports: [TypeOrmModule.forFeature([PageStats, PageVisitLog])],
  controllers: [PageStatsController],
  providers: [PageStatsService],
  exports: [PageStatsService],
})
export class PageStatsModule {}
