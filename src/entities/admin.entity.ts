import { Entity, Column } from 'typeorm';
import { BaseEntity } from '../common/entities/base.entity';

@Entity('admin')
export class Admin extends BaseEntity {
  @Column({ name: 'username', length: 64, unique: true })
  username: string;

  @Column({ name: 'password', length: 255 })
  password: string;

  /** 1=系统默认管理员，不可删除 */
  @Column({ name: 'is_system', type: 'tinyint', default: 0 })
  isSystem: number;
}
