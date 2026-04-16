import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { Admin } from '../../entities/admin.entity';
import { Status } from '../../common/entities/base.entity';

const DEFAULT_ADMIN_USER = 'admin';
const DEFAULT_ADMIN_PASS = 'admin123';
const SALT_ROUNDS = 10;

function isMysqlNoSuchTableError(e: unknown): boolean {
  const err = e as {
    code?: string;
    errno?: number;
    driverError?: { code?: string; errno?: number };
  };
  const code = err?.code ?? err?.driverError?.code;
  const errno = err?.errno ?? err?.driverError?.errno;
  return code === 'ER_NO_SUCH_TABLE' || errno === 1146;
}

@Injectable()
export class AuthService implements OnModuleInit {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    @InjectRepository(Admin) private readonly adminRepo: Repository<Admin>,
  ) {}

  async onModuleInit() {
    await this.ensureDefaultAdmin();
  }

  /** 确保存在默认管理员 admin / admin123，且不可删除 */
  private async ensureDefaultAdmin(): Promise<void> {
    try {
      const count = await this.adminRepo.count({
        where: { status: Status.Normal },
      });
      if (count > 0) return;
    } catch (e) {
      if (isMysqlNoSuchTableError(e)) {
        this.logger.error(
          '表 `admin` 不存在：生产环境 synchronize=false 时需先导入库结构（全量见 storage/db-backups；仅建管理员表见仓库 scripts/mysql-admin-table.sql，镜像内 /app/scripts/）。本次跳过默认管理员初始化。',
        );
        return;
      }
      throw e;
    }
    try {
      const hashed = await bcrypt.hash(DEFAULT_ADMIN_PASS, SALT_ROUNDS);
      await this.adminRepo.save(
        this.adminRepo.create({
          username: DEFAULT_ADMIN_USER,
          password: hashed,
          isSystem: 1,
          status: Status.Normal,
        }),
      );
    } catch (e) {
      if (isMysqlNoSuchTableError(e)) {
        this.logger.error(
          '表 `admin` 不存在，无法写入默认管理员。请先创建表结构后再启动。',
        );
        return;
      }
      throw e;
    }
  }

  /** 校验后台登录：从管理员表查用户并校验密码 */
  async validateAdmin(
    username: string,
    password: string,
  ): Promise<Admin | null> {
    const admin = await this.adminRepo.findOne({
      where: {
        username: (username || '').trim(),
        status: Status.Normal,
      },
    });
    if (!admin || !password) return null;
    const ok = await bcrypt.compare(password, admin.password);
    return ok ? admin : null;
  }

  /** 对明文密码进行哈希（用于新增/修改管理员） */
  async hashPassword(plain: string): Promise<string> {
    return bcrypt.hash(plain, SALT_ROUNDS);
  }
}
