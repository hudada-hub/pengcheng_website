import { Entity, Column, ManyToOne, JoinColumn } from 'typeorm';
import { BaseSeoEntity } from '../common/entities/base.entity';
import { Lang } from './lang.entity';
import { SolutionCategory } from './solution-category.entity';

@Entity('solution')
export class Solution extends BaseSeoEntity {
  @Column({ name: 'solution_id', type: 'int' })
  solutionId: number;

  @Column({ name: 'lang_id', type: 'int' })
  langId: number;

  /** 当前语言下 solution_category 表行主键 id，逗号拼接，与产品 category_id 语义一致 */
  @Column({ name: 'category_id', type: 'varchar', length: 512, nullable: true })
  categoryId: string | null;

  @ManyToOne(() => Lang, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'lang_id' })
  lang: Lang;

  // 由于 category_id 现在是逗号拼接的字符串，不再使用 ManyToOne 关系
  // @ManyToOne(() => SolutionCategory, { onDelete: 'SET NULL' })
  // @JoinColumn({ name: 'category_id' })
  // category: SolutionCategory | null;

  @Column({ name: 'title', length: 255 })
  title: string;

  @Column({
    name: 'banner_bg_url',
    type: 'varchar',
    length: 512,
    nullable: true,
  })
  bannerBgUrl: string | null;

  @Column({
    name: 'banner_title',
    type: 'varchar',
    length: 255,
    nullable: true,
  })
  bannerTitle: string | null;

  @Column({ name: 'banner_desc', type: 'text', nullable: true })
  bannerDesc: string | null;

  @Column({
    name: 'kehu_banner_url',
    type: 'varchar',
    length: 512,
    nullable: true,
  })
  kehuBannerUrl: string | null;

  /** 客户价值：JSON 数组 [{title, content}, ...] */
  @Column({ name: 'kehu', type: 'json', nullable: true })
  kehu: Array<{ title: string; content: string }> | null;

  /** 关联产品 id，逗号拼接，如 "1,2,3"；多语言匹配：存当前语言下的产品 id */
  @Column({
    name: 'related_product_ids',
    type: 'varchar',
    length: 512,
    nullable: true,
  })
  relatedProductIds: string | null;

  /** 关联应用案例 id，逗号拼接；多语言匹配：存当前语言下的案例 id */
  @Column({
    name: 'related_industry_case_ids',
    type: 'varchar',
    length: 512,
    nullable: true,
  })
  relatedIndustryCaseIds: string | null;

  @Column({ name: 'view_count', type: 'int', default: 0 })
  viewCount: number;

  @Column({ name: 'sort', type: 'int', default: 0 })
  sort: number;
}
