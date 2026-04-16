import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '../common/entities/base.entity';
import { Lang } from './lang.entity';
import { ProductParamCategory } from './product-param-category.entity';

/**
 * 产品参数值（多语言行）：每种语言一条记录。
 * - `productParamValueId`：业务 ID，同一逻辑参数值不同语言共用。
 * - `categoryId`：关联到分类表的主键（同语言下）。
 */
@Entity('product_param_value')
export class ProductParamValue extends BaseEntity {
  @Column({ name: 'product_param_value_id', type: 'int', nullable: true })
  productParamValueId: number | null;

  @Column({ name: 'category_id', type: 'int' })
  categoryId: number;

  @ManyToOne(() => ProductParamCategory, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'category_id' })
  category: ProductParamCategory;

  /** 参数值 */
  @Column({ name: 'value', type: 'text' })
  value: string;

  @Column({ name: 'lang_id', type: 'int' })
  langId: number;

  @ManyToOne(() => Lang, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'lang_id' })
  lang: Lang;

  @Column({ name: 'sort', type: 'int', default: 0 })
  sort: number;
}
