import { Entity, Column, ManyToOne, JoinColumn } from 'typeorm';
import { BaseEntity } from '../common/entities/base.entity';
import { Lang } from './lang.entity';

/** 产品文件类型（多语言），结构同 download_series */
@Entity('download_file_type')
export class DownloadFileType extends BaseEntity {
  @Column({ name: 'download_file_type_id', type: 'int', nullable: true })
  downloadFileTypeId: number | null;

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
