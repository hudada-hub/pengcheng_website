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
import { MenuService } from './menu.service';
import { AdminAuthGuard } from '../../common/guards/admin-auth.guard';

@Controller('admin/api/menu')
@UseGuards(AdminAuthGuard)
export class MenuController {
  constructor(private readonly menuService: MenuService) {}

  @Get()
  async list(@Query('langId') langId?: string) {
    const id = langId ? parseInt(langId, 10) : undefined;
    return this.menuService.findAll(id);
  }

  @Get('tree')
  async tree(@Query('langId') langId?: string) {
    const id = langId ? parseInt(langId, 10) : 1;
    return this.menuService.findTree(id);
  }

  @Post()
  async create(@Body() dto: any) {
    return this.menuService.create(dto);
  }

  @Put(':id')
  async update(@Param('id', new ParseIntPipe()) id: number, @Body() dto: any) {
    return this.menuService.update(id, dto);
  }

  @Delete(':id')
  async remove(@Param('id', new ParseIntPipe()) id: number) {
    await this.menuService.remove(id);
    return { ok: true };
  }
}
