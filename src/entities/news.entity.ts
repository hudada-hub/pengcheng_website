import { Entity, Column, ManyToOne, JoinColumn } from 'typeorm';
import { BaseSeoEntity } from '../common/entities/base.entity';
import { Lang } from './lang.entity';
import { NewsCategory } from './news-category.entity';

@Entity('news')
export class News extends BaseSeoEntity {
  @Column({ name: 'news_id', type: 'int' })
  newsId: number;

  @Column({ name: 'lang_id', type: 'int' })
  langId: number;

  @ManyToOne(() => Lang, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'lang_id' })
  lang: Lang;

  @Column({ name: 'category_id', type: 'int', nullable: true })
  categoryId: number | null;

  @ManyToOne(() => NewsCategory, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'category_id' })
  category: NewsCategory | null;

  @Column({ name: 'title', length: 255 })
  title: string;

  @Column({ name: 'content', type: 'longtext', nullable: true })
  content: string | null;

  @Column({ name: 'publish_at', type: 'datetime', nullable: true })
  publishAt: Date | null;

  @Column({ name: 'view_count', type: 'int', default: 0 })
  viewCount: number;

  @Column({ name: 'thumb_url', type: 'varchar', length: 512, nullable: true })
  thumbUrl: string | null;

  @Column({ name: 'summary', type: 'text', nullable: true })
  summary: string | null;

  @Column({ name: 'is_top', type: 'tinyint', default: 0 })
  isTop: number;

  @Column({ name: 'sort', type: 'int', default: 0 })
  sort: number;
}
