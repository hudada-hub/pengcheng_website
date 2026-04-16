import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, IsNull, QueryFailedError, Repository } from 'typeorm';
import { randomUUID } from 'crypto';
import { MemberCart } from '../../entities/member-cart.entity';
import { MemberCartItem } from '../../entities/member-cart-item.entity';
import { MemberCartMergeLog } from '../../entities/member-cart-merge-log.entity';
import { MemberCartInquiryOrder } from '../../entities/member-cart-inquiry-order.entity';
import { MemberCartInquiry } from '../../entities/member-cart-inquiry.entity';
import { Product } from '../../entities/product.entity';
import { ProductParamValueRel } from '../../entities/product-param-value-rel.entity';
import { ProductParamValue } from '../../entities/product-param-value.entity';
import { ProductParamCategory } from '../../entities/product-param-category.entity';
import { ContactMessage } from '../../entities/contact-message.entity';
import { Status } from '../../common/entities/base.entity';
import { LangService } from '../../i18n/lang.service';
import { MemberService } from './member.service';
import { MailService } from '../mail/mail.service';
import {
  CartParamCategoryOptionDto,
  MemberCartItemAttributeDto,
  MemberCartItemDetailDto,
  MemberCartItemDto,
  MemberCartMergeGuestItemDto,
} from './dto/member-cart.dto';

const MERGE_TOKEN_MAX = 64;

function isMysqlDuplicateKey(err: unknown): boolean {
  if (!(err instanceof QueryFailedError)) {
    return false;
  }
  const e = err as QueryFailedError & { errno?: number; code?: string };
  if (e.errno === 1062 || e.code === 'ER_DUP_ENTRY') {
    return true;
  }
  const de = e.driverError as { errno?: number; code?: string } | undefined;
  return de?.errno === 1062 || de?.code === 'ER_DUP_ENTRY';
}

function trimField(s: unknown, max: number): string | null {
  if (s == null) return null;
  const t = String(s).trim();
  if (!t) return null;
  return t.slice(0, max);
}

@Injectable()
export class MemberCartService {
  constructor(
    @InjectRepository(MemberCart)
    private readonly cartRepo: Repository<MemberCart>,
    @InjectRepository(MemberCartItem)
    private readonly itemRepo: Repository<MemberCartItem>,
    @InjectRepository(MemberCartInquiryOrder)
    private readonly inquiryOrderRepo: Repository<MemberCartInquiryOrder>,
    @InjectRepository(MemberCartInquiry)
    private readonly inquiryRepo: Repository<MemberCartInquiry>,
    @InjectRepository(Product)
    private readonly productRepo: Repository<Product>,
    @InjectRepository(ProductParamValueRel)
    private readonly paramRelRepo: Repository<ProductParamValueRel>,
    @InjectRepository(ProductParamValue)
    private readonly paramValueRepo: Repository<ProductParamValue>,
    @InjectRepository(ProductParamCategory)
    private readonly paramCategoryRepo: Repository<ProductParamCategory>,
    @InjectRepository(ContactMessage)
    private readonly contactRepo: Repository<ContactMessage>,
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly langService: LangService,
    private readonly memberService: MemberService,
    private readonly mailService: MailService,
  ) {}

  async ensureCart(userId: number): Promise<MemberCart> {
    let cart = await this.cartRepo.findOne({
      where: { userId, status: Status.Normal },
    });
    if (!cart) {
      cart = await this.cartRepo.save(
        this.cartRepo.create({ userId, status: Status.Normal }),
      );
    }
    return cart;
  }

  /**
   * 每次添加都创建新行，不合并相同产品
   * 新行须 qtyDelta ≥ 1。
   */
  async addItem(
    userId: number,
    productId: number,
    qtyDelta: number,
  ): Promise<void> {
    if (!Number.isFinite(productId) || productId <= 0) {
      throw new BadRequestException('productId invalid');
    }
    if (!Number.isFinite(qtyDelta) || qtyDelta === 0) {
      throw new BadRequestException('qtyDelta invalid');
    }
    const cart = await this.ensureCart(userId);
    if (qtyDelta < 1) {
      throw new BadRequestException('qtyDelta must be >= 1 for new line');
    }
    await this.itemRepo.save(
      this.itemRepo.create({
        cartId: cart.id,
        productId,
        qty: qtyDelta,
        status: Status.Normal,
        inquiryOrderUuid: null,
      }),
    );
  }

  private async listActiveItems(cartId: number): Promise<MemberCartItem[]> {
    return this.itemRepo.find({
      where: {
        cartId,
        status: Status.Normal,
        inquiryOrderUuid: IsNull(),
      },
      order: { id: 'ASC' },
    });
  }

  /**
   * 无 locale 时仅返回 itemId / productId / qty；
   * 有 locale 时返回缩略图、分类名、标题、参数列表（当前语言行）。
   */
  async getItems(
    userId: number,
    localeSegment?: string | null,
  ): Promise<MemberCartItemDto[] | MemberCartItemDetailDto[]> {
    const cart = await this.cartRepo.findOne({
      where: { userId, status: Status.Normal },
    });
    if (!cart) {
      return [];
    }
    const rows = await this.listActiveItems(cart.id);
    if (localeSegment === undefined || localeSegment === null) {
      return rows.map((i) => ({
        itemId: i.id,
        productId: i.productId,
        qty: i.qty,
      }));
    }
    const lang = await this.langService.findByCodeForRoute(
      String(localeSegment).replace(/^\//, '').split('/')[0] || '',
    );
    if (!lang) {
      return rows.map((i) => ({
        itemId: i.id,
        productId: i.productId,
        qty: i.qty,
      }));
    }
    return this.enrichItems(rows, lang.id);
  }

  async getItemCount(userId: number): Promise<number> {
    const cart = await this.cartRepo.findOne({
      where: { userId, status: Status.Normal },
    });
    if (!cart) {
      return 0;
    }
    const rows = await this.listActiveItems(cart.id);
    return rows.length;
  }

  private async enrichItems(
    rows: MemberCartItem[],
    langId: number,
  ): Promise<MemberCartItemDetailDto[]> {
    if (!rows.length) return [];
    // 兼容：MemberCartItem.productId 可能是 product.id 或 product.productId
    const productIds = [...new Set(rows.map((r) => r.productId))];
    // 先用 id 查询
    let products = await this.productRepo.find({
      where: {
        id: In(productIds),
        langId,
        status: Status.Normal,
      },
      relations: { category: true },
    });
    // 如果还有未找到的产品，再用 productId 查询
    const foundIds = new Set(products.map((p) => p.id));
    const notFoundIds = productIds.filter((id) => !foundIds.has(id));
    if (notFoundIds.length > 0) {
      const productsByBizId = await this.productRepo.find({
        where: {
          productId: In(notFoundIds),
          langId,
          status: Status.Normal,
        },
        relations: { category: true },
      });
      products = [...products, ...productsByBizId];
    }
    // 建立两个映射表：一个用 id 做 key，一个用 productId 做 key
    const byId = new Map(products.map((p) => [p.id, p]));
    const byBizId = new Map(products.map((p) => [p.productId, p]));
    const rowIds = products.map((p) => p.id);
    const attrsByRowId = new Map<number, MemberCartItemAttributeDto[]>();
    if (rowIds.length) {
      const rels = await this.paramRelRepo.find({
        where: { productRowId: In(rowIds) },
        relations: { paramValue: { category: true } },
        order: { sort: 'ASC', id: 'ASC' },
      });
      for (const rel of rels) {
        const pv = rel.paramValue;
        if (!pv || pv.langId !== langId) continue;
        const cat = pv.category;
        if (!cat || cat.langId !== langId) continue;
        const list = attrsByRowId.get(rel.productRowId) ?? [];
        list.push({
          categoryId: cat.id,
          categoryTitle: cat.title,
          valueId: pv.id,
          valueTitle: pv.value,
          value: pv.value,
        });
        attrsByRowId.set(rel.productRowId, list);
      }
    }
    return rows.map((item) => {
      // 兼容：先尝试用 id 查找，再用 productId 查找
      let p = byId.get(item.productId);
      if (!p) {
        p = byBizId.get(item.productId);
      }
      const attrs = p ? (attrsByRowId.get(p.id) ?? []) : [];
      return {
        itemId: item.id,
        productId: item.productId,
        qty: item.qty,
        title: p?.name || `Product #${item.productId}`,
        thumbUrl: p?.thumbUrl ?? null,
        categoryId: p?.categoryId ?? null,
        categoryName: p?.category?.name ?? null,
        attributes: attrs,
      };
    });
  }

  async updateQty(userId: number, itemId: number, qty: number): Promise<void> {
    if (!Number.isFinite(qty) || qty < 1) {
      throw new BadRequestException('qty must be >= 1');
    }
    const cart = await this.cartRepo.findOne({
      where: { userId, status: Status.Normal },
    });
    if (!cart) {
      throw new BadRequestException('cart not found');
    }
    const item = await this.itemRepo.findOne({
      where: {
        id: itemId,
        cartId: cart.id,
        status: Status.Normal,
        inquiryOrderUuid: IsNull(),
      },
    });
    if (!item) {
      throw new BadRequestException('item not found');
    }
    item.qty = qty;
    await this.itemRepo.save(item);
  }

  async removeItem(userId: number, itemId: number): Promise<void> {
    const cart = await this.cartRepo.findOne({
      where: { userId, status: Status.Normal },
    });
    if (!cart) {
      return;
    }
    await this.itemRepo.delete({
      id: itemId,
      cartId: cart.id,
      inquiryOrderUuid: IsNull(),
    });
  }

  async clearAll(userId: number): Promise<void> {
    const cart = await this.cartRepo.findOne({
      where: { userId, status: Status.Normal },
    });
    if (!cart) {
      return;
    }
    await this.itemRepo.delete({
      cartId: cart.id,
      inquiryOrderUuid: IsNull(),
    });
  }

  async mergeGuest(
    userId: number,
    mergeToken: string,
    items: MemberCartMergeGuestItemDto[],
  ): Promise<void> {
    const token = (mergeToken || '').trim();
    if (!token || token.length > MERGE_TOKEN_MAX) {
      throw new BadRequestException('mergeToken invalid');
    }
    await this.dataSource.transaction(async (em) => {
      try {
        await em.insert(MemberCartMergeLog, {
          userId,
          mergeToken: token,
          status: Status.Normal,
        });
      } catch (e) {
        if (isMysqlDuplicateKey(e)) {
          return;
        }
        throw e;
      }
      let cart = await em.findOne(MemberCart, {
        where: { userId, status: Status.Normal },
      });
      if (!cart) {
        cart = await em.save(
          em.create(MemberCart, { userId, status: Status.Normal }),
        );
      }
      for (const row of items) {
        const productId = row.productId;
        const q = row.qty;
        if (!Number.isFinite(productId) || productId <= 0) {
          continue;
        }
        if (!Number.isFinite(q) || q <= 0) {
          continue;
        }
        const line = await em.findOne(MemberCartItem, {
          where: {
            cartId: cart.id,
            productId,
            status: Status.Normal,
            inquiryOrderUuid: IsNull(),
          },
        });
        if (line) {
          line.qty += q;
          await em.save(line);
        } else {
          await em.save(
            em.create(MemberCartItem, {
              cartId: cart.id,
              productId,
              qty: q,
              status: Status.Normal,
              inquiryOrderUuid: null,
            }),
          );
        }
      }
    });
  }

  /**
   * Next：生成询价订单 UUID，记录当前车内所有「未绑定」行作为询价快照。
   * 返回快照供前端展示询价页（商品仍保留在购物车中，直到提交询价后才移除）。
   */
  async startInquiry(
    userId: number,
    localeSegment: string,
  ): Promise<{ orderUuid: string; items: MemberCartItemDetailDto[] }> {
    const lang = await this.langService.findByCodeForRoute(
      (localeSegment || '').replace(/^\//, '').split('/')[0] || '',
    );
    if (!lang) {
      throw new BadRequestException('locale invalid');
    }
    const cart = await this.ensureCart(userId);
    const active = await this.listActiveItems(cart.id);
    if (!active.length) {
      throw new BadRequestException('cart is empty');
    }
    const orderUuid = randomUUID();
    await this.inquiryOrderRepo.save(
      this.inquiryOrderRepo.create({
        orderUuid,
        userId,
        status: Status.Normal,
      }),
    );
    const enriched = await this.enrichItems(active, lang.id);
    // 注意：不在此处更新 inquiryOrderUuid，而是在 submitCartInquiry 成功后才更新
    return { orderUuid, items: enriched };
  }

  /**
   * 提交询价：校验订单归属与行存在，写入询价表 + 联系留言（后台可见）。
   */
  async submitCartInquiry(
    userId: number,
    body: {
      orderUuid?: string;
      fullName: string;
      email: string;
      nation?: string;
      location?: string;
      phone?: string;
      question?: string;
      sourceUrl?: string;
    },
    baseUrl?: string,
  ): Promise<void> {
    const orderUuid = (body.orderUuid || '').trim() || null;

    // 如果有 orderUuid，验证订单存在
    if (orderUuid) {
      const order = await this.inquiryOrderRepo.findOne({
        where: { orderUuid, userId, status: Status.Normal },
      });
      if (!order) {
        throw new BadRequestException('inquiry order not found');
      }

      // 检查是否已提交过
      const existingInquiry = await this.inquiryRepo.findOne({
        where: { inquiryOrderUuid: orderUuid, userId, status: Status.Normal },
      });
      if (existingInquiry) {
        throw new BadRequestException('inquiry already submitted');
      }
    }

    // 获取购物车商品（如果有购物车的话）
    let activeItems: MemberCartItem[] = [];
    const cart = await this.cartRepo.findOne({
      where: { userId, status: Status.Normal },
    });
    if (cart && orderUuid) {
      // 只有当有 orderUuid 时才获取购物车商品
      activeItems = await this.listActiveItems(cart.id);
    }

    const fullName = trimField(body.fullName, 128);
    const email = trimField(body.email, 128);
    if (!fullName || !email || !this.memberService.isPlausibleEmail(email)) {
      throw new BadRequestException('invalid name or email');
    }

    // 保存询价记录
    const savedInquiry = await this.inquiryRepo.save(
      this.inquiryRepo.create({
        userId,
        inquiryOrderUuid: orderUuid,
        fullName,
        email,
        nation: trimField(body.nation, 128),
        locationCity: trimField(body.location, 255),
        phoneNumber: trimField(body.phone, 64),
        message: trimField(body.question, 65535),
        sourceUrl: trimField(body.sourceUrl, 512),
        status: Status.Normal,
      }),
    );

    // 构建留言摘要
    const summary = activeItems
      .map((b) => `- productId ${b.productId} × ${b.qty}`)
      .join('\n');
    const msg =
      (trimField(body.question, 65535) || '') +
      (activeItems.length && orderUuid
        ? `\n\n[CART ${orderUuid}]\n${summary}`
        : '');

    // 保存联系留言
    await this.contactRepo.save(
      this.contactRepo.create({
        fullName,
        email,
        nation: trimField(body.nation, 128),
        locationCity: trimField(body.location, 255),
        phoneNumber: trimField(body.phone, 64),
        message: msg,
        userId,
        inquiryOrderUuid: orderUuid,
        status: Status.Normal,
      }),
    );

    // 提交成功后，将购物车商品绑定到该订单（从当前购物车中移除）
    if (cart && orderUuid && activeItems.length > 0) {
      await this.itemRepo
        .createQueryBuilder()
        .update(MemberCartItem)
        .set({ inquiryOrderUuid: orderUuid })
        .where('cart_id = :cid', { cid: cart.id })
        .andWhere('inquiry_order_uuid IS NULL')
        .andWhere('status = :status', { status: Status.Normal })
        .execute();
    }

    // 发送邮件通知销售（无论是否有购物车商品都发送）
    await this.sendCartInquiryEmail(savedInquiry, activeItems, baseUrl);
  }

  private async sendCartInquiryEmail(
    inquiry: MemberCartInquiry,
    items: MemberCartItem[],
    baseUrl?: string,
  ): Promise<void> {
    if (!items.length) {
      // 没有商品也发送邮件，只是不包含商品信息
      try {
        await this.mailService.sendCartInquiryEmail({
          inquiryId: inquiry.id,
          orderUuid: inquiry.inquiryOrderUuid || '',
          fullName: inquiry.fullName || '',
          email: inquiry.email || '',
          nation: inquiry.nation,
          locationCity: inquiry.locationCity,
          phoneNumber: inquiry.phoneNumber,
          message: inquiry.message,
          items: [],
          createdAt: inquiry.createdAt,
          baseUrl,
        });
      } catch (error) {
        console.error('发送询价邮件失败:', error);
      }
      return;
    }

    // 获取产品信息（兼容：MemberCartItem.productId 可能是 product.id 或 product.productId）
    const productIds = [...new Set(items.map((i) => i.productId))];
    console.log(
      '查询产品信息, productIds:',
      productIds,
      'items:',
      items.map((i) => ({ id: i.id, productId: i.productId, qty: i.qty })),
    );

    // 先用 id 查询
    let products = await this.productRepo.find({
      where: { id: In(productIds) },
      relations: { category: true },
    });

    // 如果还有未找到的产品，再用 productId 查询
    const foundIds = new Set(products.map((p) => p.id));
    const notFoundIds = productIds.filter((id) => !foundIds.has(id));
    if (notFoundIds.length > 0) {
      console.log('用 id 未找到的产品，尝试用 productId 查询:', notFoundIds);
      const productsByBizId = await this.productRepo.find({
        where: { productId: In(notFoundIds) },
        relations: { category: true },
      });
      products = [...products, ...productsByBizId];
    }

    console.log(
      '查询到的产品数量:',
      products.length,
      '产品:',
      products.map((p) => ({
        id: p.id,
        productId: p.productId,
        name: p.name,
        langId: p.langId,
        status: p.status,
      })),
    );

    // 建立两个映射表：一个用 id 做 key，一个用 productId 做 key
    const productById = new Map<number, Product>();
    const productByBizId = new Map<number, Product>();
    for (const p of products) {
      productById.set(p.id, p);
      productByBizId.set(p.productId, p);
    }

    // 获取产品参数
    const rowIds = products.map((p) => p.id);
    const attrsByRowId = new Map<
      number,
      { categoryTitle: string; valueTitle: string }[]
    >();
    if (rowIds.length) {
      const rels = await this.paramRelRepo.find({
        where: { productRowId: In(rowIds) },
        relations: { paramValue: { category: true } },
        order: { sort: 'ASC', id: 'ASC' },
      });
      for (const rel of rels) {
        const pv = rel.paramValue;
        if (!pv) continue;
        const cat = pv.category;
        if (!cat) continue;
        const list = attrsByRowId.get(rel.productRowId) ?? [];
        list.push({
          categoryTitle: cat.title,
          valueTitle: pv.value,
        });
        attrsByRowId.set(rel.productRowId, list);
      }
    }

    const mailItems = items.map((item) => {
      // 兼容：先尝试用 id 查找，再用 productId 查找
      let product = productById.get(item.productId);
      if (!product) {
        product = productByBizId.get(item.productId);
      }
      if (!product) {
        console.log(
          `未找到产品信息: productId=${item.productId}, 可用IdKeys=${Array.from(productById.keys()).join(',')}, 可用BizIdKeys=${Array.from(productByBizId.keys()).join(',')}`,
        );
      }
      const attrs = product ? (attrsByRowId.get(product.id) ?? []) : [];
      return {
        productId: item.productId,
        productName:
          product?.name || product?.detailTitle || `产品 #${item.productId}`,
        quantity: item.qty,
        thumbUrl: product?.thumbUrl || undefined,
        attributes: attrs,
      };
    });

    try {
      await this.mailService.sendCartInquiryEmail({
        inquiryId: inquiry.id,
        orderUuid: inquiry.inquiryOrderUuid || '',
        fullName: inquiry.fullName || '',
        email: inquiry.email || '',
        nation: inquiry.nation,
        locationCity: inquiry.locationCity,
        phoneNumber: inquiry.phoneNumber,
        message: inquiry.message,
        items: mailItems,
        createdAt: inquiry.createdAt,
        baseUrl,
      });
    } catch (error) {
      // 邮件发送失败不影响业务流程，只记录日志
      console.error('发送询价邮件失败:', error);
    }
  }

  private async resolveLangIdFromSegment(
    localeSegment: string,
  ): Promise<number> {
    const seg = (localeSegment || '').replace(/^\//, '').split('/')[0] || '';
    const lang = await this.langService.findByCodeForRoute(seg);
    if (!lang) {
      throw new BadRequestException('locale invalid');
    }
    return lang.id;
  }

  /** 某产品分类下，当前语言所有可选参数维度及取值（去重） */
  async getCategoryParamOptions(
    userId: number,
    categoryId: number,
    localeSegment: string,
  ): Promise<CartParamCategoryOptionDto[]> {
    await this.ensureCart(userId);
    const langId = await this.resolveLangIdFromSegment(localeSegment);

    // 获取该产品分类下所有产品使用的参数分类ID
    const products = await this.productRepo.find({
      where: { categoryId, langId, status: Status.Normal },
      select: { id: true },
    });
    console.log(
      '[getCategoryParamOptions] Products in category:',
      products.length,
      'categoryId:',
      categoryId,
      'langId:',
      langId,
    );
    const rowIds = products.map((p) => p.id);
    if (!rowIds.length) {
      console.log(
        '[getCategoryParamOptions] No products found, returning empty',
      );
      return [];
    }

    // 获取这些产品关联的所有参数值，提取参数分类ID
    const rels = await this.paramRelRepo.find({
      where: { productRowId: In(rowIds) },
      relations: { paramValue: true },
    });
    console.log(
      '[getCategoryParamOptions] Param relations found:',
      rels.length,
    );

    const categoryIds = new Set<number>();
    for (const rel of rels) {
      const pv = rel.paramValue;
      if (pv && pv.langId === langId) {
        categoryIds.add(pv.categoryId);
      }
    }
    console.log(
      '[getCategoryParamOptions] Unique param categories:',
      categoryIds.size,
    );

    if (!categoryIds.size) return [];

    // 查询这些参数分类下的所有参数值
    const paramValues = await this.paramValueRepo.find({
      where: {
        categoryId: In([...categoryIds]),
        langId,
        status: Status.Normal,
      },
      relations: { category: true },
      order: { sort: 'ASC', id: 'ASC' },
    });

    // 按参数分类分组
    const catMap = new Map<
      number,
      {
        title: string;
        sort: number;
        values: Map<
          number,
          { id: number; title: string; value: string | null }
        >;
      }
    >();

    for (const pv of paramValues) {
      const cat = pv.category;
      if (!cat || cat.langId !== langId) continue;

      let bucket = catMap.get(cat.id);
      if (!bucket) {
        bucket = { title: cat.title, sort: cat.sort, values: new Map() };
        catMap.set(cat.id, bucket);
      }

      if (!bucket.values.has(pv.id)) {
        bucket.values.set(pv.id, {
          id: pv.id,
          title: pv.value,
          value: pv.value,
        });
      }
    }

    return [...catMap.entries()]
      .sort((a, b) => a[1].sort - b[1].sort || a[0] - b[0])
      .map(([cid, v]) => ({
        categoryId: cid,
        categoryTitle: v.title,
        values: [...v.values.values()],
      }));
  }

  /** 购物车行所属分类下的参数选项（与分类接口一致，便于按行拉取） */
  async getItemParamOptions(
    userId: number,
    itemId: number,
    localeSegment: string,
  ): Promise<CartParamCategoryOptionDto[]> {
    const cart = await this.cartRepo.findOne({
      where: { userId, status: Status.Normal },
    });
    if (!cart) {
      console.log('[getItemParamOptions] Cart not found for userId:', userId);
      throw new NotFoundException('cart not found');
    }
    const item = await this.itemRepo.findOne({
      where: {
        id: itemId,
        cartId: cart.id,
        status: Status.Normal,
        inquiryOrderUuid: IsNull(),
      },
    });
    if (!item) {
      console.log(
        '[getItemParamOptions] Item not found. itemId:',
        itemId,
        'cartId:',
        cart.id,
      );
      throw new NotFoundException('item not found');
    }
    const langId = await this.resolveLangIdFromSegment(localeSegment);
    console.log(
      '[getItemParamOptions] Looking for product. productId:',
      item.productId,
      'langId:',
      langId,
    );
    const p = await this.productRepo.findOne({
      where: {
        productId: item.productId,
        langId,
        status: Status.Normal,
      },
    });
    console.log(
      '[getItemParamOptions] Found product:',
      p?.id,
      'categoryId:',
      p?.categoryId,
    );
    if (!p?.categoryId) {
      return [];
    }
    const result = await this.getCategoryParamOptions(
      userId,
      p.categoryId,
      localeSegment,
    );
    console.log('[getItemParamOptions] Result options count:', result.length);
    return result;
  }

  /**
   * 在同一分类下，按所选参数值（product_param_value.id）唯一匹配产品，替换购物车行的 product_id。
   */
  async replaceItemProductByParamValues(
    userId: number,
    itemId: number,
    localeSegment: string,
    paramValueIds: number[],
  ): Promise<MemberCartItemDetailDto> {
    const uniq = [...new Set(paramValueIds)].filter(
      (n) => Number.isFinite(n) && n > 0,
    );
    if (!uniq.length) {
      throw new BadRequestException('paramValueIds required');
    }
    const cart = await this.cartRepo.findOne({
      where: { userId, status: Status.Normal },
    });
    if (!cart) {
      throw new BadRequestException('cart not found');
    }
    const item = await this.itemRepo.findOne({
      where: {
        id: itemId,
        cartId: cart.id,
        status: Status.Normal,
        inquiryOrderUuid: IsNull(),
      },
    });
    if (!item) {
      throw new BadRequestException('item not found');
    }
    const langId = await this.resolveLangIdFromSegment(localeSegment);
    const current = await this.productRepo.findOne({
      where: {
        productId: item.productId,
        langId,
        status: Status.Normal,
      },
    });
    if (!current?.categoryId) {
      throw new BadRequestException('product has no category');
    }
    const candRows = await this.productRepo.find({
      where: {
        categoryId: current.categoryId,
        langId,
        status: Status.Normal,
      },
      select: { id: true, productId: true },
    });
    const want = new Set(uniq);
    const matches: { id: number; productId: number }[] = [];
    for (const c of candRows) {
      const rels = await this.paramRelRepo.find({
        where: { productRowId: c.id },
        select: { paramValueId: true },
      });
      const have = new Set(rels.map((r) => r.paramValueId));
      let ok = true;
      for (const id of want) {
        if (!have.has(id)) {
          ok = false;
          break;
        }
      }
      if (ok) matches.push(c);
    }
    if (matches.length !== 1) {
      throw new BadRequestException(
        matches.length === 0
          ? 'no product matches the selected parameters'
          : 'multiple products match; narrow parameter selection',
      );
    }
    // 使用 product.id（行ID）而不是 product.productId（业务ID）
    const newProductId = matches[0].id;
    item.productId = newProductId;
    await this.itemRepo.save(item);
    const [detail] = await this.enrichItems([item], langId);
    return detail;
  }
}
