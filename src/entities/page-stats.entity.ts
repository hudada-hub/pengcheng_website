import { Entity, Column, PrimaryGeneratedColumn } from 'typeorm';

@Entity('page_stats')
export class PageStats {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'lang_id', type: 'int' })
  langId: number;

  @Column({ name: 'page_type', length: 64 })
  pageType: string;

  @Column({ name: 'view_count', type: 'int', default: 0 })
  viewCount: number;

  @Column({ name: 'last_view_at', type: 'datetime', nullable: true })
  lastViewAt: Date | null;

  /** 最近一次「已计数」访问来自的前台用户 website_user.id；未登录访问不更新 */
  @Column({ name: 'user_id', type: 'int', nullable: true })
  userId: number | null;
}
