import { Entity, Column } from 'typeorm';
import { BaseEntity } from '../common/entities/base.entity';

export enum SystemConfigType {
  Number = 1,
  String = 2,
  Boolean = 3,
  Date = 4,
}

@Entity('system_config')
export class SystemConfig extends BaseEntity {
  @Column({ name: 'name', length: 128 })
  name: string;

  @Column({ name: 'hint', type: 'varchar', length: 255, nullable: true })
  hint: string | null;

  @Column({ name: 'value', type: 'text', nullable: true })
  value: string | null;

  @Column({ name: 'type', type: 'tinyint', default: SystemConfigType.String })
  type: number;

  @Column({ name: 'deletable', type: 'tinyint', default: 0 })
  deletable: number;
}
