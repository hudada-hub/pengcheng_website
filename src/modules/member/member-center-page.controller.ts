import {
  Controller,
  Get,
  NotFoundException,
  Param,
  Req,
  Res,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { LangService } from '../../i18n/lang.service';
import { WebsiteLayoutService } from '../website/website-layout.service';
import {
  BaseWebsiteController,
  LOCALE_KEY,
} from '../website/base-website.controller';
import type { LayoutCachePayload } from '../website/website-layout.types';
import { MemberCart } from '../../entities/member-cart.entity';
import { ContactMessage } from '../../entities/contact-message.entity';
import { MemberCartInquiry } from '../../entities/member-cart-inquiry.entity';
import { MemberCartInquiryOrder } from '../../entities/member-cart-inquiry-order.entity';
import { MemberCartItem } from '../../entities/member-cart-item.entity';
import { Product } from '../../entities/product.entity';
import { ProductParamValueRel } from '../../entities/product-param-value-rel.entity';
import { Status } from '../../common/entities/base.entity';
import { In } from 'typeorm';
import { MemberCartService } from './member-cart.service';
import { ConfigCustomService } from '../config-custom/config-custom.service';

const LAYOUT_CONFIG_KEYS = [
  'logo',
  'website-title',
  'website-description',
  'website-keywords',
  'footer-aboutus',
  'footer-phone',
  'footer-beian',
  'followus',
  'contact-us',
];

function formatYmdHms(d: Date | string | null | undefined): string {
  if (d == null) return '';
  const dt = d instanceof Date ? d : new Date(d);
  if (Number.isNaN(dt.getTime())) return '';
  const p = (n: number) => String(n).padStart(2, '0');
  return `${dt.getFullYear()}-${p(dt.getMonth() + 1)}-${p(dt.getDate())} ${p(dt.getHours())}:${p(dt.getMinutes())}:${p(dt.getSeconds())}`;
}

@Controller()
export class MemberCenterPageController extends BaseWebsiteController {
  constructor(
    langService: LangService,
    websiteLayoutService: WebsiteLayoutService,
    private readonly memberCartService: MemberCartService,
    private readonly configCustomService: ConfigCustomService,
    @InjectRepository(MemberCart)
    private readonly memberCartRepo: Repository<MemberCart>,
    @InjectRepository(ContactMessage)
    private readonly contactRepo: Repository<ContactMessage>,
    @InjectRepository(MemberCartInquiry)
    private readonly inquiryRepo: Repository<MemberCartInquiry>,
    @InjectRepository(MemberCartInquiryOrder)
    private readonly inquiryOrderRepo: Repository<MemberCartInquiryOrder>,
    @InjectRepository(MemberCartItem)
    private readonly cartItemRepo: Repository<MemberCartItem>,
    @InjectRepository(Product)
    private readonly productRepo: Repository<Product>,
    @InjectRepository(ProductParamValueRel)
    private readonly paramRelRepo: Repository<ProductParamValueRel>,
  ) {
    super(langService, websiteLayoutService);
  }

  async getLayoutData(
    langId: number,
    options?: { configKeys?: string[]; includeProducts?: boolean },
  ): Promise<LayoutCachePayload> {
    return this.websiteLayoutService.getLayoutData(langId, options);
  }

  getWebsiteTitle(
    _layoutData: LayoutCachePayload,
    isDomestic: boolean,
  ): string {
    return isDomestic ? '用户中心' : 'Account';
  }

  getWebsiteDescription(
    _layoutData: LayoutCachePayload,
    _isDomestic: boolean,
  ): string | null {
    return null;
  }

  getWebsiteKeywords(
    _layoutData: LayoutCachePayload,
    _isDomestic: boolean,
  ): string | null {
    return null;
  }

  private async getMemberCenterPayload(
    pathLocale: string,
    req: FastifyRequest,
  ) {
    const session = req.session;
    const memberId = session?.memberId;
    if (typeof memberId !== 'number' || memberId <= 0) {
      return { unauthorized: true as const };
    }

    const lang = await this.langService.findByCodeForRoute(pathLocale || 'en');
    if (!lang) throw new NotFoundException();

    const langId = lang.id;
    const locale =
      lang.code === 'cn' ? 'zh-CN' : lang.code === 'en' ? 'en' : lang.code;
    const isDomestic = lang.code === 'cn';
    const basePath = lang.code === 'en' ? '' : `/${lang.code}`;
    const codes = await this.langService
      .findAll()
      .then((l) => l.map((x) => x.code));
    const effectivePathLocale =
      pathLocale || (lang.code === 'en' ? '' : lang.code);

    const layoutData = await this.getLayoutData(langId || 0, {
      configKeys: LAYOUT_CONFIG_KEYS,
    });
    const logoUrl = this.getLogoUrlFromConfig(
      layoutData.configByKey['logo'] ?? null,
    );
    const navItems = this.buildNavItemsFromLayout(
      layoutData,
      basePath,
      isDomestic,
    );
    const categoryTree = this.buildProductNavTreeFromLayout(
      layoutData,
      basePath,
    );
    const commonData = await this.buildCommonPageData(
      langId || 0,
      basePath,
      layoutData,
    );

    const memberEmail = (session.memberEmail || '').trim() || '';

    const lineItems = await this.memberCartService.getItems(memberId);
    let cartList: {
      id: number;
      productIds: string | null;
      email: string | null;
      phone: null;
      country: null;
      createdAtLabel: string;
    }[] = [];
    if (lineItems.length > 0) {
      const cartRow = await this.memberCartRepo.findOne({
        where: { userId: memberId, status: Status.Normal },
      });
      if (cartRow) {
        const sorted = [...lineItems].sort((a, b) => a.itemId - b.itemId);
        const productIds =
          sorted
            .map((i) =>
              i.qty > 1 ? `${i.productId}×${i.qty}` : String(i.productId),
            )
            .join(',') || null;
        cartList = [
          {
            id: cartRow.id,
            productIds,
            email: memberEmail || null,
            phone: null,
            country: null,
            createdAtLabel: formatYmdHms(cartRow.updatedAt),
          },
        ];
      }
    }

    const msgRows = await this.contactRepo.find({
      where: { userId: memberId },
      order: { id: 'DESC' },
      take: 200,
    });
    const messageList = msgRows.map((m) => ({
      id: m.id,
      message: m.message,
      adminReply: m.adminReply,
      repliedAtLabel: m.repliedAt ? formatYmdHms(m.repliedAt) : '',
      createdAtLabel: formatYmdHms(m.createdAt),
    }));

    return {
      unauthorized: false as const,
      locale,
      langId,
      isDomestic,
      basePath,
      localeCodes: codes,
      pathLocale: effectivePathLocale,
      title: this.getWebsiteTitle(layoutData, isDomestic),
      description: this.getWebsiteDescription(layoutData, isDomestic),
      keywords: this.getWebsiteKeywords(layoutData, isDomestic),
      logoUrl,
      navItems,
      categoryTree,
      viewName: 'website/member-center',
      pageViewPageType: 'member-center',
      memberEmail,
      cartList,
      messageList,
      ...commonData,
    };
  }

  @Get('member')
  async memberRoot(@Req() req: FastifyRequest, @Res() reply: FastifyReply) {
    // 自动重定向到我的订单页面
    return reply.redirect('/member/orders', 302);
  }

  @Get(':locale/member')
  async memberLocale(
    @Param('locale') localeParam: string,
    @Req() req: FastifyRequest,
    @Res() reply: FastifyReply,
  ) {
    const pathLocale = (localeParam || '').toLowerCase();
    const lang = await this.langService.findByCodeForRoute(pathLocale || 'en');
    const basePath =
      lang?.code === 'en' ? '' : lang ? `/${lang.code}` : `/${pathLocale}`;
    // 自动重定向到我的订单页面
    return reply.redirect(`${basePath}/member/orders`, 302);
  }

  // 我的订单页面
  @Get('member/orders')
  async memberOrdersRoot(
    @Req() req: FastifyRequest,
    @Res() reply: FastifyReply,
  ) {
    const payload = await this.getMemberOrdersPayload('', req);
    if (payload.unauthorized) {
      return reply.redirect('/', 302);
    }
    (req as any)[LOCALE_KEY] = payload.locale;
    return (reply as any).view(payload.viewName, payload);
  }

  @Get(':locale/member/orders')
  async memberOrdersLocale(
    @Param('locale') localeParam: string,
    @Req() req: FastifyRequest,
    @Res() reply: FastifyReply,
  ) {
    const pathLocale = (localeParam || '').toLowerCase();
    const payload = await this.getMemberOrdersPayload(pathLocale, req);
    if (payload.unauthorized) {
      const lang = await this.langService.findByCodeForRoute(
        pathLocale || 'en',
      );
      const basePath =
        lang?.code === 'en' ? '' : lang ? `/${lang.code}` : `/${pathLocale}`;
      return reply.redirect(basePath || '/', 302);
    }
    (req as any)[LOCALE_KEY] = payload.locale;
    return (reply as any).view(payload.viewName, payload);
  }

  private async getMemberOrdersPayload(
    pathLocale: string,
    req: FastifyRequest,
  ) {
    const session = req.session;
    const memberId = session?.memberId;
    if (typeof memberId !== 'number' || memberId <= 0) {
      return { unauthorized: true as const };
    }

    // 获取分页参数
    const query = req.query as Record<string, unknown> || {};
    const page = Math.max(1, Number(query.page) || 1);
    const pageSize = 10;

    const lang = await this.langService.findByCodeForRoute(pathLocale || 'en');
    if (!lang) throw new NotFoundException();

    const langId = lang.id;
    const locale =
      lang.code === 'cn' ? 'zh-CN' : lang.code === 'en' ? 'en' : lang.code;
    const isDomestic = lang.code === 'cn';
    const basePath = lang.code === 'en' ? '' : `/${lang.code}`;
    const codes = await this.langService
      .findAll()
      .then((l) => l.map((x) => x.code));
    const effectivePathLocale =
      pathLocale || (lang.code === 'en' ? '' : lang.code);

    const layoutData = await this.getLayoutData(langId || 0, {
      configKeys: LAYOUT_CONFIG_KEYS,
    });
    const logoUrl = this.getLogoUrlFromConfig(
      layoutData.configByKey['logo'] ?? null,
    );
    const navItems = this.buildNavItemsFromLayout(
      layoutData,
      basePath,
      isDomestic,
    );
    const categoryTree = this.buildProductNavTreeFromLayout(
      layoutData,
      basePath,
    );
    const commonData = await this.buildCommonPageData(
      langId || 0,
      basePath,
      layoutData,
    );

    const memberEmail = (session.memberEmail || '').trim() || '';

    // 获取用户中心配置文字
    const memberConfig = await this.configCustomService.getByKey(
      langId,
      'member',
    );
    const texts: Record<string, string> = {};
    if (
      memberConfig &&
      memberConfig.isArray &&
      Array.isArray(memberConfig.content)
    ) {
      memberConfig.content.forEach((item: any, index: number) => {
        if (item.content) {
          texts[`text_${index + 1}`] = item.content;
        }
      });
    }

    // 获取用户的询价订单列表
    const inquiries = await this.inquiryRepo.find({
      where: { userId: memberId, status: In([Status.Normal, Status.Hidden]) },
      order: { id: 'DESC' },
    });

    // 获取订单UUID列表
    const orderUuids = inquiries
      .filter((i) => i.inquiryOrderUuid)
      .map((i) => i.inquiryOrderUuid as string);

    // 获取订单信息
    const orders =
      orderUuids.length > 0
        ? await this.inquiryOrderRepo.findBy({ orderUuid: In(orderUuids) })
        : [];
    const orderMap = new Map(orders.map((o) => [o.orderUuid, o]));

    // 获取购物车项目
    const cartItems =
      orderUuids.length > 0
        ? await this.cartItemRepo.findBy({ inquiryOrderUuid: In(orderUuids) })
        : [];

    // 获取产品信息（兼容：MemberCartItem.productId 可能是 product.id 或 product.productId）
    const productIds = [...new Set(cartItems.map((item) => item.productId))];
    // 先用 id 查询
    let products =
      productIds.length > 0
        ? await this.productRepo.findBy({ id: In(productIds) })
        : [];
    // 如果还有未找到的产品，再用 productId 查询
    const foundIds = new Set(products.map((p) => p.id));
    const notFoundIds = productIds.filter((id) => !foundIds.has(id));
    if (notFoundIds.length > 0) {
      const productsByBizId = await this.productRepo.findBy({
        productId: In(notFoundIds),
      });
      products = [...products, ...productsByBizId];
    }
    // 建立两个映射表：一个用 id 做 key，一个用 productId 做 key
    const productMapById = new Map(products.map((p) => [p.id, p]));
    const productMapByBizId = new Map(products.map((p) => [p.productId, p]));

    // 获取产品参数属性
    const productRowIds = products.map((p) => p.id);
    const attrsByProductRowId = new Map<
      number,
      { categoryTitle: string; valueTitle: string }[]
    >();
    if (productRowIds.length > 0) {
      const paramRels = await this.paramRelRepo.find({
        where: { productRowId: In(productRowIds) },
        relations: { paramValue: { category: true } },
        order: { sort: 'ASC', id: 'ASC' },
      });
      for (const rel of paramRels) {
        const pv = rel.paramValue;
        if (!pv) continue;
        const cat = pv.category;
        if (!cat) continue;
        const list = attrsByProductRowId.get(rel.productRowId) ?? [];
        list.push({
          categoryTitle: cat.title,
          valueTitle: pv.value,
        });
        attrsByProductRowId.set(rel.productRowId, list);
      }
    }

    // 按订单UUID分组购物车项目
    const cartItemsByOrder = new Map<string, typeof cartItems>();
    for (const item of cartItems) {
      if (item.inquiryOrderUuid) {
        if (!cartItemsByOrder.has(item.inquiryOrderUuid)) {
          cartItemsByOrder.set(item.inquiryOrderUuid, []);
        }
        cartItemsByOrder.get(item.inquiryOrderUuid)!.push(item);
      }
    }

    // 构建订单列表
    const orderList = inquiries.map((inquiry) => {
      const orderUuid = inquiry.inquiryOrderUuid;
      const order = orderUuid ? orderMap.get(orderUuid) : null;
      const items = orderUuid ? cartItemsByOrder.get(orderUuid) || [] : [];

      const orderItems = items.map((cartItem) => {
        // 兼容：先尝试用 id 查找，再用 productId 查找
        let product = productMapById.get(cartItem.productId);
        if (!product) {
          product = productMapByBizId.get(cartItem.productId);
        }
        const attributes = product
          ? (attrsByProductRowId.get(product.id) ?? [])
          : [];
        return {
          id: cartItem.id,
          productId: cartItem.productId,
          productName:
            product?.name ||
            product?.detailTitle ||
            `Product #${cartItem.productId}`,
          productModel: product?.model || null,
          thumbUrl: product?.thumbUrl || null,
          quantity: cartItem.qty,
          attributes: attributes.slice(0, 2), // 只取前2个属性
        };
      });

      return {
        id: inquiry.id,
        orderUuid: inquiry.inquiryOrderUuid,
        orderNumber:
          inquiry.inquiryOrderUuid || String(order?.id || inquiry.id),
        fullName: inquiry.fullName,
        email: inquiry.email,
        phoneNumber: inquiry.phoneNumber,
        locationCity: inquiry.locationCity,
        message: inquiry.message,
        createdAt: inquiry.createdAt,
        createdAtLabel: formatYmdHms(inquiry.createdAt),
        items: orderItems,
        itemCount: orderItems.length,
      };
    });

    // 过滤掉没有产品关联的订单（orderUuid 为空或纯数字）
    const filteredOrderList = orderList.filter((order) => {
      const uuid = order.orderUuid;
      if (!uuid) return false;
      // 检查是否是纯数字（不是有效的 UUID 格式）
      return !/^\d+$/.test(uuid);
    });

    // 分页处理
    const totalItems = filteredOrderList.length;
    const totalPages = Math.ceil(totalItems / pageSize);
    const currentPage = Math.min(page, totalPages);
    const paginatedOrderList = filteredOrderList.slice(
      (currentPage - 1) * pageSize,
      currentPage * pageSize,
    );

    // 构建分页信息
    const baseUrl = `${basePath}/member/orders`;
    const hasPrevPage = currentPage > 1;
    const hasNextPage = currentPage < totalPages;
    const pagination = {
      firstUrl: currentPage > 1 ? `${baseUrl}?page=1` : '',
      prevUrl: hasPrevPage ? `${baseUrl}?page=${currentPage - 1}` : '',
      nextUrl: hasNextPage ? `${baseUrl}?page=${currentPage + 1}` : '',
      lastUrl: currentPage < totalPages ? `${baseUrl}?page=${totalPages}` : '',
      slots: Array.from({ length: totalPages }, (_, i) => ({
        num: i + 1,
        url: `${baseUrl}?page=${i + 1}`,
        isCurrent: i + 1 === currentPage,
        type: 'number',
      })),
    };

    return {
      unauthorized: false as const,
      locale,
      langId,
      isDomestic,
      basePath,
      localeCodes: codes,
      pathLocale: effectivePathLocale,
      title: texts['text_1'] || (isDomestic ? '我的订单' : 'My Orders'),
      description: this.getWebsiteDescription(layoutData, isDomestic),
      keywords: this.getWebsiteKeywords(layoutData, isDomestic),
      logoUrl,
      navItems,
      categoryTree,
      viewName: 'website/member-orders',
      pageViewPageType: 'member-orders',
      memberId,
      memberEmail,
      orderList: paginatedOrderList,
      pagination,
      texts,
      ...commonData,
    };
  }

  // 账户安全页面
  @Get('member/security')
  async memberSecurityRoot(
    @Req() req: FastifyRequest,
    @Res() reply: FastifyReply,
  ) {
    const payload = await this.getMemberSecurityPayload('', req);
    if (payload.unauthorized) {
      return reply.redirect('/', 302);
    }
    (req as any)[LOCALE_KEY] = payload.locale;
    return (reply as any).view(payload.viewName, payload);
  }

  @Get(':locale/member/security')
  async memberSecurityLocale(
    @Param('locale') localeParam: string,
    @Req() req: FastifyRequest,
    @Res() reply: FastifyReply,
  ) {
    const pathLocale = (localeParam || '').toLowerCase();
    const payload = await this.getMemberSecurityPayload(pathLocale, req);
    if (payload.unauthorized) {
      const lang = await this.langService.findByCodeForRoute(
        pathLocale || 'en',
      );
      const basePath =
        lang?.code === 'en' ? '' : lang ? `/${lang.code}` : `/${pathLocale}`;
      return reply.redirect(basePath || '/', 302);
    }
    (req as any)[LOCALE_KEY] = payload.locale;
    return (reply as any).view(payload.viewName, payload);
  }

  private async getMemberSecurityPayload(
    pathLocale: string,
    req: FastifyRequest,
  ) {
    const session = req.session;
    const memberId = session?.memberId;
    if (typeof memberId !== 'number' || memberId <= 0) {
      return { unauthorized: true as const };
    }

    const lang = await this.langService.findByCodeForRoute(pathLocale || 'en');
    if (!lang) throw new NotFoundException();

    const langId = lang.id;
    const locale =
      lang.code === 'cn' ? 'zh-CN' : lang.code === 'en' ? 'en' : lang.code;
    const isDomestic = lang.code === 'cn';
    const basePath = lang.code === 'en' ? '' : `/${lang.code}`;
    const codes = await this.langService
      .findAll()
      .then((l) => l.map((x) => x.code));
    const effectivePathLocale =
      pathLocale || (lang.code === 'en' ? '' : lang.code);

    const layoutData = await this.getLayoutData(langId || 0, {
      configKeys: LAYOUT_CONFIG_KEYS,
    });
    const logoUrl = this.getLogoUrlFromConfig(
      layoutData.configByKey['logo'] ?? null,
    );
    const navItems = this.buildNavItemsFromLayout(
      layoutData,
      basePath,
      isDomestic,
    );
    const categoryTree = this.buildProductNavTreeFromLayout(
      layoutData,
      basePath,
    );
    const commonData = await this.buildCommonPageData(
      langId || 0,
      basePath,
      layoutData,
    );

    const memberEmail = (session.memberEmail || '').trim() || '';

    // 获取用户中心配置文字
    const memberConfig = await this.configCustomService.getByKey(
      langId,
      'member',
    );
    const texts: Record<string, string> = {};
    if (
      memberConfig &&
      memberConfig.isArray &&
      Array.isArray(memberConfig.content)
    ) {
      memberConfig.content.forEach((item: any, index: number) => {
        if (item.content) {
          texts[`text_${index + 1}`] = item.content;
        }
      });
    }

    return {
      unauthorized: false as const,
      locale,
      langId,
      isDomestic,
      basePath,
      localeCodes: codes,
      pathLocale: effectivePathLocale,
      title: texts['text_2'] || (isDomestic ? '账户安全' : 'Account Security'),
      description: this.getWebsiteDescription(layoutData, isDomestic),
      keywords: this.getWebsiteKeywords(layoutData, isDomestic),
      logoUrl,
      navItems,
      categoryTree,
      viewName: 'website/member-security',
      pageViewPageType: 'member-security',
      memberId,
      memberEmail,
      texts,
      ...commonData,
    };
  }
}
