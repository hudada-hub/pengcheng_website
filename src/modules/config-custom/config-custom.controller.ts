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
} from '@nestjs/common';
import { ConfigCustomService } from './config-custom.service';
import { AdminAuthGuard } from '../../common/guards/admin-auth.guard';
import { CsrfGuard } from '../../common/guards/csrf.guard';

@Controller('admin/api/config')
@UseGuards(AdminAuthGuard)
export class ConfigCustomController {
  constructor(private readonly configService: ConfigCustomService) {}

  @Get()
  async list(
    @Query('langId') langId?: string,
    @Query('categoryId') categoryId?: string,
    @Query('keyword') keyword?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    const rawLang = (langId ?? '').toString().trim();
    const langIdNum =
      rawLang && rawLang !== '0' && rawLang.toLowerCase() !== 'all'
        ? parseInt(rawLang, 10)
        : undefined;
    const rawCategory = (categoryId ?? '').toString().trim();
    const categoryIdNum =
      rawCategory && rawCategory !== '0' && rawCategory.toLowerCase() !== 'all'
        ? parseInt(rawCategory, 10)
        : undefined;
    const pageNum = page ? parseInt(page, 10) : 1;
    const pageSizeNum = pageSize
      ? Math.min(50, Math.max(5, parseInt(pageSize, 10)))
      : 15;
    return this.configService.findListWithPagination({
      langId: langIdNum,
      categoryId: categoryIdNum,
      keyword: (keyword ?? '').trim() || undefined,
      page: pageNum,
      pageSize: pageSizeNum,
    });
  }

  @Get('categories')
  async categories() {
    return this.configService.listCategories();
  }

  @Delete('categories/:id')
  @UseGuards(CsrfGuard)
  async removeCategory(@Param('id', new ParseIntPipe()) id: number) {
    return this.configService.removeCategory(id);
  }

  @Get('detail/:id')
  async detail(@Param('id', new ParseIntPipe()) id: number) {
    const config = await this.configService.getById(id);
    if (!config) return { ok: false, message: '配置不存在' };
    return { ok: true, data: config };
  }

  @Get('missing-langs')
  async missingLangs(
    @Query('configId') configId?: string,
    @Query('id') id?: string,
    @Query('retranslate') retranslate?: string,
  ) {
    const num = configId ? parseInt(configId, 10) : id ? parseInt(id, 10) : 0;
    if (!num) return [];
    const isRetranslate = retranslate === '1' || retranslate === 'true';
    return this.configService.getMissingLangs(num, isRetranslate);
  }

  @Post('translate')
  @UseGuards(CsrfGuard)
  async translate(
    @Body() body: { sourceConfigId?: number; targetLangIds?: number[] },
  ) {
    const sourceConfigId = body?.sourceConfigId ?? 0;
    const targetLangIds = Array.isArray(body?.targetLangIds)
      ? body.targetLangIds
      : [];
    if (!sourceConfigId || !targetLangIds.length) {
      return { ok: false, message: '请选择源配置与目标语言' };
    }
    try {
      const result = await this.configService.translateConfig(
        sourceConfigId,
        targetLangIds,
      );
      return {
        ok: true,
        ...result,
        message: `已创建 ${result.created} 条，更新 ${result.updated} 条`,
      };
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : '翻译失败';
      return { ok: false, message: msg };
    }
  }

  @Post('translate-batch')
  @UseGuards(CsrfGuard)
  async translateBatch(
    @Body() body: { sourceIds?: number[]; targetLangIds?: number[] },
  ) {
    const norm = (arr: unknown[]) =>
      arr.map((n) => Number(n)).filter((n) => Number.isFinite(n) && n > 0);
    const sourceIds = norm(body?.sourceIds ?? []);
    const targetLangIds = norm(body?.targetLangIds ?? []);
    if (!sourceIds.length || !targetLangIds.length) {
      return { ok: false, message: '请勾选要翻译的配置并至少选择一种目标语言' };
    }
    try {
      const result = await this.configService.translateConfigBatch(
        sourceIds,
        targetLangIds,
      );
      return {
        ok: true,
        ...result,
        message: `已翻译 ${result.translatedCount} 条配置，新建 ${result.created} 条，更新 ${result.updated} 条`,
      };
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : '翻译失败';
      return { ok: false, message: msg };
    }
  }

  @Post()
  async create(@Body() dto: any) {
    return this.configService.create(dto);
  }

  @Put(':id')
  async update(@Param('id', new ParseIntPipe()) id: number, @Body() dto: any) {
    return this.configService.update(id, dto);
  }

  @Delete(':id')
  @UseGuards(CsrfGuard)
  async remove(@Param('id', new ParseIntPipe()) id: number) {
    await this.configService.remove(id);
    return { ok: true };
  }

  @Post('batch-delete')
  @UseGuards(CsrfGuard)
  async batchRemove(@Body() body: { ids?: number[] }) {
    const ids = Array.isArray(body?.ids)
      ? body.ids
          .map((id) => parseInt(String(id), 10))
          .filter((id) => Number.isFinite(id))
      : [];
    const deleted = await this.configService.batchRemove(ids);
    return { ok: true, deleted, message: `已删除 ${deleted} 条配置` };
  }
}
