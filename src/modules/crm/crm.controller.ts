import { Controller, Get, Post, UseGuards } from '@nestjs/common';
import { ApiKeyGuard } from '../../common/guards/api-key.guard';

@Controller('api/crm')
@UseGuards(ApiKeyGuard)
export class CrmController {
  /** 表单数据接口 - 外部通过 apikey 获取 */
  @Get('forms')
  async getForms() {
    return { forms: [], message: 'CRM forms data' };
  }
}
