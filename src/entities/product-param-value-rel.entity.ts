import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '../common/entities/base.entity';
import { Product } from './product.entity';
import { ProductParamValue } from './product-param-value.entity';

/**
 * 产品与参数值关联（用于多选 + 排序）。
 * 说明：关联到产品表主键 `product.id`（语言行），因此每个语言版本可有不同的参数集合。
 */
@Entity('product_param_value_rel')
export class ProductParamValueRel extends BaseEntity {
  @Column({ name: 'product_row_id', type: 'int' })
  productRowId: number;

  @ManyToOne(() => Product, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'product_row_id' })
  product: Product;

  @Column({ name: 'param_value_id', type: 'int' })
  paramValueId: number;

  @ManyToOne(() => ProductParamValue, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'param_value_id' })
  paramValue: ProductParamValue;

  @Column({ name: 'sort', type: 'int', default: 0 })
  sort: number;
}
