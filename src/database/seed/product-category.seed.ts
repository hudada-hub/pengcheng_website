import { DataSource } from 'typeorm';
import { ProductCategory } from '../../entities/product-category.entity';
import { Lang } from '../../entities/lang.entity';
import { Status } from '../../common/entities/base.entity';

/** 产品分类节点：name + sort + 可选的子节点（仅动力电池、储能为 3 级，工程机械为 2 级） */
interface CategoryNode {
  name: string;
  sort: number;
  children?: CategoryNode[];
}

const PRODUCT_CATEGORY_TREE: CategoryNode[] = [
  {
    name: '动力电池',
    sort: 0,
    children: [
      {
        name: '叉车锂电池',
        sort: 0,
        children: [
          { name: '24V叉车锂电池', sort: 0 },
          { name: '36V叉车锂电池', sort: 1 },
          { name: '48V叉车锂电池', sort: 2 },
          { name: '80V叉车锂电池', sort: 3 },
          { name: '高压叉车锂电池', sort: 4 },
        ],
      },
      {
        name: '高空作业平台锂电池',
        sort: 1,
        children: [
          { name: '24V高空作业平台锂电池', sort: 0 },
          { name: '48V高空作业平台锂电池', sort: 1 },
          { name: '80V高空作业平台锂电池', sort: 2 },
          { name: '高压高空作业平台锂电池', sort: 3 },
        ],
      },
      {
        name: '高尔夫球车锂电池',
        sort: 2,
        children: [
          { name: '36V高尔夫球车锂电池', sort: 0 },
          { name: '48V高尔夫球车锂电池', sort: 1 },
          { name: '72V高尔夫球车锂电池', sort: 2 },
        ],
      },
      {
        name: '低速车锂电池',
        sort: 3,
        children: [
          { name: '60V低速车锂电池', sort: 0 },
          { name: '72V低速车锂电池', sort: 1 },
        ],
      },
      {
        name: '驻车锂电池',
        sort: 4,
        children: [{ name: '24V驻车锂电池', sort: 0 }],
      },
    ],
  },
  {
    name: '储能',
    sort: 1,
    children: [
      {
        name: '储能Pack',
        sort: 0,
        children: [
          { name: '风冷Pack(1P16S)', sort: 0 },
          { name: '液冷Pack(1P48S)', sort: 1 },
          { name: '液冷Pack(1P52S)', sort: 2 },
          { name: '液冷Pack(1P104S)', sort: 3 },
        ],
      },
      {
        name: '储能系统',
        sort: 1,
        children: [
          { name: '3.44兆瓦时液冷储能系统', sort: 0 },
          { name: '4.07兆瓦时液冷储能系统', sort: 1 },
          { name: '5.01兆瓦时液冷储能系统', sort: 2 },
          { name: '20英尺液冷式储能系统', sort: 3 },
          { name: '户外一体化液冷储能系统柜', sort: 4 },
          { name: '0.5 P/418 kWh 液冷储能系统柜', sort: 5 },
        ],
      },
      {
        name: '储能柜',
        sort: 2,
        children: [
          { name: '直流液冷电池柜', sort: 0 },
          { name: '光伏储能柜式系统', sort: 1 },
          { name: '住宅储能系统', sort: 2 },
        ],
      },
    ],
  },
  {
    name: '工程机械',
    sort: 2,
    children: [
      { name: '装载机油电转换', sort: 0 },
      { name: '挖掘机油改电', sort: 1 },
      { name: '矿用卡车油电转换', sort: 2 },
      { name: '港口拖拉机油电转换', sort: 3 },
      { name: '正面吊油电转换', sort: 4 },
      { name: '堆垛机油转电转换', sort: 5 },
      { name: '叉车油改电改装', sort: 6 },
      { name: '高空作业平台油电转换', sort: 7 },
      { name: '油罐车石油改电力', sort: 8 },
      { name: '推土机油改电', sort: 9 },
      { name: '移动供电车', sort: 10 },
    ],
  },
];

export async function seedProductCategory(
  dataSource: DataSource,
  langCode = 'cn',
): Promise<number> {
  const repo = dataSource.getRepository(ProductCategory);
  const langRepo = dataSource.getRepository(Lang);
  const lang = await langRepo.findOne({
    where: { code: langCode, status: Status.Normal },
  });
  if (!lang) {
    throw new Error(
      `未找到语言 code=${langCode}，请先执行语言 seed 或确保存在该语言`,
    );
  }
  const langId = lang.id;

  const existing = await repo.find({
    where: { langId, status: Status.Normal },
    take: 1,
  });
  if (existing.length > 0) {
    return 0; // 已有数据，跳过
  }

  let inserted = 0;

  async function insertNode(
    node: CategoryNode,
    parentId: number,
    categoryId: number | null,
    sortOffset: number,
  ): Promise<void> {
    const entity = repo.create({
      name: node.name,
      metaTitle: node.name,
      parentId,
      langId,
      categoryId: categoryId ?? null,
      sort: node.sort + sortOffset,
      status: Status.Normal,
    } as any);
    const saved = await repo.save(entity);
    const id = Array.isArray(saved)
      ? saved[0].id
      : (saved as ProductCategory).id;
    if (parentId === 0) {
      await repo.update(id, { categoryId: id } as any);
    }
    inserted += 1;
    let childSort = 0;
    if (node.children && node.children.length > 0) {
      const nextCategoryId = parentId === 0 ? id : categoryId;
      for (const child of node.children) {
        await insertNode(child, id, nextCategoryId, childSort * 100);
        childSort += 1;
      }
    }
  }

  for (let i = 0; i < PRODUCT_CATEGORY_TREE.length; i++) {
    await insertNode(PRODUCT_CATEGORY_TREE[i], 0, 0, i * 100);
  }

  return inserted;
}
