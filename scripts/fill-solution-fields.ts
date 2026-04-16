/**
 * 脚本：参考 solution 表 id 为 56 的记录，填充其他记录的空字段
 *
 * 使用方法：
 * npx ts-node scripts/fill-solution-fields.ts
 */

import { DataSource } from 'typeorm';
import { Solution } from '../src/entities/solution.entity';
import { SolutionCategory } from '../src/entities/solution-category.entity';
import { Lang } from '../src/entities/lang.entity';

// 参考记录（id=56）的字段值
const REFERENCE_DATA = {
  bannerBgUrl: '/uploads/202603/1774182026457-bf734b14f6e74b99.png',
  bannerTitle: 'Utility-Scale & Grid-Oriented Energy Storage Solutions',
  bannerDesc:
    'Based on a high-voltage DC architecture and liquid cooling platform, and integrating battery systems, safety, and thermal management engineering, we provide highly reliable and scalable large-scale energy storage solutions.',
  viewCount: 6234,
  kehuBannerUrl: '/uploads/202603/1774182109126-80784f6a30dd0ea9.jpg',
  kehu: [
    {
      title: 'Flexible Deployment Across Grid Scenarios',
      content:
        'Adaptable to renewable integration, peak shaving, frequency regulation and shared storage projects.',
    },
    {
      title: 'High Availability and Long-Term Performance',
      content:
        'Optimized thermal and system design ensure stable operation under high power and high cycling conditions.',
    },
    {
      title: 'Grid-Friendly Design for Stable Power Systems',
      content: 'Engineered to support grid stability and comply with grid requirements.',
    },
  ],
  relatedIndustryCaseIds: '8,14,20',
  categoryId: '20',
};

async function main() {
  // 从 .env 文件加载配置
  require('dotenv').config();

  // 创建数据库连接
  const dataSource = new DataSource({
    type: 'mysql',
    host: process.env.DB_HOST || '127.0.0.1',
    port: parseInt(process.env.DB_PORT || '3306', 10),
    username: process.env.DB_USERNAME || 'pengcheng',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_DATABASE || 'pengcheng',
    entities: [Solution, SolutionCategory, Lang],
    synchronize: false,
    logging: false,
  });

  try {
    await dataSource.initialize();
    console.log('数据库连接成功');

    const solutionRepo = dataSource.getRepository(Solution);

    // 获取参考记录（id=56）
    const referenceRecord = await solutionRepo.findOne({ where: { id: 56 } });
    if (!referenceRecord) {
      console.log('参考记录（id=56）不存在');
      return;
    }
    console.log('参考记录:', referenceRecord.title);

    // 获取所有其他记录（排除 id=56）
    const otherRecords = await solutionRepo.find({
      where: {},
    });

    let updatedCount = 0;

    for (const record of otherRecords) {
      // 跳过参考记录本身
      if (record.id === 56) continue;

      let hasUpdate = false;
      const updateData: Partial<Solution> = {};

      // 检查并填充 banner_bg_url
      if (!record.bannerBgUrl) {
        updateData.bannerBgUrl = REFERENCE_DATA.bannerBgUrl;
        hasUpdate = true;
      }

      // 检查并填充 banner_title
      if (!record.bannerTitle) {
        updateData.bannerTitle = REFERENCE_DATA.bannerTitle;
        hasUpdate = true;
      }

      // 检查并填充 banner_desc
      if (!record.bannerDesc) {
        updateData.bannerDesc = REFERENCE_DATA.bannerDesc;
        hasUpdate = true;
      }

      // 检查并填充 view_count（如果为 0 或 null）
      if (!record.viewCount || record.viewCount === 0) {
        updateData.viewCount = REFERENCE_DATA.viewCount;
        hasUpdate = true;
      }

      // 检查并填充 kehu_banner_url
      if (!record.kehuBannerUrl) {
        updateData.kehuBannerUrl = REFERENCE_DATA.kehuBannerUrl;
        hasUpdate = true;
      }

      // 检查并填充 kehu（如果为空数组或 null）
      if (!record.kehu || record.kehu.length === 0) {
        updateData.kehu = REFERENCE_DATA.kehu;
        hasUpdate = true;
      }

      // 检查并填充 related_industry_case_ids
      if (!record.relatedIndustryCaseIds) {
        updateData.relatedIndustryCaseIds = REFERENCE_DATA.relatedIndustryCaseIds;
        hasUpdate = true;
      }

      // 检查并填充 category_id
      if (!record.categoryId) {
        updateData.categoryId = REFERENCE_DATA.categoryId;
        hasUpdate = true;
      }

      // 如果有更新，执行更新
      if (hasUpdate) {
        await solutionRepo.update(record.id, updateData);
        console.log(`已更新记录 id=${record.id}, title=${record.title}`);
        console.log('  更新字段:', Object.keys(updateData).join(', '));
        updatedCount++;
      }
    }

    console.log(`\n完成！共更新了 ${updatedCount} 条记录`);
  } catch (error) {
    console.error('执行出错:', error);
  } finally {
    if (dataSource.isInitialized) {
      await dataSource.destroy();
    }
  }
}

main();
