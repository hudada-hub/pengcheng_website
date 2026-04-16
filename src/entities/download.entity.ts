import { Entity, Column, ManyToOne, JoinColumn } from 'typeorm';
import { BaseEntity } from '../common/entities/base.entity';
import { DownloadCategory } from './download-category.entity';
import { DownloadSeries } from './download-series.entity';
import { DownloadFileType } from './download-file-type.entity';
import { Lang } from './lang.entity';

@Entity('download')
export class Download extends BaseEntity {
  @Column({ name: 'download_id', type: 'int', default: 0 })
  downloadId: number;

  @Column({ name: 'resource_type_id', type: 'int' })
  resourceTypeId: number;

  @ManyToOne(() => DownloadCategory, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'resource_type_id' })
  resourceType: DownloadCategory;

  @Column({ name: 'series_id', type: 'int', nullable: true })
  seriesId: number | null;

  @ManyToOne(() => DownloadSeries, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'series_id' })
  series: DownloadSeries | null;

  @Column({ name: 'lang_id', type: 'int' })
  langId: number;

  @ManyToOne(() => Lang, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'lang_id' })
  lang: Lang;

  @Column({ name: 'download_file_type_id', type: 'int', nullable: true })
  downloadFileTypeId: number | null;

  @ManyToOne(() => DownloadFileType, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'download_file_type_id' })
  downloadFileType: DownloadFileType | null;

  @Column({ name: 'file_name', type: 'varchar', length: 255 })
  fileName: string;

  /** 已废弃：请用 downloadFileType；列保留兼容旧数据 */
  @Column({ name: 'file_type', type: 'varchar', length: 64, nullable: true })
  fileType: string | null;

  @Column({
    name: 'product_type',
    type: 'varchar',
    length: 128,
    nullable: true,
  })
  productType: string | null;

  @Column({ name: 'download_url', type: 'varchar', length: 512 })
  downloadUrl: string;

  @Column({ name: 'download_count', type: 'int', default: 0 })
  downloadCount: number;
}
