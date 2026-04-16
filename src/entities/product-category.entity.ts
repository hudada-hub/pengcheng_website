import { Entity, Column, ManyToOne, JoinColumn } from 'typeorm';
import { BaseSeoEntity } from '../common/entities/base.entity';
import { Lang } from './lang.entity';

@Entity('product_category')
export class ProductCategory extends BaseSeoEntity {
  @Column({ name: 'category_id', type: 'int', nullable: true })
  categoryId: number | null;

  @Column({ name: 'name', length: 128 })
  name: string;

  @Column({ name: 'parent_id', type: 'int', default: 0 })
  parentId: number;

  @Column({ name: 'lang_id', type: 'int' })
  langId: number;

  @ManyToOne(() => Lang, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'lang_id' })
  lang: Lang;

  @Column({ name: 'banner_url', type: 'varchar', length: 512, nullable: true })
  bannerUrl: string | null;

  /** 用于菜单/导航展示的小图标 */
  @Column({
    name: 'menu_pic_url',
    type: 'varchar',
    length: 512,
    nullable: true,
  })
  menuPicUrl: string | null;

  @Column({ name: 'sort', type: 'int', default: 0 })
  sort: number;
}
