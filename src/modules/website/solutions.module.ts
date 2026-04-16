import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { I18nModule } from '../../i18n/i18n.module';
import { IndustryCase } from '../../entities/industry-case.entity';
import { Product } from '../../entities/product.entity';
import { SolutionModule } from '../solution/solution.module';
import { SolutionsController } from './solutions.controller';
import { WebsiteModule } from './website.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([IndustryCase, Product]),
    I18nModule,
    WebsiteModule,
    SolutionModule,
  ],
  controllers: [SolutionsController],
  providers: [],
  exports: [],
})
export class SolutionsModule {}
