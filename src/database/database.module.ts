import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { Lang } from '../entities/lang.entity';
import { SystemConfig } from '../entities/system-config.entity';
import { Menu } from '../entities/menu.entity';
import { ConfigCategory } from '../entities/config-category.entity';
import { Config } from '../entities/config.entity';
import { ProductCategory } from '../entities/product-category.entity';
import { Product } from '../entities/product.entity';
import { NewsCategory } from '../entities/news-category.entity';
import { News } from '../entities/news.entity';
import { FileMaterialCategory } from '../entities/file-material-category.entity';
import { FileMaterial } from '../entities/file-material.entity';
import { Solution } from '../entities/solution.entity';
import { SolutionCategory } from '../entities/solution-category.entity';
import { PageStats } from '../entities/page-stats.entity';
import { PageVisitLog } from '../entities/page-visit-log.entity';
import { ActivityCalendar } from '../entities/activity-calendar.entity';
import { ContactMessage } from '../entities/contact-message.entity';
import { MemberCart } from '../entities/member-cart.entity';
import { MemberCartItem } from '../entities/member-cart-item.entity';
import { MemberCartMergeLog } from '../entities/member-cart-merge-log.entity';
import { MemberCartInquiryOrder } from '../entities/member-cart-inquiry-order.entity';
import { MemberCartInquiry } from '../entities/member-cart-inquiry.entity';
import { Admin } from '../entities/admin.entity';
import { IndustryCase } from '../entities/industry-case.entity';
import { ProductParamCategory } from '../entities/product-param-category.entity';
import { ProductParamValue } from '../entities/product-param-value.entity';
import { ProductParamValueRel } from '../entities/product-param-value-rel.entity';
import { DownloadCategory } from '../entities/download-category.entity';
import { DownloadSeries } from '../entities/download-series.entity';
import { Download } from '../entities/download.entity';
import { DownloadFileType } from '../entities/download-file-type.entity';
import { DownloadFileRecord } from '../entities/download-file-record.entity';
import { OverseasRecruit } from '../entities/overseas-recruit.entity';
import { WebsiteUser } from '../entities/website-user.entity';

@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      useFactory: (config: ConfigService) => ({
        type: 'mysql',
        host: config.get('database.host'),
        port: config.get('database.port'),
        username: config.get('database.username'),
        password: config.get('database.password'),
        database: config.get('database.database'),
        autoLoadEntities: true,
        entities: [
          Lang,
          SystemConfig,
          Menu,
          ConfigCategory,
          Config,
          ProductCategory,
          Product,
          NewsCategory,
          News,
          FileMaterialCategory,
          FileMaterial,
          Solution,
          SolutionCategory,
          PageStats,
          PageVisitLog,
          ActivityCalendar,
          ContactMessage,
          MemberCart,
          MemberCartItem,
          MemberCartMergeLog,
          MemberCartInquiryOrder,
          MemberCartInquiry,
          Admin,
          IndustryCase,
          ProductParamCategory,
          ProductParamValue,
          ProductParamValueRel,
          DownloadCategory,
          DownloadSeries,
          DownloadFileType,
          Download,
          DownloadFileRecord,
          OverseasRecruit,
          WebsiteUser,
        ],
        // 自动根据实体生成/更新表结构。生产环境建议设为 false，用迁移管理
        synchronize: process.env.NODE_ENV !== 'production',
        // 关闭 SQL 查询日志，避免终端刷屏；需要调试时可设为 true 或 ['query']
        logging: false,
        charset: 'utf8mb4',
        // 连接池配置
        connectTimeout: 10000, // 连接超时时间（毫秒）
        acquireTimeout: 10000, // 获取连接超时时间（毫秒）
        waitForConnections: true, // 当连接池满时等待
        connectionLimit: 10, // 连接池最大连接数
        queueLimit: 0, // 连接池队列最大长度（0 表示无限制）
      }),
      inject: [ConfigService],
    }),
    TypeOrmModule.forFeature([
      Lang,
      SystemConfig,
      Menu,
      ConfigCategory,
      Config,
      ProductCategory,
      Product,
      NewsCategory,
      News,
      FileMaterialCategory,
      FileMaterial,
      Solution,
      SolutionCategory,
      PageStats,
      PageVisitLog,
      ActivityCalendar,
      ContactMessage,
      MemberCart,
      MemberCartItem,
      MemberCartMergeLog,
      MemberCartInquiryOrder,
      MemberCartInquiry,
      Admin,
      IndustryCase,
      ProductParamCategory,
      ProductParamValue,
      ProductParamValueRel,
      DownloadCategory,
      DownloadSeries,
      DownloadFileType,
      Download,
      DownloadFileRecord,
      OverseasRecruit,
      WebsiteUser,
    ]),
  ],
  exports: [TypeOrmModule],
})
export class DatabaseModule {}
