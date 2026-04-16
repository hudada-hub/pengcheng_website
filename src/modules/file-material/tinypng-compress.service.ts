import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import tinify from 'tinify';
import { readFile, writeFile, unlink, stat, rename } from 'fs/promises';
import { existsSync } from 'fs';
import { extname } from 'path';
import { SystemConfig } from '../../entities/system-config.entity';

@Injectable()
export class TinyPngCompressService {
  private readonly logger = new Logger(TinyPngCompressService.name);
  private isInitialized = false;

  private static readonly IMAGE_EXT = /\.(jpe?g|png|webp|avif)$/i;
  private static readonly IMAGE_MIME = /^image\/(jpeg|png|webp|avif)$/i;

  constructor(
    @InjectRepository(SystemConfig)
    private readonly systemConfigRepo: Repository<SystemConfig>,
  ) {}

  async initialize(): Promise<void> {
    const config = await this.systemConfigRepo.findOne({
      where: { name: 'tinypng压缩key', status: 1 },
    });
    if (config?.value) {
      tinify.key = config.value;
      this.isInitialized = true;
      this.logger.log('[TinyPNG] API key configured, service ready');
    } else {
      this.logger.warn('[TinyPNG] API key not found in system config');
    }
  }

  isImage(pathOrMime: string): boolean {
    return (
      TinyPngCompressService.IMAGE_EXT.test(pathOrMime) ||
      TinyPngCompressService.IMAGE_MIME.test(pathOrMime)
    );
  }

  isConfigured(): boolean {
    return this.isInitialized;
  }

  async compress(
    diskPath: string,
    mimeOrExt: string,
  ): Promise<{ size: number } | null> {
    if (!this.isInitialized) {
      this.logger.debug('[TinyPNG] Not configured, skipping');
      return null;
    }

    if (!existsSync(diskPath)) {
      this.logger.warn(`[TinyPNG] File not found: ${diskPath}`);
      return null;
    }

    const ext = extname(diskPath).toLowerCase().replace('.', '');

    if (!this.isImage(diskPath) && !this.isImage(mimeOrExt)) {
      this.logger.debug(
        `[TinyPNG] Not a supported image: ${diskPath} (${mimeOrExt})`,
      );
      return null;
    }

    const tempPath = `${diskPath}.tinypng.tmp`;

    try {
      const originalStat = await stat(diskPath);
      this.logger.log(
        `[TinyPNG] Starting compression: ${diskPath}, original size: ${originalStat.size.toLocaleString()} bytes`,
      );

      const imageData = await readFile(diskPath);
      const originalSize = imageData.length;

      const compressedBuffer = await tinify.fromBuffer(imageData).toBuffer();
      const compressedSize = compressedBuffer.length;

      const reduction = ((1 - compressedSize / originalSize) * 100).toFixed(1);
      this.logger.log(
        `[TinyPNG] Compression result: ${originalSize.toLocaleString()} → ${compressedSize.toLocaleString()} bytes (${reduction}% reduction)`,
      );

      if (compressedSize < originalSize) {
        await writeFile(tempPath, compressedBuffer);
        await unlink(diskPath).catch(() => {});
        await rename(tempPath, diskPath);
        this.logger.log(`[TinyPNG] Compression successful, file replaced`);
        return { size: compressedSize };
      } else {
        this.logger.log(
          `[TinyPNG] Compression skipped: compressed file is larger than original, keeping original`,
        );
        return { size: originalSize };
      }
    } catch (error) {
      this.logger.error(
        `[TinyPNG] Compression failed: ${error.message}`,
        error.stack,
      );
      await unlink(tempPath).catch(() => {});
      return null;
    }
  }
}
