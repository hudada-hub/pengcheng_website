import { Entity, Column, ManyToOne, JoinColumn } from 'typeorm';
import { BaseEntity } from '../common/entities/base.entity';
import { Lang } from './lang.entity';

@Entity('overseas_recruit')
export class OverseasRecruit extends BaseEntity {
  @Column({ name: 'recruit_id', type: 'int', default: 0 })
  recruitId: number;

  @Column({ name: 'company_name', type: 'varchar', length: 255 })
  companyName: string;

  @Column({ name: 'lang_id', type: 'int' })
  langId: number;

  @ManyToOne(() => Lang, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'lang_id' })
  lang: Lang;

  /** 产品资质文件 JSON: [{ fileName, fileUrl }] */
  @Column({ name: 'qualification_files', type: 'json', nullable: true })
  qualificationFiles: { fileName: string; fileUrl: string }[] | null;

  @Column({ name: 'country', type: 'varchar', length: 32, nullable: true })
  country: string | null;

  @Column({ name: 'city', type: 'varchar', length: 128, nullable: true })
  city: string | null;

  @Column({ name: 'email', type: 'varchar', length: 255, nullable: true })
  email: string | null;

  @Column({ name: 'phone', type: 'varchar', length: 64, nullable: true })
  phone: string | null;

  @Column({ name: 'message', type: 'text', nullable: true })
  message: string | null;
}
