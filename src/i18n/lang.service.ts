import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Lang } from '../entities/lang.entity';
import { Status } from '../common/entities/base.entity';

@Injectable()
export class LangService {
  constructor(
    @InjectRepository(Lang)
    private readonly langRepo: Repository<Lang>,
  ) {}

  /** 所有启用的语言 */
  async findAll(): Promise<Lang[]> {
    return this.langRepo.find({
      where: { status: Status.Normal },
      order: { id: 'ASC' },
    });
  }

  /** 按 id 查找语言（用于从 langId 解析 code 做 Redis key） */
  async findById(id: number): Promise<Lang | null> {
    return this.langRepo.findOne({
      where: { id, status: Status.Normal },
    });
  }

  /** 按 code 查找（如 zh, en, jp） */
  async findByCode(code: string): Promise<Lang | null> {
    return this.langRepo.findOne({
      where: { code, status: Status.Normal },
    });
  }

  /**
   * 从路由首段解析语言（与 URL 前缀一致；支持常见别名，如 ja→jp、ko→kr）。
   * 空字符串按 en 处理。
   */
  async findByCodeForRoute(segment: string): Promise<Lang | null> {
    const lower = (segment || '').toLowerCase().trim();
    if (!lower) return this.findByCode('en');
    const direct = await this.findByCode(lower);
    if (direct) return direct;
    if (lower === 'ja') return this.findByCode('jp');
    if (lower === 'ko') return this.findByCode('kr');
    return null;
  }

  /** 默认语言 */
  async getDefault(): Promise<Lang | null> {
    return this.langRepo.findOne({
      where: { isDefault: 1, status: Status.Normal },
    });
  }

  /** 支持的 locale 列表（用于路由） */
  async getLocaleCodes(): Promise<string[]> {
    const list = await this.findAll();
    return list.map((l) => l.code);
  }
}
