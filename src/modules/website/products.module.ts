import { Module } from '@nestjs/common';
import { I18nModule } from '../../i18n/i18n.module';
import { ProductModule } from '../product/product.module';
import { ProductsController } from './products.controller';
import { WebsiteModule } from './website.module';

@Module({
  imports: [I18nModule, WebsiteModule, ProductModule],
  controllers: [ProductsController],
  providers: [],
  exports: [],
})
export class ProductsModule {}
