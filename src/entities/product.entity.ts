import {
  Entity,
  Column,
  ManyToOne,
  JoinColumn,
  ValueTransformer,
} from 'typeorm';

/** 库列仍为 text：存 JSON 字符串数组；兼容历史单行纯文本（读时转为单元素数组） */
const productSummaryTransformer: ValueTransformer = {
  to(value: string[] | null): string | null {
    if (value == null || !Array.isArray(value)) return null;
    const cleaned = value.map((s) => String(s ?? '').trim()).filter(Boolean);
    return cleaned.length ? JSON.stringify(cleaned) : null;
  },
  from(value: string | null): string[] | null {
    if (value == null || String(value).trim() === '') return null;
    try {
      const p = JSON.parse(value) as unknown;
      if (Array.isArray(p)) {
        const arr = p.map((s) => String(s ?? '').trim()).filter(Boolean);
        return arr.length ? arr : null;
      }
    } catch {
      const legacy = String(value).trim();
      return legacy ? [legacy] : null;
    }
    return null;
  },
};
import { BaseSeoEntity } from '../common/entities/base.entity';
import { Lang } from './lang.entity';
import { ProductCategory } from './product-category.entity';

/**
 * 产品表（多语言行）：每种语言一条记录。
 * 继承 `BaseSeoEntity`：含 `id`、`status`、`createdAt`、`updatedAt`、`metaTitle`、`metaKeywords`、`metaDescription`。
 */
@Entity('product')
export class Product extends BaseSeoEntity {
  /**
   * 业务产品 ID：同一逻辑产品在不同 `langId` 下共用，用于关联多语言版本。
   * 库列：`product_id`
   */
  @Column({ name: 'product_id', type: 'int' })
  productId: number;

  /**
   * 所属语言，关联 `lang` 表。
   * 库列：`lang_id`
   */
  @Column({ name: 'lang_id', type: 'int' })
  langId: number;

  @ManyToOne(() => Lang, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'lang_id' })
  lang: Lang;

  /**
   * 产品分类：关联 `product_category.id`（分类表主键），未选则为 null。
   * 库列：`category_id`
   */
  @Column({ name: 'category_id', type: 'int', nullable: true })
  categoryId: number | null;

  @ManyToOne(() => ProductCategory, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'category_id' })
  category: ProductCategory | null;

  /**
   * 当前语言下的产品名称（列表、详情标题等）。
   * 库列：`name`
   */
  @Column({ name: 'name', length: 255 })
  name: string;

  /**
   * 产品详情页主标题（留空则前台使用 `name`）。
   * 库列：`detail_title`
   */
  @Column({
    name: 'detail_title',
    type: 'varchar',
    length: 255,
    nullable: true,
  })
  detailTitle: string | null;

  /**
   * 缩略图 URL：列表页、卡片、导航挂载等场景。
   * 库列：`thumb_url`
   */
  @Column({ name: 'thumb_url', type: 'varchar', length: 512, nullable: true })
  thumbUrl: string | null;

  /**
   * 主图 URL 数组（JSON）：详情轮播/图集，建议多张。
   * 库列：`main_pics`
   */
  @Column({ name: 'main_pics', type: 'json', nullable: true })
  mainPics: string[] | null;

  /**
   * 型号/SKU（短文本）：前台产品列表等位置展示，可与名称区分。
   * 库列：`model`
   */
  @Column({ name: 'model', type: 'varchar', length: 128, nullable: true })
  model: string | null;

  /**
   * 产品特点（JSON 字符串数组）：简短条目，适合列表或要点展示。
   * 库列：`features`
   */
  @Column({ name: 'features', type: 'json', nullable: true })
  features: string[] | null;

  /**
   * 核心参数（JSON 字符串数组）：如额定电压、容量等最关键的 2～3 条短文案。
   * 库列：`core_params`
   */
  @Column({ name: 'core_params', type: 'json', nullable: true })
  coreParams: string[] | null;

  /**
   * 简要优势说明（JSON 字符串数组）：多条卖点；库列 text 存 JSON，兼容旧数据纯文本。
   * 库列：`summary`
   */
  @Column({
    name: 'summary',
    type: 'text',
    nullable: true,
    transformer: productSummaryTransformer,
  })
  summary: string[] | null;

  /**
   * 详情页顶部 Banner 图 URL。
   * 库列：`banner_url`
   */
  @Column({ name: 'banner_url', type: 'varchar', length: 512, nullable: true })
  bannerUrl: string | null;

  /**
   * 技术参数明细（JSON）：多项「标题 + 内容」，如规格表行。
   * 库列：`params_json`
   */
  @Column({ name: 'params_json', type: 'json', nullable: true })
  paramsJson: { title: string; data: string }[] | null;

  /**
   * 技术参数明细大标题（字符串）：用于 paramsJson 的分组标题。
   * 库列：`params_title`
   */
  @Column({
    name: 'params_title',
    type: 'varchar',
    length: 255,
    nullable: true,
  })
  paramsTitle: string | null;

  /**
   * 产品优势一句话概述（短文本）。
   * 库列：`advantage_summary`
   */
  @Column({
    name: 'advantage_summary',
    type: 'varchar',
    length: 512,
    nullable: true,
  })
  advantageSummary: string | null;

  /**
   * 具体优势块（JSON）：每项含标题、描述，可选配图 URL。
   * 库列：`advantages`
   */
  @Column({ name: 'advantages', type: 'json', nullable: true })
  advantages:
    | {
        title: string;
        description: string;
        /** 描述下的展开叙述（长文案） */
        expandedDescription?: string;
        picUrl?: string;
      }[]
    | null;

  /**
   * 浏览/访问次数统计，默认 0，可由业务逻辑递增。
   * 库列：`view_count`
   */
  @Column({ name: 'view_count', type: 'int', default: 0 })
  viewCount: number;

  /**
   * 认证标识图片路径列表（JSON 字符串数组）：前台展示认证图标。
   * 库列：`certifications`
   */
  @Column({ name: 'certifications', type: 'json', nullable: true })
  certifications: string[] | null;

  /**
   * 排序字段：数值越大越靠前
   * 库列：`sort`
   */
  @Column({ name: 'sort', type: 'int', default: 0 })
  sort: number;

  /**
   * 关联产品 ID 列表（JSON 数组）：关联当前语言下的其他产品
   * 库列：`related_product_ids`
   */
  @Column({ name: 'related_product_ids', type: 'json', nullable: true })
  relatedProductIds: number[] | null;
}
