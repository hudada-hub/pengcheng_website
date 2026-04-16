import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { I18nModule } from '../../i18n/i18n.module';
import { WebsiteModule } from './website.module';
import { WebsiteNewsController } from './website-news.controller';
import { WebsiteNewsService } from './website-news.service';
import { News } from '../../entities/news.entity';

@Module({
  imports: [TypeOrmModule.forFeature([News]), I18nModule, WebsiteModule],
  controllers: [WebsiteNewsController],
  providers: [WebsiteNewsService],
})
export class WebsiteNewsModule {}
