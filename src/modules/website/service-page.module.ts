import { Module } from '@nestjs/common';
import { I18nModule } from '../../i18n/i18n.module';
import { WebsiteModule } from './website.module';
import { ServicePageController } from './service-page.controller';

@Module({
  imports: [I18nModule, WebsiteModule],
  controllers: [ServicePageController],
})
export class ServicePageModule {}
