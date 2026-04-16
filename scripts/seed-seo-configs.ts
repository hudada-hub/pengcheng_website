import 'reflect-metadata';
import { DataSource } from 'typeorm';
import * as dotenv from 'dotenv';

dotenv.config();

const dataSource = new DataSource({
  type: 'mysql',
  host: process.env.DB_HOST || '47.116.106.247',
  port: parseInt(process.env.DB_PORT || '3306'),
  username: process.env.DB_USERNAME || 'pengcheng',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_DATABASE || 'pengcheng',
  entities: [__dirname + '/src/entities/*.entity.{js,ts}'],
});

async function seedSeoConfigs() {
  await dataSource.initialize();
  console.log('数据库连接成功');

  const seoConfigs = [
    {
      name: 'seo_baidu_token',
      value: '',
      hint: '在百度搜索资源平台获取',
      type: 2,
      deletable: 0,
    },
    {
      name: 'seo_bing_api_key',
      value: '',
      hint: '在Bing Webmaster Tools获取',
      type: 2,
      deletable: 0,
    },
    {
      name: 'seo_google_api_key',
      value: '',
      hint: '在Google Search Console获取',
      type: 2,
      deletable: 0,
    },
    {
      name: 'seo_last_push_time',
      value: '',
      hint: '上次推送时间',
      type: 2,
      deletable: 0,
    },
  ];

  for (const config of seoConfigs) {
    const existing = await dataSource
      .getRepository('system_config')
      .findOne({ where: { name: config.name } } as any);

    if (existing) {
      console.log(`配置 "${config.name}" 已存在，跳过`);
    } else {
      await dataSource.getRepository('system_config').save(config);
      console.log(`配置 "${config.name}" 创建成功`);
    }
  }

  console.log('SEO配置种子数据初始化完成');
  await dataSource.destroy();
}

seedSeoConfigs()
  .then(() => {
    console.log('完成');
    process.exit(0);
  })
  .catch((error) => {
    console.error('错误:', error);
    process.exit(1);
  });