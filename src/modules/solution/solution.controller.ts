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
import { SolutionService } from './solution.service';
import { AdminAuthGuard } from '../../common/guards/admin-auth.guard';

@Controller('admin/api/solution')
@UseGuards(AdminAuthGuard)
export class SolutionController {
  constructor(private readonly solutionService: SolutionService) {}

  @Get()
  async list(@Query('langId') langId?: string) {
    const id = langId ? parseInt(langId, 10) : undefined;
    return this.solutionService.findAll(id);
  }

  @Get(':id')
  async one(@Param('id', new ParseIntPipe()) id: number) {
    return this.solutionService.findOne(id);
  }

  @Post()
  async create(@Body() dto: any) {
    return this.solutionService.create(dto);
  }

  @Put(':id')
  async update(@Param('id', new ParseIntPipe()) id: number, @Body() dto: any) {
    return this.solutionService.update(id, dto);
  }

  @Delete(':id')
  async remove(@Param('id', new ParseIntPipe()) id: number) {
    await this.solutionService.remove(id);
    return { ok: true };
  }
}
