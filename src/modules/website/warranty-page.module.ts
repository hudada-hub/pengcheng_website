import { Module } from '@nestjs/common';
import { I18nModule } from '../../i18n/i18n.module';
import { WebsiteModule } from './website.module';
import { WarrantyPageController } from './warranty-page.controller';

@Module({
  imports: [I18nModule, WebsiteModule],
  controllers: [WarrantyPageController],
})
export class WarrantyPageModule {}
