import { Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ConfigModule } from './config/config.module';
import { DatabaseModule } from './database/database.module';
import { RedisModule } from './modules/redis/redis.module';
import { I18nModule } from './i18n/i18n.module';
import { AuthModule } from './modules/auth/auth.module';
import { AdminModule } from './modules/admin/admin.module';
import { MenuModule } from './modules/menu/menu.module';
import { ConfigCustomModule } from './modules/config-custom/config-custom.module';
import { ProductModule } from './modules/product/product.module';
import { NewsModule } from './modules/news/news.module';
import { FileMaterialModule } from './modules/file-material/file-material.module';
import { SolutionModule } from './modules/solution/solution.module';
import { PageStatsModule } from './modules/page-stats/page-stats.module';
import { CrmModule } from './modules/crm/crm.module';
import { WebsiteModule } from './modules/website/website.module';
import { ProductsModule } from './modules/website/products.module';
import { SolutionsModule } from './modules/website/solutions.module';
import { IndustryCasesModule } from './modules/website/industry-cases.module';
import { DownloadModule } from './modules/website/download.module';
import { WebsiteNewsModule } from './modules/website/website-news.module';
import { ActivityCalendarModule } from './modules/website/activity-calendar.module';
import { ServicePageModule } from './modules/website/service-page.module';
import { WarrantyPageModule } from './modules/website/warranty-page.module';
import { UserAgreementPageModule } from './modules/website/user-agreement-page.module';
import { AboutUsModule } from './modules/website/about-us.module';
import { AdminUnauthorizedFilter } from './common/filters/admin-unauthorized.filter';
import { WebsiteNotFoundFilter } from './common/filters/website-not-found.filter';
import { ScheduleModule } from '@nestjs/schedule';
import { DbBackupModule } from './modules/db-backup/db-backup.module';
import { MemberModule } from './modules/member/member.module';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    ConfigModule,
    DatabaseModule,
    RedisModule,
    I18nModule,
    DbBackupModule,
    AuthModule,
    AdminModule,
    MenuModule,
    ConfigCustomModule,
    ProductModule,
    NewsModule,
    FileMaterialModule,
    SolutionModule,
    PageStatsModule,
    CrmModule,
    ProductsModule,
    SolutionsModule,
    IndustryCasesModule,
    DownloadModule,
    WebsiteNewsModule,
    ActivityCalendarModule,
    ServicePageModule,
    WarrantyPageModule,
    UserAgreementPageModule,
    AboutUsModule,
    MemberModule,
    WebsiteModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    { provide: APP_FILTER, useClass: AdminUnauthorizedFilter },
    { provide: APP_FILTER, useClass: WebsiteNotFoundFilter },
  ],
})
export class AppModule {}
