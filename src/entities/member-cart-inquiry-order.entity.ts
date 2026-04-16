import { Column, Entity } from 'typeorm';
import { BaseEntity } from '../common/entities/base.entity';

/** 点击购物车 Next 时生成的询价会话（UUID），并写入行上的 inquiry_order_uuid */
@Entity('member_cart_inquiry_order')
export class MemberCartInquiryOrder extends BaseEntity {
  @Column({ name: 'order_uuid', type: 'char', length: 36, unique: true })
  orderUuid: string;

  @Column({ name: 'user_id', type: 'int' })
  userId: number;
}
