import { Entity, Column, Unique } from 'typeorm';
import { BaseEntity } from '../common/entities/base.entity';

/** 游客购物车合并到会员等场景的幂等日志 */
@Unique('uq_member_cart_merge_log_user_token', ['userId', 'mergeToken'])
@Entity('member_cart_merge_log')
export class MemberCartMergeLog extends BaseEntity {
  @Column({ name: 'user_id', type: 'int' })
  userId: number;

  @Column({ name: 'merge_token', type: 'varchar', length: 64 })
  mergeToken: string;
}
