import { Entity, Column, Index } from 'typeorm';
import { BaseEntity } from '../common/entities/base.entity';

@Entity('crm_api_token')
export class CrmApiToken extends BaseEntity {
  @Column({ name: 'name', type: 'varchar', length: 128, nullable: true })
  name: string | null;

  @Column({ name: 'token', type: 'varchar', length: 255 })
  @Index('idx_crm_api_token_token', ['token'])
  token: string;

  @Column({ name: 'description', type: 'text', nullable: true })
  description: string | null;

  @Column({ name: 'base_url', type: 'varchar', length: 512, nullable: true })
  baseUrl: string | null;

  @Column({ name: 'last_used_at', type: 'datetime', nullable: true })
  lastUsedAt: Date | null;

  @Column({ name: 'expires_at', type: 'datetime', nullable: true })
  expiresAt: Date | null;
}
