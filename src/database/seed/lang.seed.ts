import { DataSource } from 'typeorm';
import { Lang } from '../../entities/lang.entity';

const defaultLangs = [
  { name: '中文', code: 'zh', langFullName: '简体中文', isDefault: 1 },
  { name: 'English', code: 'en', langFullName: 'English', isDefault: 0 },
  { name: '日本語', code: 'jp', langFullName: '日本語', isDefault: 0 },
  { name: '한국어', code: 'kr', langFullName: '한국어', isDefault: 0 },
  { name: 'Italiano', code: 'it', langFullName: 'Italiano', isDefault: 0 },
];

export async function seedLang(dataSource: DataSource): Promise<void> {
  const repo = dataSource.getRepository(Lang);
  for (const item of defaultLangs) {
    const existing = await repo.findOne({ where: { code: item.code } });
    if (!existing) {
      await repo.save(repo.create({ ...item, status: 1 }));
    }
  }
}
