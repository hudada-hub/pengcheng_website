import {
  Controller,
  Post,
  Body,
  Headers,
  UnauthorizedException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { ContactMessage } from '../../entities/contact-message.entity';
import { OverseasRecruit } from '../../entities/overseas-recruit.entity';
import { MemberCartInquiry } from '../../entities/member-cart-inquiry.entity';
import { MemberCartInquiryOrder } from '../../entities/member-cart-inquiry-order.entity';
import { MemberCartItem } from '../../entities/member-cart-item.entity';
import { Product } from '../../entities/product.entity';
import { ProductParamValueRel } from '../../entities/product-param-value-rel.entity';
import { CrmApiToken } from '../../entities/crm-api-token.entity';
import { Status } from '../../common/entities/base.entity';

// 数据类型枚举
export enum CrmDataType {
  CONTACT = 1, // 联系我们
  RECRUIT = 2, // 海外招募
  INQUIRY = 3, // 询价表单
}

// 请求 DTO
export interface CrmApiRequestDto {
  type: CrmDataType;
  page?: number;
  pageSize?: number;
  startDate?: string; // YYYY-MM-DD
  endDate?: string; // YYYY-MM-DD
}

@Controller('api/crm')
export class CrmApiController {
  constructor(
    @InjectRepository(CrmApiToken)
    private readonly tokenRepo: Repository<CrmApiToken>,
    @InjectRepository(ContactMessage)
    private readonly contactRepo: Repository<ContactMessage>,
    @InjectRepository(OverseasRecruit)
    private readonly recruitRepo: Repository<OverseasRecruit>,
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
  ) {}

  @Post('data')
  async getData(
    @Headers('authorization') auth: string,
    @Body() dto: CrmApiRequestDto,
  ) {
    // 验证 Token
    const token = this.extractBearerToken(auth);
    if (!token) {
      throw new UnauthorizedException(
        'Missing or invalid authorization header',
      );
    }

    const validToken = await this.validateToken(token);
    if (!validToken) {
      throw new UnauthorizedException('Invalid or expired token');
    }

    // 更新最后使用时间
    await this.tokenRepo.update(validToken.id, { lastUsedAt: new Date() });

    // 验证参数
    if (!dto.type || !Object.values(CrmDataType).includes(Number(dto.type))) {
      throw new BadRequestException(
        'Invalid type. Must be 1 (contact), 2 (recruit), or 3 (inquiry)',
      );
    }

    // 分页参数
    const page = Math.max(1, Number(dto.page) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(dto.pageSize) || 20));

    // 根据类型查询数据
    switch (Number(dto.type)) {
      case CrmDataType.CONTACT:
        return this.getContactData(page, pageSize, dto.startDate, dto.endDate);
      case CrmDataType.RECRUIT:
        return this.getRecruitData(page, pageSize, dto.startDate, dto.endDate);
      case CrmDataType.INQUIRY:
        return this.getInquiryData(page, pageSize, dto.startDate, dto.endDate);
      default:
        throw new BadRequestException('Invalid type');
    }
  }

  private extractBearerToken(auth: string): string | null {
    if (!auth) return null;
    const match = auth.match(/^Bearer\s+(.+)$/i);
    return match ? match[1] : null;
  }

  private async validateToken(token: string): Promise<CrmApiToken | null> {
    const record = await this.tokenRepo.findOne({
      where: { token, status: Status.Normal },
    });

    if (!record) return null;

    // 检查是否过期
    if (record.expiresAt && new Date(record.expiresAt) < new Date()) {
      return null;
    }

    return record;
  }

  private async getContactData(
    page: number,
    pageSize: number,
    startDate?: string,
    endDate?: string,
  ) {
    const where: any = { status: In([Status.Normal, Status.Hidden]) };

    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) {
        where.createdAt.gte = new Date(startDate + ' 00:00:00');
      }
      if (endDate) {
        where.createdAt.lte = new Date(endDate + ' 23:59:59');
      }
    }

    const [list, total] = await this.contactRepo.findAndCount({
      where,
      order: { id: 'DESC' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    });

    return {
      type: 'contact',
      typeName: '联系我们',
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      },
      data: list.map((item) => ({
        id: item.id,
        fullName: item.fullName,
        email: item.email,
        nation: item.nation,
        locationCity: item.locationCity,
        phoneNumber: item.phoneNumber,
        message: item.message,
        adminReply: item.adminReply,
        repliedAt: item.repliedAt,
        createdAt: item.createdAt,
        updatedAt: item.updatedAt,
      })),
    };
  }

  private async getRecruitData(
    page: number,
    pageSize: number,
    startDate?: string,
    endDate?: string,
  ) {
    const where: any = { status: In([Status.Normal, Status.Hidden]) };

    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) {
        where.createdAt.gte = new Date(startDate + ' 00:00:00');
      }
      if (endDate) {
        where.createdAt.lte = new Date(endDate + ' 23:59:59');
      }
    }

    const [list, total] = await this.recruitRepo.findAndCount({
      where,
      relations: ['lang'],
      order: { id: 'DESC' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    });

    return {
      type: 'recruit',
      typeName: '海外招募',
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      },
      data: list.map((item) => ({
        id: item.id,
        companyName: item.companyName,
        city: item.city,
        country: item.country,
        email: item.email,
        phone: item.phone,
        message: item.message,
        qualificationFiles: item.qualificationFiles,
        lang: item.lang
          ? { id: item.lang.id, name: item.lang.name, code: item.lang.code }
          : null,
        createdAt: item.createdAt,
        updatedAt: item.updatedAt,
      })),
    };
  }

  private async getInquiryData(
    page: number,
    pageSize: number,
    startDate?: string,
    endDate?: string,
  ) {
    const where: any = { status: In([Status.Normal, Status.Hidden]) };

    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) {
        where.createdAt.gte = new Date(startDate + ' 00:00:00');
      }
      if (endDate) {
        where.createdAt.lte = new Date(endDate + ' 23:59:59');
      }
    }

    const [list, total] = await this.inquiryRepo.findAndCount({
      where,
      order: { id: 'DESC' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    });

    // 获取所有有订单ID的询价记录
    const orderUuids = list
      .filter((item) => item.inquiryOrderUuid)
      .map((item) => item.inquiryOrderUuid as string);

    // 查询订单信息
    const orders =
      orderUuids.length > 0
        ? await this.inquiryOrderRepo.findBy({ orderUuid: In(orderUuids) })
        : [];
    const orderMap = new Map(orders.map((o) => [o.orderUuid, o]));

    // 查询购物车项目
    const cartItems =
      orderUuids.length > 0
        ? await this.cartItemRepo.findBy({ inquiryOrderUuid: In(orderUuids) })
        : [];

    // 获取产品信息 - 使用 productId（业务产品ID）查询
    const productBizIds = [...new Set(cartItems.map((item) => item.productId))];
    const products =
      productBizIds.length > 0
        ? await this.productRepo.findBy({ productId: In(productBizIds) })
        : [];
    // 建立两个映射：按业务productId和按行id
    const productByBizId = new Map(products.map((p) => [p.productId, p]));
    const productByRowId = new Map(products.map((p) => [p.id, p]));

    // 获取产品参数属性
    const productRowIds = products.map((p) => p.id);
    const attrsByProductRowId = new Map<
      number,
      { categoryTitle: string; valueTitle: string; value: string | null }[]
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
          value: pv.value,
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

    return {
      type: 'inquiry',
      typeName: '询价表单',
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      },
      data: await Promise.all(
        list.map(async (item) => {
          const orderInfo: any = {};

          if (item.inquiryOrderUuid) {
            const order = orderMap.get(item.inquiryOrderUuid);
            const items = cartItemsByOrder.get(item.inquiryOrderUuid) || [];

            orderInfo.order = order
              ? {
                  id: order.id,
                  orderUuid: order.orderUuid,
                  userId: order.userId,
                  createdAt: order.createdAt,
                }
              : null;

            orderInfo.orderItems = items.map((cartItem) => {
              const product = productByBizId.get(cartItem.productId);
              const attributes = product
                ? (attrsByProductRowId.get(product.id) ?? [])
                : [];
              return {
                id: cartItem.id,
                productId: cartItem.productId,
                productName: product?.name || null,
                productModel: product?.model || null,
                thumbUrl: product?.thumbUrl || null,
                quantity: cartItem.qty,
                attributes: attributes,
              };
            });
          }

          return {
            id: item.id,
            inquiryOrderUuid: item.inquiryOrderUuid,
            fullName: item.fullName,
            email: item.email,
            nation: item.nation,
            locationCity: item.locationCity,
            phoneNumber: item.phoneNumber,
            message: item.message,
            ...orderInfo,
            createdAt: item.createdAt,
            updatedAt: item.updatedAt,
          };
        }),
      ),
    };
  }
}
