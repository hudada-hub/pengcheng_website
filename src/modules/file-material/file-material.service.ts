import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { FileMaterial } from '../../entities/file-material.entity';
import { FileMaterialCategory } from '../../entities/file-material-category.entity';
import { Status } from '../../common/entities/base.entity';
import { unlink } from 'fs/promises';
import { join } from 'path';

@Injectable()
export class FileMaterialService {
  constructor(
    @InjectRepository(FileMaterial)
    private readonly fileRepo: Repository<FileMaterial>,
    @InjectRepository(FileMaterialCategory)
    private readonly categoryRepo: Repository<FileMaterialCategory>,
  ) {}

  async findAll(params?: {
    categoryId?: number;
    keyword?: string;
    page?: number;
    pageSize?: number;
    fileType?: string;
  }): Promise<{
    items: FileMaterial[];
    total: number;
    page: number;
    pageSize: number;
  }> {
    const page = Math.max(1, params?.page ?? 1);
    const pageSize = Math.min(60, Math.max(1, params?.pageSize ?? 24));
    const qb = this.fileRepo
      .createQueryBuilder('f')
      .leftJoinAndSelect('f.category', 'c')
      .where('f.status = :status', { status: Status.Normal })
      .orderBy('f.id', 'DESC');
    if (params?.categoryId != null)
      qb.andWhere('f.categoryId = :categoryId', {
        categoryId: params.categoryId,
      });
    if (params?.keyword)
      qb.andWhere('(f.fileName LIKE :kw OR f.filePath LIKE :kw)', { kw: `%${params.keyword}%` });
    if (params?.fileType === 'image') {
      qb.andWhere(
        '(f.file_type LIKE :imagePrefix OR f.file_type IN (:...imageExts))',
        {
          imagePrefix: 'image/%',
          imageExts: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'],
        },
      );
    }
    if (params?.fileType === 'video') {
      qb.andWhere(
        '(f.file_type LIKE :videoPrefix OR f.file_type IN (:...videoExts))',
        {
          videoPrefix: 'video/%',
          videoExts: ['mp4', 'webm', 'mov', 'avi', 'mkv'],
        },
      );
    }
    const [items, total] = await qb
      .skip((page - 1) * pageSize)
      .take(pageSize)
      .getManyAndCount();
    return { items, total, page, pageSize };
  }

  async create(dto: Partial<FileMaterial>): Promise<FileMaterial> {
    const file = this.fileRepo.create(dto);
    return this.fileRepo.save(file);
  }

  async update(id: number, dto: Partial<FileMaterial>): Promise<FileMaterial> {
    await this.fileRepo.update(id, dto as any);
    return this.fileRepo.findOne({ where: { id } }) as Promise<FileMaterial>;
  }

  async remove(id: number): Promise<void> {
    const file = await this.fileRepo.findOne({ where: { id } });
    if (file?.filePath) {
      const diskPath = join(process.cwd(), 'public', file.filePath);
      try {
        await unlink(diskPath);
      } catch (err) {
        console.warn(
          '[FileMaterial] Failed to delete file from disk:',
          diskPath,
          err.message,
        );
      }
    }
    await this.fileRepo.delete(id);
  }

  async batchUpdateCategory(
    ids: number[],
    categoryId: number | null,
  ): Promise<void> {
    if (!ids || ids.length === 0) return;
    await this.fileRepo.update({ id: In(ids) }, { categoryId } as any);
  }

  async listCategories(): Promise<FileMaterialCategory[]> {
    return this.categoryRepo.find({
      where: { status: Status.Normal },
      order: { id: 'ASC' },
    });
  }

  async createCategory(name: string): Promise<FileMaterialCategory> {
    const row = this.categoryRepo.create({ name });
    return this.categoryRepo.save(row);
  }
}
