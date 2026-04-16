import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Put,
  Delete,
  Query,
  UseGuards,
  ParseIntPipe,
  Req,
  OnModuleInit,
} from '@nestjs/common';
import { FileMaterialService } from './file-material.service';
import { FfmpegCompressService } from './ffmpeg-compress.service';
import { SharpCompressService } from './sharp-compress.service';
import { TinyPngCompressService } from './tinypng-compress.service';
import { AdminAuthGuard } from '../../common/guards/admin-auth.guard';
import { CsrfGuard } from '../../common/guards/csrf.guard';
import type { FastifyRequest } from 'fastify';
import { pipeline } from 'stream/promises';
import { createWriteStream, existsSync, mkdirSync } from 'fs';
import { join, extname } from 'path';
import { randomBytes } from 'crypto';
import { stat } from 'fs/promises';

@Controller('admin/api/file-material')
@UseGuards(AdminAuthGuard)
export class FileMaterialController implements OnModuleInit {
  constructor(
    private readonly fileService: FileMaterialService,
    private readonly ffmpegCompressService: FfmpegCompressService,
    private readonly sharpCompressService: SharpCompressService,
    private readonly tinyPngCompressService: TinyPngCompressService,
  ) {}

  async onModuleInit() {
    await this.tinyPngCompressService.initialize();
  }

  @Get()
  async list(
    @Query('categoryId') categoryId?: string,
    @Query('keyword') keyword?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('fileType') fileType?: string,
  ) {
    const id = categoryId ? parseInt(categoryId, 10) : undefined;
    return this.fileService.findAll({
      categoryId: id,
      keyword: keyword?.trim() || undefined,
      page: page ? parseInt(page, 10) : 1,
      pageSize: pageSize ? parseInt(pageSize, 10) : 24,
      fileType: fileType?.trim() || undefined,
    });
  }

  @Get('categories')
  async categories() {
    return this.fileService.listCategories();
  }

  @Post('categories')
  @UseGuards(AdminAuthGuard, CsrfGuard)
  async createCategory(@Body('name') name: string) {
    const n = (name ?? '').trim();
    if (!n) return { ok: false, message: '分类名称不能为空' };
    const row = await this.fileService.createCategory(n);
    return { ok: true, category: row };
  }

  @Post()
  async create(@Body() dto: any) {
    return this.fileService.create(dto);
  }

  @Post('upload')
  @UseGuards(AdminAuthGuard, CsrfGuard)
  async upload(@Req() req: FastifyRequest) {
    const mp = await (req as any).file?.();
    if (!mp) {
      return { ok: false, message: '未找到上传文件' };
    }
    const originalName = mp.filename as string;
    const mime = mp.mimetype as string;
    const fileStream = mp.file as NodeJS.ReadableStream;

    const now = new Date();
    const yyyyMM = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`;
    const uploadDir = join(process.cwd(), 'public', 'uploads', yyyyMM);
    if (!existsSync(uploadDir)) mkdirSync(uploadDir, { recursive: true });

    const ext = extname(originalName || '').toLowerCase();
    const safeExt = ext && ext.length <= 12 ? ext : '';
    const savedName = `${Date.now()}-${randomBytes(8).toString('hex')}${safeExt}`;
    const diskPath = join(uploadDir, savedName);
    // 先写完文件流，busboy 才会继续解析后面的 multipart 字段；此前读 mp.fields 会拿不到 categoryId
    await pipeline(fileStream, createWriteStream(diskPath));

    const fields = mp.fields || {};
    const categoryIdRaw = fields.categoryId?.value ?? fields.categoryId;
    const parsedCat =
      categoryIdRaw != null && String(categoryIdRaw).trim() !== ''
        ? parseInt(String(categoryIdRaw), 10)
        : NaN;
    const categoryId = Number.isFinite(parsedCat) ? parsedCat : null;

    const mimeOrExt = mime || ext || '';
    // 优先使用 TinyPNG 压缩图片，如果没有配置则使用 Sharp
    if (!this.tinyPngCompressService.isConfigured()) {
      await this.sharpCompressService.compress(diskPath, mimeOrExt);
    } else {
      const tinyResult = await this.tinyPngCompressService.compress(
        diskPath,
        mimeOrExt,
      );
      if (!tinyResult) {
        await this.sharpCompressService.compress(diskPath, mimeOrExt);
      }
    }
    // 使用 ffmpeg 压缩视频
    await this.ffmpegCompressService.compress(diskPath, mimeOrExt);

    const fileStat = await stat(diskPath);
    const filePath = `/uploads/${yyyyMM}/${savedName}`;
    const fileSize = fileStat.size;

    const saved = await this.fileService.create({
      fileName: originalName,
      filePath,
      fileType: mime || safeExt.replace(/^\./, ''),
      fileSize,
      categoryId,
    });
    return { ok: true, file: saved };
  }

  @Put(':id')
  async update(@Param('id', new ParseIntPipe()) id: number, @Body() dto: any) {
    return this.fileService.update(id, dto);
  }

  @Delete(':id')
  async remove(@Param('id', new ParseIntPipe()) id: number) {
    await this.fileService.remove(id);
    return { ok: true };
  }

  @Post('batch-move')
  @UseGuards(AdminAuthGuard, CsrfGuard)
  async batchMove(
    @Body() body: { ids?: number[]; categoryId?: number | null },
  ) {
    const ids = Array.isArray(body?.ids)
      ? body.ids.filter((id) => typeof id === 'number')
      : [];
    const categoryId =
      body.categoryId != null
        ? typeof body.categoryId === 'number'
          ? body.categoryId
          : null
        : null;
    await this.fileService.batchUpdateCategory(ids, categoryId);
    return { ok: true, count: ids.length };
  }
}
