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
import { ProductService } from './product.service';
import { AdminAuthGuard } from '../../common/guards/admin-auth.guard';

@Controller('admin/api/product')
@UseGuards(AdminAuthGuard)
export class ProductController {
  constructor(private readonly productService: ProductService) {}

  @Get()
  async list(@Query('langId') langId?: string) {
    const id = langId ? parseInt(langId, 10) : undefined;
    return this.productService.findAll(id);
  }

  @Get('categories')
  async categories(@Query('langId') langId?: string) {
    const id = langId ? parseInt(langId, 10) : undefined;
    return this.productService.listCategories(id);
  }

  @Get(':id')
  async one(@Param('id', new ParseIntPipe()) id: number) {
    return this.productService.findOne(id);
  }

  @Post()
  async create(@Body() dto: any) {
    return this.productService.create(dto);
  }

  @Put(':id')
  async update(@Param('id', new ParseIntPipe()) id: number, @Body() dto: any) {
    return this.productService.update(id, dto);
  }

  @Delete(':id')
  async remove(@Param('id', new ParseIntPipe()) id: number) {
    await this.productService.remove(id);
    return { ok: true };
  }
}
