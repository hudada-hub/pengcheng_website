import { Entity, Column, ManyToOne, JoinColumn } from 'typeorm';
import { BaseSeoEntity } from '../common/entities/base.entity';
import { Lang } from './lang.entity';

@Entity('menu')
export class Menu extends BaseSeoEntity {
  @Column({ name: 'menu_id', type: 'int' })
  menuId: number;

  @Column({ name: 'name', length: 128 })
  name: string;

  @Column({ name: 'parent_id', type: 'int', default: 0 })
  parentId: number;

  @Column({ name: 'sort_order', type: 'int', default: 0 })
  sortOrder: number;

  @Column({ name: 'lang_id', type: 'int' })
  langId: number;

  @ManyToOne(() => Lang, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'lang_id' })
  lang: Lang;

  @Column({
    name: 'menu_pic_url',
    type: 'varchar',
    length: 512,
    nullable: true,
  })
  menuPicUrl: string | null;

  @Column({ name: 'link_url', type: 'varchar', length: 512, nullable: true })
  linkUrl: string | null;

  @Column({ name: 'banner_url', type: 'varchar', length: 512, nullable: true })
  bannerUrl: string | null;

  @Column({
    name: 'banner_title',
    type: 'varchar',
    length: 255,
    nullable: true,
  })
  bannerTitle: string | null;

  @Column({ name: 'banner_desc', type: 'text', nullable: true })
  bannerDesc: string | null;
}
