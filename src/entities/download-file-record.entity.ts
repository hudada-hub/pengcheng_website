import { Entity, Column, ManyToOne, JoinColumn } from 'typeorm';
import { BaseEntity } from '../common/entities/base.entity';
import { Download } from './download.entity';

/** 前台资源文件点击下载记录（入口页之前的地址取自浏览器 Referer，在下载页落盘到 sessionStorage） */
@Entity('download_file_record')
export class DownloadFileRecord extends BaseEntity {
  /** 对应 `download.id` */
  @Column({ name: 'file_id', type: 'int', nullable: true })
  fileId: number | null;

  @ManyToOne(() => Download, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'file_id' })
  file: Download | null;

  /** 进入下载页之前的页面 URL（有则记；直连/空 Referer 为 null） */
  @Column({
    name: 'from_page_url',
    type: 'varchar',
    length: 1024,
    nullable: true,
  })
  fromPageUrl: string | null;

  /** 前台用户 `website_user.id`，未登录为 null */
  @Column({ name: 'user_id', type: 'int', nullable: true })
  userId: number | null;

  @Column({ name: 'user_agent', type: 'text', nullable: true })
  userAgent: string | null;
}
