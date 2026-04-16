import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Solution } from '../../entities/solution.entity';
import { SolutionCategory } from '../../entities/solution-category.entity';
import { Status } from '../../common/entities/base.entity';
import { LangService } from '../../i18n/lang.service';
import { RedisService, CACHE_KEYS } from '../redis/redis.service';

@Injectable()
export class SolutionService {
  constructor(
    @InjectRepository(Solution)
    private readonly solutionRepo: Repository<Solution>,
    @InjectRepository(SolutionCategory)
    private readonly solutionCategoryRepo: Repository<SolutionCategory>,
    private readonly redis: RedisService,
    private readonly config: ConfigService,
    private readonly langService: LangService,
  ) {}

  async findAll(langId?: number): Promise<Solution[]> {
    const qb = this.solutionRepo
      .createQueryBuilder('s')
      .where('s.status = :status', { status: Status.Normal })
      .orderBy('s.sort', 'DESC')
      .addOrderBy('s.id', 'DESC');
    if (langId != null) qb.andWhere('s.langId = :langId', { langId });
    return qb.getMany();
  }

  async findOne(id: number): Promise<Solution | null> {
    return this.solutionRepo.findOne({ where: { id, status: Status.Normal } });
  }

  /** 前台详情：业务 solution_id + 语言 */
  async findBySolutionIdAndLang(
    solutionId: number,
    langId: number,
  ): Promise<Solution | null> {
    return this.solutionRepo.findOne({
      where: { solutionId, langId, status: Status.Normal },
    });
  }

  async create(dto: Partial<Solution>): Promise<Solution> {
    const solution = this.solutionRepo.create(dto);
    return this.solutionRepo.save(solution);
  }

  async update(id: number, dto: Partial<Solution>): Promise<Solution> {
    await this.solutionRepo.update(id, dto as any);
    return this.solutionRepo.findOne({ where: { id } }) as Promise<Solution>;
  }

  async remove(id: number): Promise<void> {
    await this.solutionRepo.delete(id);
  }

  async listCategories(langId?: number): Promise<SolutionCategory[]> {
    const qb = this.solutionCategoryRepo
      .createQueryBuilder('c')
      .where('c.status = :status', { status: Status.Normal })
      .orderBy('c.sort', 'ASC')
      .addOrderBy('c.id', 'ASC');
    if (langId != null) qb.andWhere('c.langId = :langId', { langId });
    return qb.getMany();
  }

  async getCategoriesFromCache(langId: number): Promise<SolutionCategory[]> {
    const lang = await this.langService.findById(langId);
    const code = lang?.code ?? String(langId);
    const key = CACHE_KEYS.SOLUTION_CATEGORY(code);
    const cached = await this.redis.get<SolutionCategory[]>(key);
    if (cached) return cached;
    const list = await this.listCategories(langId);
    const ttl = this.config.get<number>('redis.layoutTtlSeconds', 300);
    await this.redis.set(key, list, ttl);
    return list;
  }

  async getSolutionsFromCache(langId: number): Promise<Solution[]> {
    const lang = await this.langService.findById(langId);
    const code = lang?.code ?? String(langId);
    const key = CACHE_KEYS.SOLUTION(code);
    const cached = await this.redis.get<Solution[]>(key);
    if (cached) return cached;
    const list = await this.findAll(langId);
    const ttl = this.config.get<number>('redis.layoutTtlSeconds', 300);
    await this.redis.set(key, list, ttl);
    return list;
  }
}
