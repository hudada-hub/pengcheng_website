import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { HomeController } from './home.controller';
import { WebsiteLayoutService } from './website-layout.service';
import { I18nModule } from '../../i18n/i18n.module';
import { MenuModule } from '../menu/menu.module';
import { ProductModule } from '../product/product.module';
import { ConfigCustomModule } from '../config-custom/config-custom.module';
import { RedisModule } from '../redis/redis.module';
import { News } from '../../entities/news.entity';
import { ActivityCalendar } from '../../entities/activity-calendar.entity';
import { ContactMessage } from '../../entities/contact-message.entity';
import { Product } from '../../entities/product.entity';
import { Solution } from '../../entities/solution.entity';
import { IndustryCase } from '../../entities/industry-case.entity';
import { OverseasRecruit } from '../../entities/overseas-recruit.entity';
import { SystemConfig } from '../../entities/system-config.entity';
import { CsrfGuard } from '../../common/guards/csrf.guard';
import { WebsiteSearchController } from './website-search.controller';
import { WebsiteNotFoundViewService } from './website-not-found-view.service';
import { WebsiteCartController } from './website-cart.controller';
import { JoinUsController } from './join-us.controller';
import { MailModule } from '../mail/mail.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      News,
      ActivityCalendar,
      ContactMessage,
      Product,
      Solution,
      IndustryCase,
      OverseasRecruit,
      SystemConfig,
    ]),
    I18nModule,
    MenuModule,
    ProductModule,
    ConfigCustomModule,
    RedisModule,
    MailModule,
  ],
  /* WebsiteSearchController 先于 HomeController，确保字面路由 GET /search 优先于 GET :locale（避免 segment “search” 被当成非法语言 404） */
  controllers: [
    WebsiteCartController,
    WebsiteSearchController,
    HomeController,
    JoinUsController,
  ],
  providers: [WebsiteLayoutService, CsrfGuard, WebsiteNotFoundViewService],
  exports: [WebsiteLayoutService, WebsiteNotFoundViewService],
})
export class WebsiteModule {}
