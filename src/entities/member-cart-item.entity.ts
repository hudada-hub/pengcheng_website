import { Entity, Column, ManyToOne, JoinColumn } from 'typeorm';
import { BaseEntity } from '../common/entities/base.entity';
import { MemberCart } from './member-cart.entity';

@Entity('member_cart_item')
export class MemberCartItem extends BaseEntity {
  @Column({ name: 'cart_id', type: 'int' })
  cartId: number;

  @ManyToOne(() => MemberCart, (cart) => cart.items, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'cart_id' })
  cart: MemberCart;

  @Column({ name: 'product_id', type: 'int' })
  productId: number;

  @Column({ type: 'int', default: 1 })
  qty: number;

  /** 绑定到某次询价会话（Next 后写入）；NULL 表示仍在「当前购物车」 */
  @Column({
    name: 'inquiry_order_uuid',
    type: 'char',
    length: 36,
    nullable: true,
  })
  inquiryOrderUuid: string | null;
}
