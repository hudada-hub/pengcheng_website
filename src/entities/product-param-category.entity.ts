import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '../common/entities/base.entity';
import { Lang } from './lang.entity';

/**
 * 产品参数分类（多语言行）：每种语言一条记录。
 * - `productParamCategoryId`：业务 ID，同一逻辑分类不同语言共用。
 */
@Entity('product_param_category')
export class ProductParamCategory extends BaseEntity {
  @Column({ name: 'product_param_category_id', type: 'int', nullable: true })
  productParamCategoryId: number | null;

  @Column({ name: 'title', length: 255 })
  title: string;

  @Column({ name: 'lang_id', type: 'int' })
  langId: number;

  @ManyToOne(() => Lang, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'lang_id' })
  lang: Lang;

  @Column({ name: 'sort', type: 'int', default: 0 })
  sort: number;
}
