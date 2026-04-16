import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { I18nModule } from '../../i18n/i18n.module';
import { WebsiteModule } from './website.module';
import { DownloadController } from './download.controller';
import { WebsiteDownloadService } from './website-download.service';
import { Download } from '../../entities/download.entity';
import { DownloadCategory } from '../../entities/download-category.entity';
import { DownloadSeries } from '../../entities/download-series.entity';
import { DownloadFileType } from '../../entities/download-file-type.entity';
import { Lang } from '../../entities/lang.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Download,
      DownloadCategory,
      DownloadSeries,
      DownloadFileType,
      Lang,
    ]),
    I18nModule,
    WebsiteModule,
  ],
  controllers: [DownloadController],
  providers: [WebsiteDownloadService],
})
export class DownloadModule {}
