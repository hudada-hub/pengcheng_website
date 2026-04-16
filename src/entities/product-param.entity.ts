import { Entity, Column, ManyToOne, JoinColumn } from 'typeorm';
import { BaseEntity } from '../common/entities/base.entity';
import { Lang } from './lang.entity';

@Entity('product_param')
export class ProductParam extends BaseEntity {
  @Column({ name: 'product_param_id', type: 'int', nullable: true })
  productParamId: number | null;

  @Column({ name: 'title', length: 255 })
  title: string;

  @Column({ name: 'content', type: 'text', nullable: true })
  content: string | null;

  @Column({ name: 'type', type: 'varchar', length: 64, nullable: true })
  type: string | null;

  @Column({ name: 'lang_id', type: 'int' })
  langId: number;

  @ManyToOne(() => Lang, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'lang_id' })
  lang: Lang;

  @Column({ name: 'sort', type: 'int', default: 0 })
  sort: number;
}
