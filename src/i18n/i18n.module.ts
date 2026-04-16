import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Lang } from '../entities/lang.entity';
import { LangService } from './lang.service';

@Module({
  imports: [TypeOrmModule.forFeature([Lang])],
  providers: [LangService],
  exports: [LangService],
})
export class I18nModule {}
