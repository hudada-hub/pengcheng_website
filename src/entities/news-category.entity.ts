import { Entity, Column, ManyToOne, JoinColumn } from 'typeorm';
import { BaseSeoEntity } from '../common/entities/base.entity';
import { Lang } from './lang.entity';

@Entity('news_category')
export class NewsCategory extends BaseSeoEntity {
  @Column({ name: 'news_category_id', type: 'int', nullable: true })
  newsCategoryId: number | null;

  @Column({ name: 'category_id', type: 'int', nullable: true })
  categoryId: number | null;

  @Column({ name: 'type', type: 'tinyint', default: 1 }) // 1新闻 2活动
  type: number;

  @Column({ name: 'lang_id', type: 'int' })
  langId: number;

  @ManyToOne(() => Lang, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'lang_id' })
  lang: Lang;

  @Column({ name: 'name', length: 128 })
  name: string;

  @Column({ name: 'banner_url', type: 'varchar', length: 512, nullable: true })
  bannerUrl: string | null;

  @Column({ name: 'sort', type: 'int', default: 0 })
  sort: number;
}
