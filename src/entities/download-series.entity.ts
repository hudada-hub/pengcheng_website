import { Entity, Column, ManyToOne, JoinColumn } from 'typeorm';
import { BaseEntity } from '../common/entities/base.entity';
import { Lang } from './lang.entity';

@Entity('download_series')
export class DownloadSeries extends BaseEntity {
  /** 同一条「产品系列」在不同语言下的分组 id，新建后回填为自身 id */
  @Column({ name: 'download_series_id', type: 'int', nullable: true })
  downloadSeriesId: number | null;

  @Column({ name: 'lang_id', type: 'int' })
  langId: number;

  @ManyToOne(() => Lang, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'lang_id' })
  lang: Lang;

  @Column({ name: 'name', length: 128 })
  name: string;

  @Column({ name: 'sort', type: 'int', default: 0 })
  sort: number;
}
