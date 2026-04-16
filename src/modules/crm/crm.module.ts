import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CrmApiController } from './crm-api.controller';
import { CrmTokenController } from './crm-token.controller';
import { CrmApiToken } from '../../entities/crm-api-token.entity';
import { ContactMessage } from '../../entities/contact-message.entity';
import { OverseasRecruit } from '../../entities/overseas-recruit.entity';
import { MemberCartInquiry } from '../../entities/member-cart-inquiry.entity';
import { MemberCartInquiryOrder } from '../../entities/member-cart-inquiry-order.entity';
import { MemberCartItem } from '../../entities/member-cart-item.entity';
import { Product } from '../../entities/product.entity';
import { ProductParamValueRel } from '../../entities/product-param-value-rel.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      CrmApiToken,
      ContactMessage,
      OverseasRecruit,
      MemberCartInquiry,
      MemberCartInquiryOrder,
      MemberCartItem,
      Product,
      ProductParamValueRel,
    ]),
  ],
  controllers: [CrmApiController, CrmTokenController],
})
export class CrmModule {}
