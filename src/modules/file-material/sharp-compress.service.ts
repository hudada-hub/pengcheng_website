import { Injectable, Logger } from '@nestjs/common';
import sharp from 'sharp';
import { unlink, rename, stat } from 'fs/promises';
import { existsSync } from 'fs';
import { extname } from 'path';

/**
 * 使用 sharp 压缩图片，在不影响清晰度的前提下优化体积
 * 参考：https://sharp.pixelplumbing.com/api-output
 */
@Injectable()
export class SharpCompressService {
  private readonly logger = new Logger(SharpCompressService.name);

  /** 图片最长边上限（像素）- 4K 显示屏也足够 */
  private readonly IMAGE_MAX_DIMENSION = 2400;

  /** JPEG 质量：80% 在保证画质的前提下最大化压缩 */
  private readonly JPEG_QUALITY = 80;

  /** WebP 质量：80% 高压缩率 */
  private readonly WEBP_QUALITY = 80;

  /** PNG 压缩级别：0-9，9 为最大压缩 */
  private readonly PNG_COMPRESSION_LEVEL = 9;

  /** 是否启用智能缩略图（lancashire3 重采样，画质最好） */
  private readonly SMART_RESIZE = true;

  private static readonly IMAGE_EXT = /\.(jpe?g|png|webp|gif|bmp|tiff?)$/i;
  private static readonly IMAGE_MIME =
    /^image\/(jpeg|png|webp|gif|bmp|x-ms-bmp|tiff?)$/i;

  /** 判断是否为可压缩图片 */
  isImage(pathOrMime: string): boolean {
    return (
      SharpCompressService.IMAGE_EXT.test(pathOrMime) ||
      SharpCompressService.IMAGE_MIME.test(pathOrMime)
    );
  }

  /**
   * 对磁盘上的文件尝试压缩，成功则替换原文件并返回新大小
   * @param diskPath 图片文件路径
   * @param mimeOrExt MIME 类型或扩展名
   * @returns 压缩后的文件大小，失败返回 null
   */
  async compress(
    diskPath: string,
    mimeOrExt: string,
  ): Promise<{ size: number } | null> {
    if (!existsSync(diskPath)) {
      this.logger.warn(`File not found: ${diskPath}`);
      return null;
    }

    const mime = (mimeOrExt || '').toLowerCase();
    const ext = extname(diskPath).toLowerCase().replace('.', '');

    if (!this.isImage(diskPath) && !this.isImage(mime)) {
      this.logger.debug(`Not an image: ${diskPath} (${mime})`);
      return null;
    }

    const tempPath = `${diskPath}.sharp.tmp`;

    try {
      const metadata = await sharp(diskPath).metadata();
      this.logger.debug(
        `Original metadata: ${metadata.width}x${metadata.height}, format: ${metadata.format}`,
      );

      // 根据图片类型选择最优压缩策略
      let pipeline = sharp(diskPath);

      // 智能调整尺寸（保持宽高比）
      if (
        metadata.width &&
        metadata.height &&
        (metadata.width > this.IMAGE_MAX_DIMENSION ||
          metadata.height > this.IMAGE_MAX_DIMENSION)
      ) {
        pipeline = pipeline.resize({
          width: this.IMAGE_MAX_DIMENSION,
          height: this.IMAGE_MAX_DIMENSION,
          fit: 'inside',
          withoutEnlargement: true,
          kernel: this.SMART_RESIZE ? 'lanczos3' : 'mitchell',
        });
      }

      // 根据格式应用最优压缩
      if (ext === 'jpg' || ext === 'jpeg' || metadata.format === 'jpeg') {
        // JPEG: 使用 mozjpeg 算法（如果可用），否则使用标准 jpeg
        pipeline = pipeline.jpeg({
          quality: this.JPEG_QUALITY,
          progressive: true, // 渐进式加载
          mozjpeg: true, // 启用 mozjpeg（更好的压缩）
          trellisQuantisation: true, // 网格量化
          overshootDeringing: true, // 过冲去振铃
          optimiseScans: true, // 优化扫描
        });
      } else if (ext === 'webp' || metadata.format === 'webp') {
        // WebP: 有损压缩，高画质
        pipeline = pipeline.webp({
          quality: this.WEBP_QUALITY,
          alphaQuality: this.WEBP_QUALITY,
          lossless: false,
          nearLossless: false,
          smartSubsample: true, // 智能子采样
          mixed: true, // 混合压缩
        });
      } else if (ext === 'png' || metadata.format === 'png') {
        // PNG: 使用最高压缩级别，80% 质量
        pipeline = pipeline.png({
          compressionLevel: this.PNG_COMPRESSION_LEVEL,
          adaptiveFiltering: true, // 自适应滤波
          palette: false, // 不使用调色板（保持真彩色）
        });
      } else if (ext === 'gif' || metadata.format === 'gif') {
        // GIF: 转为 WebP 以获得更好压缩（GIF 压缩效率低）
        pipeline = pipeline.webp({
          quality: this.WEBP_QUALITY,
          smartSubsample: true,
          mixed: true,
        });
      } else if (
        ext === 'tif' ||
        ext === 'tiff' ||
        metadata.format === 'tiff'
      ) {
        // TIFF: 转为 JPEG，80% 质量
        pipeline = pipeline.jpeg({
          quality: this.JPEG_QUALITY,
          progressive: true,
        });
      }

      // 处理并保存
      const outputBuffer = await pipeline.toBuffer();

      // 写入临时文件
      await unlink(tempPath).catch(() => {}); // 清理旧临时文件
      const writeStream = require('fs').createWriteStream(tempPath);
      await new Promise<void>((resolve, reject) => {
        writeStream.write(outputBuffer, (err: Error | null) => {
          if (err) reject(err);
          else resolve();
        });
      });

      // 检查压缩效果
      const originalStat = await stat(diskPath);
      const compressedStat = await stat(tempPath);
      const reduction = (
        (1 - compressedStat.size / originalStat.size) *
        100
      ).toFixed(1);

      this.logger.log(
        `Compressed: ${originalStat.size.toLocaleString()} → ${compressedStat.size.toLocaleString()} bytes (${reduction}% reduction)`,
      );

      // 只有压缩后更小才替换原文件
      if (compressedStat.size < originalStat.size) {
        await unlink(diskPath);
        await rename(tempPath, diskPath);
        return { size: compressedStat.size };
      } else {
        // 压缩后更大，保留原文件
        this.logger.debug('Compressed file is larger, keeping original');
        await unlink(tempPath);
        return { size: originalStat.size };
      }
    } catch (error) {
      this.logger.error(`Compression failed: ${error.message}`, error.stack);
      // 清理临时文件
      await unlink(tempPath).catch(() => {});
      return null;
    }
  }

  /**
   * 生成缩略图（用于列表预览）
   * @param inputPath 输入图片路径
   * @param outputPath 输出缩略图路径
   * @param size 缩略图尺寸（默认 200x200）
   */
  async generateThumbnail(
    inputPath: string,
    outputPath: string,
    size: number = 200,
  ): Promise<boolean> {
    try {
      await sharp(inputPath)
        .resize({
          width: size,
          height: size,
          fit: 'cover', // 覆盖填充
          position: 'centre', // 居中裁剪
        })
        .jpeg({ quality: 80, progressive: true })
        .toFile(outputPath);

      this.logger.debug(`Thumbnail generated: ${outputPath}`);
      return true;
    } catch (error) {
      this.logger.error(`Thumbnail generation failed: ${error.message}`);
      return false;
    }
  }

  /**
   * 将图片转换为 WebP 格式（推荐用于 Web）
   * @param inputPath 输入图片路径
   * @param outputPath 输出 WebP 路径（可选，默认为 inputPath.webp）
   * @returns 是否成功
   */
  async convertToWebP(
    inputPath: string,
    outputPath?: string,
  ): Promise<boolean> {
    try {
      const defaultOutput = `${inputPath}.webp`;
      await sharp(inputPath)
        .webp({
          quality: this.WEBP_QUALITY,
          alphaQuality: this.WEBP_QUALITY,
          lossless: false,
          smartSubsample: true,
          mixed: true,
        })
        .toFile(outputPath || defaultOutput);

      this.logger.debug(`WebP converted: ${outputPath || defaultOutput}`);
      return true;
    } catch (error) {
      this.logger.error(`WebP conversion failed: ${error.message}`);
      return false;
    }
  }
}
