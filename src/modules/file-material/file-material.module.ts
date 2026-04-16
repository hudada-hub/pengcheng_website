import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FileMaterial } from '../../entities/file-material.entity';
import { FileMaterialCategory } from '../../entities/file-material-category.entity';
import { SystemConfig } from '../../entities/system-config.entity';
import { FileMaterialController } from './file-material.controller';
import { FileMaterialService } from './file-material.service';
import { FfmpegCompressService } from './ffmpeg-compress.service';
import { SharpCompressService } from './sharp-compress.service';
import { TinyPngCompressService } from './tinypng-compress.service';
import { CsrfGuard } from '../../common/guards/csrf.guard';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      FileMaterial,
      FileMaterialCategory,
      SystemConfig,
    ]),
  ],
  controllers: [FileMaterialController],
  providers: [
    FileMaterialService,
    FfmpegCompressService,
    SharpCompressService,
    TinyPngCompressService,
    CsrfGuard,
  ],
  exports: [FileMaterialService, SharpCompressService],
})
export class FileMaterialModule {}
