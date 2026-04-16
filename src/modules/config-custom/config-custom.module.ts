import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Config } from '../../entities/config.entity';
import { ConfigCategory } from '../../entities/config-category.entity';
import { SystemConfig } from '../../entities/system-config.entity';
import { Lang } from '../../entities/lang.entity';
import { ConfigCustomController } from './config-custom.controller';
import { ConfigCustomService } from './config-custom.service';
import { DeepseekTranslateService } from './deepseek-translate.service';
import { CsrfGuard } from '../../common/guards/csrf.guard';
import { RedisModule } from '../redis/redis.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Config, ConfigCategory, SystemConfig, Lang]),
    RedisModule,
  ],
  controllers: [ConfigCustomController],
  providers: [ConfigCustomService, DeepseekTranslateService, CsrfGuard],
  exports: [ConfigCustomService, DeepseekTranslateService],
})
export class ConfigCustomModule {}
