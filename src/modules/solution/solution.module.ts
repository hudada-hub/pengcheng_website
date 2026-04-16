import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Solution } from '../../entities/solution.entity';
import { SolutionCategory } from '../../entities/solution-category.entity';
import { SolutionController } from './solution.controller';
import { SolutionService } from './solution.service';
import { I18nModule } from '../../i18n/i18n.module';
import { RedisModule } from '../redis/redis.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Solution, SolutionCategory]),
    I18nModule,
    RedisModule,
  ],
  controllers: [SolutionController],
  providers: [SolutionService],
  exports: [SolutionService],
})
export class SolutionModule {}
