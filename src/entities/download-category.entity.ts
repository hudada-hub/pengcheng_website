import { Entity, Column, ManyToOne, JoinColumn } from 'typeorm';
import { BaseSeoEntity } from '../common/entities/base.entity';
import { Lang } from './lang.entity';

@Entity('download_category')
export class DownloadCategory extends BaseSeoEntity {
  @Column({ name: 'category_id', type: 'int', nullable: true })
  categoryId: number | null;

  @Column({ name: 'name', length: 128 })
  name: string;

  @Column({ name: 'lang_id', type: 'int' })
  langId: number;

  @ManyToOne(() => Lang, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'lang_id' })
  lang: Lang;

  @Column({ name: 'parent_id', type: 'int', default: 0 })
  parentId: number;

  @Column({ name: 'sort', type: 'int', default: 0 })
  sort: number;
}
