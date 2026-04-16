import { Entity, Column, ManyToOne, JoinColumn } from 'typeorm';
import { BaseSeoEntity } from '../common/entities/base.entity';
import { Lang } from './lang.entity';

@Entity('industry_case')
export class IndustryCase extends BaseSeoEntity {
  @Column({ name: 'industry_case_id', type: 'int' })
  industryCaseId: number;

  @Column({ name: 'lang_id', type: 'int' })
  langId: number;

  @ManyToOne(() => Lang, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'lang_id' })
  lang: Lang;

  @Column({ name: 'sort', type: 'int', default: 0 })
  sort: number;

  /** 是否置顶：0 否，1 是 */
  @Column({ name: 'is_top', type: 'tinyint', default: 0 })
  isTop: number;

  @Column({ name: 'title', length: 255 })
  title: string;

  /** 规格文案，如 600kW/1290kWh（列表/卡片展示） */
  @Column({ name: 'spec_line', type: 'varchar', length: 128, nullable: true })
  specLine: string | null;

  @Column({ name: 'content', type: 'longtext', nullable: true })
  content: string | null;

  @Column({ name: 'thumbnail', type: 'varchar', length: 512, nullable: true })
  thumbnail: string | null;

  @Column({ name: 'banner_url', type: 'varchar', length: 512, nullable: true })
  bannerUrl: string | null;

  /** Banner 标题 */
  @Column({ name: 'banner_title', type: 'varchar', length: 255, nullable: true })
  bannerTitle: string | null;

  /** 标签：JSON 数组，如 ["行业","地区","产品线"] */
  @Column({ name: 'tags', type: 'json', nullable: true })
  tags: string[] | null;

  /** 关联的解决方案 id 列表：JSON 数组 */
  @Column({ name: 'solution_ids', type: 'json', nullable: true })
  solutionIds: number[] | null;

  /** 关联产品 id：逗号拼接，如 "1,2,3"；多语言匹配：存当前语言下的产品 id */
  @Column({
    name: 'related_product_ids',
    type: 'varchar',
    length: 512,
    nullable: true,
  })
  relatedProductIds: string | null;

  /** 关联解决方案 id：逗号拼接；多语言匹配：存当前语言下的解决方案 id */
  @Column({
    name: 'related_solution_ids',
    type: 'varchar',
    length: 512,
    nullable: true,
  })
  relatedSolutionIds: string | null;

  /** 关联的行业应用案例 id 列表：JSON 数组 */
  @Column({ name: 'related_industry_case_ids', type: 'json', nullable: true })
  relatedIndustryCaseIds: number[] | null;

  @Column({ name: 'view_count', type: 'int', default: 0 })
  viewCount: number;

  /** 当前语言下 solution_category 表行主键 id，逗号拼接，与产品 category_id 语义一致 */
  @Column({ name: 'category_id', type: 'varchar', length: 512, nullable: true })
  categoryId: string | null;
}
