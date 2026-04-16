import { Entity, Column } from 'typeorm';
import { BaseEntity } from '../common/entities/base.entity';

@Entity('config_category')
export class ConfigCategory extends BaseEntity {
  @Column({ name: 'name', length: 128 })
  name: string;
}
