import { Entity, Column, ManyToOne, JoinColumn } from 'typeorm';
import { BaseEntity } from '../common/entities/base.entity';
import { FileMaterialCategory } from './file-material-category.entity';

@Entity('file_material')
export class FileMaterial extends BaseEntity {
  @Column({ name: 'file_name', length: 255 })
  fileName: string;

  @Column({ name: 'file_path', length: 512 })
  filePath: string;

  @Column({ name: 'file_type', type: 'varchar', length: 64, nullable: true })
  fileType: string;

  @Column({ name: 'file_size', type: 'bigint', default: 0 })
  fileSize: number;

  @Column({ name: 'category_id', type: 'int', nullable: true })
  categoryId: number | null;

  @ManyToOne(() => FileMaterialCategory, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'category_id' })
  category: FileMaterialCategory | null;

  @Column({ name: 'download_count', type: 'int', default: 0 })
  downloadCount: number;
}
