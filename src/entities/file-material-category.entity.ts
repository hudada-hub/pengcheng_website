import { Entity, Column } from 'typeorm';
import { BaseEntity } from '../common/entities/base.entity';

@Entity('file_material_category')
export class FileMaterialCategory extends BaseEntity {
  @Column({ name: 'name', length: 128 })
  name: string;
}
