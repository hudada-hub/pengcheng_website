import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { I18nModule } from '../../i18n/i18n.module';
import { WebsiteModule } from '../website/website.module';
import { MailModule } from '../mail/mail.module';
import { ConfigCustomModule } from '../config-custom/config-custom.module';
import { WebsiteUser } from '../../entities/website-user.entity';
import { MemberCart } from '../../entities/member-cart.entity';
import { MemberCartItem } from '../../entities/member-cart-item.entity';
import { MemberCartMergeLog } from '../../entities/member-cart-merge-log.entity';
import { MemberCartInquiryOrder } from '../../entities/member-cart-inquiry-order.entity';
import { MemberCartInquiry } from '../../entities/member-cart-inquiry.entity';
import { Product } from '../../entities/product.entity';
import { ProductParamValueRel } from '../../entities/product-param-value-rel.entity';
import { ProductParamValue } from '../../entities/product-param-value.entity';
import { ProductParamCategory } from '../../entities/product-param-category.entity';
import { ContactMessage } from '../../entities/contact-message.entity';
import { MemberService } from './member.service';
import { MemberCartService } from './member-cart.service';
import { MemberApiController } from './member-api.controller';
import { MemberCenterPageController } from './member-center-page.controller';
import { CsrfGuard } from '../../common/guards/csrf.guard';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      WebsiteUser,
      MemberCart,
      MemberCartItem,
      MemberCartMergeLog,
      MemberCartInquiryOrder,
      MemberCartInquiry,
      Product,
      ProductParamValueRel,
      ProductParamValue,
      ProductParamCategory,
      ContactMessage,
    ]),
    I18nModule,
    WebsiteModule,
    MailModule,
    ConfigCustomModule,
  ],
  controllers: [MemberApiController, MemberCenterPageController],
  providers: [MemberService, MemberCartService, CsrfGuard],
  exports: [MemberService, MemberCartService],
})
export class MemberModule {}
