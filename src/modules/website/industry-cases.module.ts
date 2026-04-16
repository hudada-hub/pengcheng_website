import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { I18nModule } from '../../i18n/i18n.module';
import { IndustryCase } from '../../entities/industry-case.entity';
import { Product } from '../../entities/product.entity';
import { SolutionCategory } from '../../entities/solution-category.entity';
import { Menu } from '../../entities/menu.entity';
import { IndustryCasesController } from './industry-cases.controller';
import { WebsiteModule } from './website.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([IndustryCase, Product, SolutionCategory, Menu]),
    I18nModule,
    WebsiteModule,
  ],
  controllers: [IndustryCasesController],
  providers: [],
  exports: [],
})
export class IndustryCasesModule {}
