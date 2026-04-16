import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Menu } from '../../entities/menu.entity';
import { I18nModule } from '../../i18n/i18n.module';
import { MenuController } from './menu.controller';
import { MenuService } from './menu.service';
import { RedisModule } from '../redis/redis.module';

@Module({
  imports: [TypeOrmModule.forFeature([Menu]), RedisModule, I18nModule],
  controllers: [MenuController],
  providers: [MenuService],
  exports: [MenuService],
})
export class MenuModule {}
