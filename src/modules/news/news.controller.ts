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
import { NewsService } from './news.service';
import { AdminAuthGuard } from '../../common/guards/admin-auth.guard';

@Controller('admin/api/news')
@UseGuards(AdminAuthGuard)
export class NewsController {
  constructor(private readonly newsService: NewsService) {}

  @Get()
  async list(@Query('langId') langId?: string) {
    const id = langId ? parseInt(langId, 10) : undefined;
    return this.newsService.findAll(id);
  }

  @Get('categories')
  async categories(@Query('langId') langId?: string) {
    const id = langId ? parseInt(langId, 10) : undefined;
    return this.newsService.listCategories(id);
  }

  @Get(':id')
  async one(@Param('id', new ParseIntPipe()) id: number) {
    return this.newsService.findOne(id);
  }

  @Post()
  async create(@Body() dto: any) {
    return this.newsService.create(dto);
  }

  @Put(':id')
  async update(@Param('id', new ParseIntPipe()) id: number, @Body() dto: any) {
    return this.newsService.update(id, dto);
  }

  @Delete(':id')
  async remove(@Param('id', new ParseIntPipe()) id: number) {
    await this.newsService.remove(id);
    return { ok: true };
  }
}
