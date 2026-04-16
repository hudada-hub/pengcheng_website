import { Entity, Column, ManyToOne, JoinColumn } from 'typeorm';
import { BaseEntity } from '../common/entities/base.entity';
import { Lang } from './lang.entity';

@Entity('activity_calendar')
export class ActivityCalendar extends BaseEntity {
  @Column({ name: 'activity_calendar_id', type: 'int', nullable: true })
  activityCalendarId: number | null;

  @Column({ name: 'lang_id', type: 'int' })
  langId: number;

  @ManyToOne(() => Lang, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'lang_id' })
  lang: Lang;

  @Column({ name: 'thumb_url', type: 'varchar', length: 512, nullable: true })
  thumbUrl: string | null;

  @Column({ name: 'event_date_start', type: 'date', nullable: true })
  eventDateStart: Date | null;

  @Column({ name: 'event_date_end', type: 'date', nullable: true })
  eventDateEnd: Date | null;

  @Column({ name: 'title', type: 'varchar', length: 255, nullable: true })
  title: string | null;

  /** 活动详情（前台「活动详情」页正文，富文本 HTML） */
  @Column({ name: 'content', type: 'longtext', nullable: true })
  content: string | null;

  @Column({ name: 'location', type: 'varchar', length: 255, nullable: true })
  location: string | null;

  @Column({ name: 'url', type: 'varchar', length: 512, nullable: true })
  url: string | null;

  @Column({ name: 'view_count', type: 'int', default: 0 })
  viewCount: number;

  @Column({ name: 'is_top', type: 'tinyint', default: 0 })
  isTop: number;

  @Column({ name: 'sort', type: 'int', default: 0 })
  sort: number;
}
