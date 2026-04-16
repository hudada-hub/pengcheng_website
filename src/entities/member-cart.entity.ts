import { Entity, Column, OneToMany } from 'typeorm';
import { BaseEntity } from '../common/entities/base.entity';
import { MemberCartItem } from './member-cart-item.entity';

/** 会员购物车：每用户至多一条活动记录（userId 唯一） */
@Entity('member_cart')
export class MemberCart extends BaseEntity {
  @Column({ name: 'user_id', type: 'int', unique: true })
  userId: number;

  @OneToMany(() => MemberCartItem, (item) => item.cart, { cascade: true })
  items: MemberCartItem[];
}
