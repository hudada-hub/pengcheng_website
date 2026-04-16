import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AdminController } from './admin.controller';
import { AdminCoreController } from './admin-core.controller';
import { AdminSeoPushController } from './admin-seo-push.controller';
import { AdminMenuController } from './admin-menu.controller';
import { AdminProductCategoryController } from './admin-product-category.controller';
import { AdminDownloadController } from './admin-download.controller';
import { AdminProductController } from './admin-product.controller';
import { AdminSolutionController } from './admin-solution.controller';
import { AdminIndustryCaseController } from './admin-industry-case.controller';
import { AdminNewsController } from './admin-news.controller';
import { AdminActivityCalendarController } from './admin-activity-calendar.controller';
import { AdminApiController } from './admin-api.controller';
import { AdminCartInquiryController } from './admin-cart-inquiry.controller';
import { AuthModule } from '../auth/auth.module';
import { DatabaseModule } from '../../database/database.module';
import { RedisModule } from '../redis/redis.module';
import { ConfigCustomModule } from '../config-custom/config-custom.module';
import { ProductModule } from '../product/product.module';
import { Menu } from '../../entities/menu.entity';
import { Config } from '../../entities/config.entity';
import { ConfigCategory } from '../../entities/config-category.entity';
import { Product } from '../../entities/product.entity';
import { News } from '../../entities/news.entity';
import { PageStats } from '../../entities/page-stats.entity';
import { Solution } from '../../entities/solution.entity';
import { SolutionCategory } from '../../entities/solution-category.entity';
import { SystemConfig } from '../../entities/system-config.entity';
import { Lang } from '../../entities/lang.entity';
import { FileMaterial } from '../../entities/file-material.entity';
import { FileMaterialCategory } from '../../entities/file-material-category.entity';
import { NewsCategory } from '../../entities/news-category.entity';
import { ActivityCalendar } from '../../entities/activity-calendar.entity';
import { Admin } from '../../entities/admin.entity';
import { IndustryCase } from '../../entities/industry-case.entity';
import { ProductCategory } from '../../entities/product-category.entity';
import { DownloadCategory } from '../../entities/download-category.entity';
import { DownloadSeries } from '../../entities/download-series.entity';
import { Download } from '../../entities/download.entity';
import { DownloadFileType } from '../../entities/download-file-type.entity';
import { ContactMessage } from '../../entities/contact-message.entity';
import { OverseasRecruit } from '../../entities/overseas-recruit.entity';
import { WebsiteUser } from '../../entities/website-user.entity';
import { DownloadFileRecord } from '../../entities/download-file-record.entity';
import { MemberCartInquiry } from '../../entities/member-cart-inquiry.entity';
import { MemberCartInquiryOrder } from '../../entities/member-cart-inquiry-order.entity';
import { MemberCartItem } from '../../entities/member-cart-item.entity';
import { CsrfGuard } from '../../common/guards/csrf.guard';
import { IndustryCaseTranslateService } from './industry-case-translate.service';
import { MenuTranslateService } from './menu-translate.service';
import { NewsCategoryTranslateService } from './news-category-translate.service';
import { ProductCategoryTranslateService } from './product-category-translate.service';
import { SolutionCategoryTranslateService } from './solution-category-translate.service';
import { SolutionTranslateService } from './solution-translate.service';
import { NewsTranslateService } from './news-translate.service';
import { ActivityCalendarTranslateService } from './activity-calendar-translate.service';
import { ProductTranslateService } from './product-translate.service';
import { DownloadSeriesTranslateService } from './download-series-translate.service';
import { DownloadCategoryTranslateService } from './download-category-translate.service';
import { DownloadFileTypeTranslateService } from './download-file-type-translate.service';
import { DownloadTranslateService } from './download-translate.service';
import { AdminLangService } from './admin-lang.service';
import { AdminDownloadFileRecordService } from './admin-download-file-record.service';
import { PageStatsModule } from '../page-stats/page-stats.module';
import { ProductParamValueTranslateService } from './product-param-value-translate.service';
import { ProductParamCategoryTranslateService } from './product-param-category-translate.service';
import { CrmModule } from '../crm/crm.module';

@Module({
  imports: [
    AuthModule,
    DatabaseModule,
    RedisModule,
    PageStatsModule,
    ConfigCustomModule,
    ProductModule,
    CrmModule,
    TypeOrmModule.forFeature([
      Menu,
      Config,
      ConfigCategory,
      Product,
      ProductCategory,
      News,
      NewsCategory,
      PageStats,
      Solution,
      SolutionCategory,
      SystemConfig,
      Lang,
      FileMaterial,
      FileMaterialCategory,
      ActivityCalendar,
      Admin,
      IndustryCase,
      DownloadCategory,
      DownloadSeries,
      DownloadFileType,
      Download,
      ContactMessage,
      OverseasRecruit,
      WebsiteUser,
      DownloadFileRecord,
      MemberCartInquiry,
      MemberCartInquiryOrder,
      MemberCartItem,
    ]),
  ],
  controllers: [
    AdminCoreController,
    AdminSeoPushController,
    AdminMenuController,
    AdminProductCategoryController,
    AdminDownloadController,
    AdminProductController,
    AdminSolutionController,
    AdminIndustryCaseController,
    AdminNewsController,
    AdminActivityCalendarController,
    AdminController,
    AdminApiController,
    AdminCartInquiryController,
  ],
  providers: [
    CsrfGuard,
    MenuTranslateService,
    IndustryCaseTranslateService,
    NewsCategoryTranslateService,
    ProductCategoryTranslateService,
    SolutionCategoryTranslateService,
    SolutionTranslateService,
    NewsTranslateService,
    ActivityCalendarTranslateService,
    ProductTranslateService,
    DownloadSeriesTranslateService,
    DownloadCategoryTranslateService,
    DownloadFileTypeTranslateService,
    DownloadTranslateService,
    AdminLangService,
    AdminDownloadFileRecordService,
    ProductParamValueTranslateService,
    ProductParamCategoryTranslateService,
  ],
  exports: [AdminLangService],
})
export class AdminModule {}
