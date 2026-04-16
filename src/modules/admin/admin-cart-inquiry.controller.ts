import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Query,
  Res,
  Req,
  UseGuards,
  Body,
} from '@nestjs/common';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { AdminAuthGuard } from '../../common/guards/admin-auth.guard';
import { CsrfGuard } from '../../common/guards/csrf.guard';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In, IsNull, Not } from 'typeorm';
import { MemberCartInquiry } from '../../entities/member-cart-inquiry.entity';
import { MemberCartInquiryOrder } from '../../entities/member-cart-inquiry-order.entity';
import { MemberCartItem } from '../../entities/member-cart-item.entity';
import { Product } from '../../entities/product.entity';
import { WebsiteUser } from '../../entities/website-user.entity';
import { ContactMessage } from '../../entities/contact-message.entity';
import { Status } from '../../common/entities/base.entity';

/** 后台列表：YYYY-MM-DD HH:mm:ss（服务器本地时区） */
function formatYmdHms(d: Date | string | null | undefined): string {
  if (d == null) return '-';
  const dt = d instanceof Date ? d : new Date(d);
  if (Number.isNaN(dt.getTime())) return '-';
  const p = (n: number) => String(n).padStart(2, '0');
  return `${dt.getFullYear()}-${p(dt.getMonth() + 1)}-${p(dt.getDate())} ${p(dt.getHours())}:${p(dt.getMinutes())}:${p(dt.getSeconds())}`;
}

@Controller('admin')
export class AdminCartInquiryController {
  constructor(
    @InjectRepository(MemberCartInquiry)
    private readonly inquiryRepo: Repository<MemberCartInquiry>,
    @InjectRepository(MemberCartInquiryOrder)
    private readonly inquiryOrderRepo: Repository<MemberCartInquiryOrder>,
    @InjectRepository(MemberCartItem)
    private readonly cartItemRepo: Repository<MemberCartItem>,
    @InjectRepository(Product)
    private readonly productRepo: Repository<Product>,
    @InjectRepository(WebsiteUser)
    private readonly userRepo: Repository<WebsiteUser>,
    @InjectRepository(ContactMessage)
    private readonly contactRepo: Repository<ContactMessage>,
  ) {}

  @Get('cart-inquiries')
  @UseGuards(AdminAuthGuard)
  async cartInquiriesPage(
    @Res() reply: FastifyReply,
    @Req() req: FastifyRequest,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('orderNumber') orderNumber?: string,
    @Query('contactName') contactName?: string,
    @Query('email') email?: string,
  ) {
    const session = (req as any).session;
    const csrfToken = await (reply as any).generateCsrf?.();
    const pageSizeNum = Math.min(
      50,
      Math.max(5, parseInt(pageSize || '15', 10) || 15),
    );
    const currentPage = Math.max(1, parseInt(page || '1', 10) || 1);

    // 构建查询条件
    const orderNumberTrim = orderNumber?.trim();
    const contactNameTrim = contactName?.trim();
    const emailTrim = email?.trim();

    // 获取询价表单列表（MemberCartInquiry + ContactMessage 有 inquiryOrderUuid 的）
    const inquiryQuery: any = { status: Status.Normal };
    if (orderNumberTrim) {
      inquiryQuery.inquiryOrderUuid = orderNumberTrim;
    }
    if (contactNameTrim) {
      inquiryQuery.fullName = contactNameTrim;
    }
    if (emailTrim) {
      inquiryQuery.email = emailTrim;
    }

    const [inquiryRows, inquiryTotal] = await this.inquiryRepo.findAndCount({
      where: inquiryQuery,
      order: { id: 'DESC' },
    });

    // 获取 ContactMessage 中有 inquiryOrderUuid 的记录（排除已经在 MemberCartInquiry 中的）
    const inquiryUuids = new Set(inquiryRows.map((r) => r.inquiryOrderUuid));
    const contactQuery: any = {
      status: In([Status.Normal, Status.Hidden]),
      inquiryOrderUuid: Not(IsNull()),
    };
    if (orderNumberTrim) {
      contactQuery.inquiryOrderUuid = orderNumberTrim;
    }
    // ContactMessage 没有 fullName 字段，只有 email
    if (emailTrim) {
      contactQuery.email = emailTrim;
    }

    const [contactRows, contactTotal] = await this.contactRepo.findAndCount({
      where: contactQuery,
      order: { id: 'DESC' },
    });

    // 过滤掉已经在 MemberCartInquiry 中的记录
    let filteredContactRows = contactRows.filter(
      (r) => !inquiryUuids.has(r.inquiryOrderUuid),
    );

    // 如果有联系人搜索，需要过滤 ContactMessage 结果（因为该表没有 fullName）
    if (contactNameTrim) {
      filteredContactRows = filteredContactRows.filter((r) => false); // ContactMessage 没有 fullName，不显示
    }

    // 合并两个列表，按时间排序
    const allRows = [
      ...inquiryRows.map((r) => ({ ...r, source: 'inquiry' as const })),
      ...filteredContactRows.map((r) => ({ ...r, source: 'contact' as const })),
    ].sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );

    const total = inquiryTotal + filteredContactRows.length;

    // 分页
    const rows = allRows.slice(
      (currentPage - 1) * pageSizeNum,
      currentPage * pageSizeNum,
    );

    // 获取关联的用户信息
    const userIds = [...new Set(rows.map((r) => r.userId).filter((id) => id))];
    const users = userIds.length
      ? await this.userRepo.find({ where: { id: In(userIds) } })
      : [];
    const userMap = new Map(users.map((u) => [u.id, u]));

    // 获取关联的订单和购物车商品
    const orderUuids = [
      ...new Set(rows.map((r) => r.inquiryOrderUuid).filter((uuid) => uuid)),
    ];
    const orders = orderUuids.length
      ? await this.inquiryOrderRepo.find({
          where: { orderUuid: In(orderUuids) },
        })
      : [];
    const orderMap = new Map(orders.map((o) => [o.orderUuid, o]));

    // 获取购物车商品
    const cartItems = orderUuids.length
      ? await this.cartItemRepo.find({
          where: { inquiryOrderUuid: In(orderUuids), status: Status.Normal },
        })
      : [];

    // 获取产品信息（兼容：MemberCartItem.productId 可能是 product.id 或 product.productId）
    const productIds = [
      ...new Set(cartItems.map((item) => item.productId).filter((id) => id)),
    ];
    // 先用 id 查询
    let products = productIds.length
      ? await this.productRepo.find({ where: { id: In(productIds) } })
      : [];
    // 如果还有未找到的产品，再用 productId 查询
    const foundIds = new Set(products.map((p) => p.id));
    const notFoundIds = productIds.filter((id) => !foundIds.has(id));
    if (notFoundIds.length > 0) {
      const productsByBizId = await this.productRepo.find({
        where: { productId: In(notFoundIds) },
      });
      products = [...products, ...productsByBizId];
    }
    // 建立两个映射表：一个用 id 做 key，一个用 productId 做 key
    const productMapById = new Map(products.map((p) => [p.id, p]));
    const productMapByBizId = new Map(products.map((p) => [p.productId, p]));

    // 组织购物车商品数据
    const cartItemsByOrder = new Map<string, typeof cartItems>();
    for (const item of cartItems) {
      if (!item.inquiryOrderUuid) continue;
      if (!cartItemsByOrder.has(item.inquiryOrderUuid)) {
        cartItemsByOrder.set(item.inquiryOrderUuid, []);
      }
      cartItemsByOrder.get(item.inquiryOrderUuid)!.push(item);
    }

    const list = rows.map((r) => {
      const user = r.userId ? userMap.get(r.userId) : undefined;
      const order = r.inquiryOrderUuid
        ? orderMap.get(r.inquiryOrderUuid)
        : undefined;
      const items = r.inquiryOrderUuid
        ? cartItemsByOrder.get(r.inquiryOrderUuid) || []
        : [];
      const orderItems = items.map((item) => {
        // 兼容：先尝试用 id 查找，再用 productId 查找
        let product = productMapById.get(item.productId);
        if (!product) {
          product = productMapByBizId.get(item.productId);
        }
        return {
          id: item.id,
          productId: item.productId,
          productName:
            product?.name || product?.detailTitle || `产品 #${item.productId}`,
          quantity: item.qty,
          thumbUrl: product?.thumbUrl || '',
        };
      });

      return {
        id: r.id,
        userId: r.userId,
        userEmail: user?.email || '-',
        userName: user?.email || '-',
        inquiryOrderUuid: r.inquiryOrderUuid,
        fullName: r.fullName,
        email: r.email,
        nation: r.nation,
        locationCity: r.locationCity,
        phoneNumber: r.phoneNumber,
        message: r.message,
        sourceUrl: r.sourceUrl || '',
        orderItems,
        hasOrderData: items.length > 0,
        createdAtFormatted: formatYmdHms(r.createdAt),
        source: r.source, // 'inquiry' 或 'contact'
      };
    });

    const totalPages = Math.max(1, Math.ceil(total / pageSizeNum));
    const qs = new URLSearchParams();
    qs.set('pageSize', String(pageSizeNum));
    if (orderNumberTrim) qs.set('orderNumber', orderNumberTrim);
    if (contactNameTrim) qs.set('contactName', contactNameTrim);
    if (emailTrim) qs.set('email', emailTrim);
    const baseUrl = '/admin/cart-inquiries?' + qs.toString();

    return (reply as any).view('admin/cart-inquiries-list', {
      title: '询价表单',
      activeMenu: 'cart-inquiries',
      username: session?.adminUsername || 'admin',
      csrfToken: csrfToken ?? '',
      list,
      pagination: {
        currentPage,
        totalPages,
        total,
        pageSize: pageSizeNum,
        baseUrl,
      },
      search: {
        orderNumber: orderNumberTrim || '',
        contactName: contactNameTrim || '',
        email: emailTrim || '',
      },
    });
  }

  @Delete('cart-inquiries/:id')
  @UseGuards(AdminAuthGuard, CsrfGuard)
  async deleteCartInquiry(@Param('id') id: string, @Res() reply: FastifyReply) {
    const inquiryId = parseInt(id, 10);
    if (!Number.isFinite(inquiryId) || inquiryId < 1) {
      return reply
        .code(400)
        .type('application/json')
        .send({ ok: false, message: '无效的ID' });
    }

    const result = await this.inquiryRepo.delete(inquiryId);
    if (result.affected === 0) {
      return reply
        .code(404)
        .type('application/json')
        .send({ ok: false, message: '记录不存在' });
    }

    return reply
      .type('application/json')
      .send({ ok: true, message: '删除成功' });
  }
}
