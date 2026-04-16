import { Entity, Column } from 'typeorm';
import { BaseEntity } from '../common/entities/base.entity';

/** 前台首页联系表单提交，字段与表单一一对应 */
@Entity('contact_message')
export class ContactMessage extends BaseEntity {
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

  @Column({ name: 'user_id', type: 'int', nullable: true })
  userId: number | null;

  /** 购物车询价会话 UUID，与 member_cart_inquiry 同源关联 */
  @Column({
    name: 'inquiry_order_uuid',
    type: 'varchar',
    length: 36,
    nullable: true,
  })
  inquiryOrderUuid: string | null;

  @Column({ name: 'admin_reply', type: 'text', nullable: true })
  adminReply: string | null;

  @Column({ name: 'replied_at', type: 'datetime', nullable: true })
  repliedAt: Date | null;

  @Column({
    name: 'source_url',
    type: 'varchar',
    length: 512,
    nullable: true,
  })
  sourceUrl: string | null;
}
