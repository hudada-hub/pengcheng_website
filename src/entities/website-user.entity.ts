import { Entity, Column } from 'typeorm';
import { BaseEntity } from '../common/entities/base.entity';

/** 前台官网用户（与后台 admin 分离），邮箱+密码登录 */
@Entity('website_user')
export class WebsiteUser extends BaseEntity {
  @Column({ type: 'varchar', length: 255, unique: true })
  email: string;

  @Column({ type: 'varchar', length: 255 })
  password: string;
}
