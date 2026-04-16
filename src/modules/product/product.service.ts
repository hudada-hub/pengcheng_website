import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Product } from '../../entities/product.entity';
import { ProductCategory } from '../../entities/product-category.entity';
import { LangService } from '../../i18n/lang.service';
import { RedisService, CACHE_KEYS } from '../redis/redis.service';
import { Status } from '../../common/entities/base.entity';

@Injectable()
export class ProductService {
  constructor(
    @InjectRepository(Product)
    private readonly productRepo: Repository<Product>,
    @InjectRepository(ProductCategory)
    private readonly categoryRepo: Repository<ProductCategory>,
    private readonly redis: RedisService,
    private readonly config: ConfigService,
    private readonly langService: LangService,
  ) {}

  async findAll(langId?: number): Promise<Product[]> {
    const qb = this.productRepo
      .createQueryBuilder('p')
      .where('p.status = :status', { status: Status.Normal })
      .orderBy('p.sort', 'DESC')
      .addOrderBy('p.id', 'DESC');
    if (langId != null) qb.andWhere('p.langId = :langId', { langId });
    return qb.getMany();
  }

  async findOne(id: number): Promise<Product | null> {
    return this.productRepo.findOne({ where: { id, status: Status.Normal } });
  }

  /** 前台详情：按业务 product_id + 语言取一条正常状态记录 */
  async findByProductIdAndLang(
    productId: number,
    langId: number,
  ): Promise<Product | null> {
    return this.productRepo.findOne({
      where: { productId, langId, status: Status.Normal },
    });
  }

  async create(dto: Partial<Product>): Promise<Product> {
    const product = this.productRepo.create(dto);
    return this.productRepo.save(product);
  }

  async update(id: number, dto: Partial<Product>): Promise<Product> {
    await this.productRepo.update(id, dto as any);
    return this.productRepo.findOne({ where: { id } }) as Promise<Product>;
  }

  async remove(id: number): Promise<void> {
    await this.productRepo.delete(id);
  }

  async listCategories(langId?: number): Promise<ProductCategory[]> {
    const qb = this.categoryRepo
      .createQueryBuilder('c')
      .where('c.status = :status', { status: Status.Normal })
      .orderBy('c.sort', 'ASC');
    if (langId != null) qb.andWhere('c.langId = :langId', { langId });
    return qb.getMany();
  }

  /**
   * 产品分类列表，先读 Redis（key=productCategory:{code}）再读 DB，TTL 5 分钟。
   */
  async getCategoriesFromCache(langId: number): Promise<ProductCategory[]> {
    const lang = await this.langService.findById(langId);
    const code = lang?.code ?? String(langId);
    const key = CACHE_KEYS.PRODUCT_CATEGORY(code);
    const cached = await this.redis.get<ProductCategory[]>(key);
    if (cached) return cached;
    const list = await this.listCategories(langId);
    const ttl = this.config.get<number>('redis.layoutTtlSeconds', 300);
    await this.redis.set(key, list, ttl);
    return list;
  }

  /**
   * 产品列表，先读 Redis（key=product:{code}）再读 DB，TTL 5 分钟。
   */
  async getProductsFromCache(langId: number): Promise<Product[]> {
    const lang = await this.langService.findById(langId);
    const code = lang?.code ?? String(langId);
    const key = CACHE_KEYS.PRODUCT(code);
    const cached = await this.redis.get<Product[]>(key);
    if (cached) return cached;
    const list = await this.findAll(langId);
    const ttl = this.config.get<number>('redis.layoutTtlSeconds', 300);
    await this.redis.set(key, list, ttl);
    return list;
  }

  /**
   * 获取树形结构的分类列表（用于产品编辑表单）
   * @param langId 语言 ID，只返回该语言的分类
   * @returns 树形结构的分类数组，包含 level 字段表示层级
   */
  async getCategoriesTree(langId?: number): Promise<ProductCategory[]> {
    // 1. 获取所有分类（不过滤语言）
    const allCategories = await this.categoryRepo.find({
      where: { status: In([Status.Normal, Status.Hidden]) },
      relations: ['lang'],
      order: { sort: 'ASC', id: 'ASC' },
    });

    // 2. 根据语言过滤
    const langCategories = langId
      ? allCategories.filter((c) => c.langId === langId)
      : allCategories;

    // 3. 构建树形结构
    const categoryMap = new Map<
      number,
      ProductCategory & { children?: (ProductCategory & { level?: number })[] }
    >();
    const roots: ProductCategory[] = [];

    // 初始化 map
    langCategories.forEach((c) => {
      categoryMap.set(c.id, { ...c, children: [] });
    });

    // 构建树
    langCategories.forEach((c) => {
      const parentId = c.parentId ?? 0;
      if (parentId === 0) {
        roots.push(c);
      } else {
        const parent = categoryMap.get(parentId);
        if (parent) {
          if (!parent.children) parent.children = [];
          parent.children.push(c);
        } else {
          // 父分类不存在（可能跨语言），作为根分类
          roots.push(c);
        }
      }
    });

    // 4. 扁平化树形结构，添加 level 字段
    const result: ProductCategory[] = [];

    function flattenTree(categories: ProductCategory[], level: number) {
      categories.forEach((c) => {
        const category = { ...c, level } as ProductCategory;
        result.push(category);

        const node = categoryMap.get(c.id);
        if (node && node.children && node.children.length > 0) {
          flattenTree(node.children, level + 1);
        }
      });
    }

    flattenTree(roots, 0);
    return result;
  }

  /**
   * 获取树形结构的分类列表（从缓存）
   */
  async getCategoriesTreeFromCache(langId: number): Promise<ProductCategory[]> {
    const lang = await this.langService.findById(langId);
    const code = lang?.code ?? String(langId);
    const key = `${CACHE_KEYS.PRODUCT_CATEGORY(code)}:tree`;
    const cached = await this.redis.get<ProductCategory[]>(key);
    if (cached) return cached;

    const tree = await this.getCategoriesTree(langId);
    const ttl = this.config.get<number>('redis.layoutTtlSeconds', 300);
    await this.redis.set(key, tree, ttl);
    return tree;
  }
}
