import { Entity, Column, ManyToOne, JoinColumn } from 'typeorm';
import { BaseSeoEntity } from '../common/entities/base.entity';
import { Lang } from './lang.entity';

@Entity('solution_category')
export class SolutionCategory extends BaseSeoEntity {
  @Column({ name: 'solution_category_id', type: 'int', nullable: true })
  solutionCategoryId: number | null;

  @Column({ name: 'lang_id', type: 'int' })
  langId: number;

  @ManyToOne(() => Lang, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'lang_id' })
  lang: Lang;

  @Column({ name: 'title', length: 255 })
  title: string;

  @Column({ name: 'sort', type: 'int', default: 0 })
  sort: number;

  @Column({ name: 'type', type: 'int', default: 2 }) // 1: 业务板块, 2: 应用场景
  type: number;
}
