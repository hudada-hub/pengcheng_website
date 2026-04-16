import { Module } from '@nestjs/common';
import { I18nModule } from '../../i18n/i18n.module';
import { AboutUsController } from './about-us.controller';
import { WebsiteModule } from './website.module';

@Module({
  imports: [I18nModule, WebsiteModule],
  controllers: [AboutUsController],
})
export class AboutUsModule {}
