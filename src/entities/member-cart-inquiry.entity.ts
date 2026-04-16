import { Column, Entity } from 'typeorm';
import { BaseEntity } from '../common/entities/base.entity';

/** 购物车询价表单提交记录，关联 member_cart_inquiry_order.order_uuid */
@Entity('member_cart_inquiry')
export class MemberCartInquiry extends BaseEntity {
  @Column({ name: 'user_id', type: 'int' })
  userId: number;

  @Column({
    name: 'inquiry_order_uuid',
    type: 'char',
    length: 36,
    nullable: true,
  })
  inquiryOrderUuid: string | null;

  @Column({ name: 'full_name', type: 'varchar', length: 128, nullable: true })
  fullName: string | null;

  @Column({ name: 'email', type: 'varchar', length: 128, nullable: true })
  email: string | null;

  @Column({ name: 'nation', type: 'varchar', length: 128, nullable: true })
  nation: string | null;

  @Column({
    name: 'location_city',
    type: 'varchar',
    length: 255,
    nullable: true,
  })
  locationCity: string | null;

  @Column({ name: 'phone_number', type: 'varchar', length: 64, nullable: true })
  phoneNumber: string | null;

  @Column({ name: 'message', type: 'text', nullable: true })
  message: string | null;

  @Column({
    name: 'source_url',
    type: 'varchar',
    length: 512,
    nullable: true,
  })
  sourceUrl: string | null;
}
