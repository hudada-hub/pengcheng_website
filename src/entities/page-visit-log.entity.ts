import { Entity, Column } from 'typeorm';
import { BaseEntity } from '../common/entities/base.entity';

@Entity('page_visit_log')
export class PageVisitLog extends BaseEntity {
  @Column({ name: 'lang_id', type: 'int' })
  langId: number;

  @Column({ name: 'page_url', type: 'varchar', length: 512 })
  pageUrl: string;

  @Column({ name: 'page_type', length: 64 })
  pageType: string;

  @Column({ name: 'client_ip', length: 64 })
  clientIp: string;

  @Column({ name: 'user_agent', type: 'text', nullable: true })
  userAgent: string | null;

  @Column({
    name: 'browser_hint',
    type: 'varchar',
    length: 128,
    nullable: true,
  })
  browserHint: string | null;

  /** 前台用户 website_user.id；未登录为 null */
  @Column({ name: 'user_id', type: 'int', nullable: true })
  userId: number | null;
}
