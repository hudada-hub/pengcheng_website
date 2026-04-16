import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { News } from '../../entities/news.entity';
import { NewsCategory } from '../../entities/news-category.entity';
import { Status } from '../../common/entities/base.entity';

@Injectable()
export class NewsService {
  constructor(
    @InjectRepository(News) private readonly newsRepo: Repository<News>,
    @InjectRepository(NewsCategory)
    private readonly categoryRepo: Repository<NewsCategory>,
  ) {}

  async findAll(langId?: number): Promise<News[]> {
    const qb = this.newsRepo
      .createQueryBuilder('n')
      .where('n.status = :status', { status: Status.Normal })
      .orderBy('n.publishAt', 'DESC');
    if (langId != null) qb.andWhere('n.langId = :langId', { langId });
    return qb.getMany();
  }

  async findOne(id: number): Promise<News | null> {
    return this.newsRepo.findOne({ where: { id, status: Status.Normal } });
  }

  async create(dto: Partial<News>): Promise<News> {
    const news = this.newsRepo.create(dto);
    return this.newsRepo.save(news);
  }

  async update(id: number, dto: Partial<News>): Promise<News> {
    await this.newsRepo.update(id, dto as any);
    return this.newsRepo.findOne({ where: { id } }) as Promise<News>;
  }

  async remove(id: number): Promise<void> {
    await this.newsRepo.delete(id);
  }

  async listCategories(langId?: number): Promise<NewsCategory[]> {
    const qb = this.categoryRepo
      .createQueryBuilder('c')
      .where('c.status = :status', { status: Status.Normal })
      .orderBy('c.sort', 'ASC');
    if (langId != null) qb.andWhere('c.langId = :langId', { langId });
    return qb.getMany();
  }
}
