import { Entity, Column, ManyToOne, JoinColumn } from 'typeorm';
import { BaseEntity } from '../common/entities/base.entity';
import { Lang } from './lang.entity';
import { ConfigCategory } from './config-category.entity';

export enum ConfigType {
  Text = 1,
  SingleImage = 2,
  ImageTitle = 3,
  ImageLink = 4,
  TitleContentImage = 5,
  ImageTitleLink = 6,
  ImageImageTitleLink = 7,
  TitleContentDescImage = 8,
  ImageImageTitle = 9,
  TitleDesc = 10,
  /** 与 DB 约定：11、12 等见后台；13 = content JSON 中单条「content」为 HTML，后台 wangeditor */
  RichText = 13,
}

@Entity('config')
export class Config extends BaseEntity {
  @Column({ name: 'name', length: 128 })
  name: string;

  @Column({ name: 'title', type: 'varchar', length: 255, nullable: true })
  title: string | null;

  @Column({ name: 'description', type: 'text', nullable: true })
  description: string | null;

  @Column({ name: 'key_name', length: 128 })
  keyName: string;

  @Column({ name: 'bg_pic_url', type: 'varchar', length: 512, nullable: true })
  bgPicUrl: string | null;

  @Column({ name: 'video_url', type: 'varchar', length: 512, nullable: true })
  videoUrl: string | null;

  @Column({ name: 'is_array', type: 'tinyint', default: 0 })
  isArray: number;

  @Column({ name: 'type', type: 'tinyint' })
  type: number;

  @Column({ name: 'content', type: 'json', nullable: true })
  content: Record<string, unknown> | unknown[] | null;

  @Column({ name: 'config_id', type: 'int', nullable: true })
  configId: number | null;

  @Column({ name: 'lang_id', type: 'int' })
  langId: number;

  @ManyToOne(() => Lang, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'lang_id' })
  lang: Lang;

  @Column({ name: 'category_id', type: 'int', nullable: true })
  categoryId: number | null;

  @ManyToOne(() => ConfigCategory, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'category_id' })
  category: ConfigCategory | null;

  @Column({ name: 'link_url', type: 'varchar', length: 512, nullable: true })
  linkUrl: string | null;

  @Column({ name: 'deletable', type: 'tinyint', default: 1 })
  deletable: number;
}
