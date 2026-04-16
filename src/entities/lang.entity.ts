import { Entity, Column } from 'typeorm';
import { BaseEntity } from '../common/entities/base.entity';

@Entity('lang')
export class Lang extends BaseEntity {
  @Column({ name: 'name', length: 64 })
  name: string;

  @Column({ name: 'code', length: 16, unique: true })
  code: string;

  /** 语言展示全名（如 English、简体中文、日本語），用于前台/后台下拉展示 */
  @Column({
    name: 'lang_full_name',
    type: 'varchar',
    length: 64,
    nullable: true,
  })
  langFullName: string | null;

  @Column({ name: 'is_default', type: 'tinyint', default: 0 })
  isDefault: number;

  @Column({
    name: 'lang_icon_url',
    type: 'varchar',
    length: 512,
    nullable: true,
  })
  langIconUrl: string | null;
}
