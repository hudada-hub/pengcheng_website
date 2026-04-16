import { Injectable, Logger } from '@nestjs/common';
import { spawn } from 'child_process';
import { unlink, rename, stat } from 'fs/promises';
import { existsSync } from 'fs';
import { extname } from 'path';

/**
 * 使用 ffmpeg 压缩视频文件
 */
@Injectable()
export class FfmpegCompressService {
  private readonly logger = new Logger(FfmpegCompressService.name);

  private readonly VIDEO_CRF = 23;
  private readonly AUDIO_BITRATE = '128k';

  private static readonly VIDEO_EXT = /\.(mp4|webm|mov|avi|mkv|flv|wmv|m4v)$/i;
  private static readonly VIDEO_MIME = /^video\//i;

  /** 判断是否为可压缩视频 */
  isVideo(pathOrMime: string): boolean {
    return (
      FfmpegCompressService.VIDEO_EXT.test(pathOrMime) ||
      FfmpegCompressService.VIDEO_MIME.test(pathOrMime)
    );
  }

  /**
   * 压缩视频文件
   * @param diskPath 视频文件路径
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

    const ext = extname(diskPath).toLowerCase().replace('.', '');

    if (!this.isVideo(diskPath) && !this.isVideo(mimeOrExt)) {
      this.logger.debug(`Not a video: ${diskPath} (${mimeOrExt})`);
      return null;
    }

    const tempPath = `${diskPath}.ffmpeg.tmp`;

    try {
      const originalStat = await stat(diskPath);
      this.logger.log(
        `[Video] Starting compression: ${diskPath}, original size: ${originalStat.size.toLocaleString()} bytes`,
      );

      const outputExt = ext === 'webm' ? 'webm' : 'mp4';
      const outputPath = tempPath.replace(/\.[^.]+$/, `.${outputExt}`);

      const args = [
        '-i',
        diskPath,
        '-c:v',
        'libx264',
        '-crf',
        String(this.VIDEO_CRF),
        '-preset',
        'medium',
        '-c:a',
        'aac',
        '-b:a',
        this.AUDIO_BITRATE || '128k',
        '-movflags',
        '+faststart',
        '-y',
        outputPath,
      ];

      await this.runFfmpeg(args);

      if (!existsSync(outputPath)) {
        this.logger.error('FFmpeg output file not created');
        return null;
      }

      const compressedStat = await stat(outputPath);
      const reduction = (
        (1 - compressedStat.size / originalStat.size) *
        100
      ).toFixed(1);

      this.logger.log(
        `Video compressed: ${originalStat.size.toLocaleString()} → ${compressedStat.size.toLocaleString()} bytes (${reduction}% reduction)`,
      );

      if (compressedStat.size < originalStat.size) {
        this.logger.log(
          `[Video] Compression successful: ${originalStat.size.toLocaleString()} → ${compressedStat.size.toLocaleString()} bytes (${reduction}% reduction), file replaced`,
        );
        await unlink(diskPath).catch(() => {});
        await rename(outputPath, diskPath);
        return { size: compressedStat.size };
      } else {
        this.logger.log(
          `[Video] Compression skipped: compressed file (${compressedStat.size.toLocaleString()} bytes) is larger than original (${originalStat.size.toLocaleString()} bytes), keeping original`,
        );
        await unlink(outputPath).catch(() => {});
        return { size: originalStat.size };
      }
    } catch (error) {
      this.logger.error(
        `Video compression failed: ${error.message}`,
        error.stack,
      );
      await unlink(tempPath).catch(() => {});
      return null;
    }
  }

  private runFfmpeg(args: string[]): Promise<void> {
    return new Promise((resolve, reject) => {
      this.logger.log(`[Video] Running ffmpeg with args: ${args.join(' ')}`);

      const ffmpeg = spawn('ffmpeg', args);
      let stderr = '';

      ffmpeg.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      ffmpeg.on('close', (code) => {
        if (code === 0) {
          this.logger.log(`[Video] FFmpeg completed successfully`);
          resolve();
        } else {
          this.logger.error(
            `[Video] FFmpeg exited with code ${code}: ${stderr.slice(-500)}`,
          );
          reject(new Error(`FFmpeg exited with code ${code}: ${stderr}`));
        }
      });

      ffmpeg.on('error', (err) => {
        this.logger.error(`[Video] FFmpeg spawn error: ${err.message}`);
        reject(err);
      });
    });
  }
}
