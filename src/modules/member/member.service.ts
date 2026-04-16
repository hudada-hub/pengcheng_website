import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { WebsiteUser } from '../../entities/website-user.entity';
import { MemberCartInquiry } from '../../entities/member-cart-inquiry.entity';
import { Status } from '../../common/entities/base.entity';

const SALT_ROUNDS = 10;
const EMAIL_MAX = 255;
const PASS_MIN = 6;

@Injectable()
export class MemberService {
  constructor(
    @InjectRepository(WebsiteUser)
    private readonly userRepo: Repository<WebsiteUser>,
    @InjectRepository(MemberCartInquiry)
    private readonly inquiryRepo: Repository<MemberCartInquiry>,
  ) {}

  normalizeEmail(email: string): string {
    return (email || '').trim().toLowerCase().slice(0, EMAIL_MAX);
  }

  isPlausibleEmail(email: string): boolean {
    const e = this.normalizeEmail(email);
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
  }

  async findById(id: number): Promise<WebsiteUser | null> {
    return this.userRepo.findOne({ where: { id, status: Status.Normal } });
  }

  async findPublicById(
    id: number,
  ): Promise<{ id: number; email: string } | null> {
    const u = await this.findById(id);
    if (!u) return null;
    return { id: u.id, email: u.email };
  }

  async findByEmail(email: string): Promise<WebsiteUser | null> {
    const e = this.normalizeEmail(email);
    if (!e) return null;
    return this.userRepo.findOne({
      where: { email: e, status: Status.Normal },
    });
  }

  validatePasswordPlain(plain: string): string | null {
    const p = (plain || '').trim();
    if (p.length < PASS_MIN) return null;
    if (p.length > 128) return null;
    return p;
  }

  async register(
    email: string,
    password: string,
  ): Promise<{ ok: true; user: WebsiteUser } | { ok: false; message: string }> {
    const e = this.normalizeEmail(email);
    if (!this.isPlausibleEmail(e)) {
      return { ok: false, message: '邮箱格式无效' };
    }
    const p = this.validatePasswordPlain(password);
    if (!p) {
      return { ok: false, message: `密码至少 ${PASS_MIN} 位` };
    }
    const exists = await this.userRepo.findOne({ where: { email: e } });
    if (exists) {
      return { ok: false, message: '该邮箱已注册' };
    }
    const hashed = await bcrypt.hash(p, SALT_ROUNDS);
    const user = await this.userRepo.save(
      this.userRepo.create({
        email: e,
        password: hashed,
        status: Status.Normal,
      }),
    );
    return { ok: true, user };
  }

  async login(
    email: string,
    password: string,
  ): Promise<{ ok: true; user: WebsiteUser } | { ok: false; message: string }> {
    const e = this.normalizeEmail(email);
    if (!e || !password) {
      return { ok: false, message: 'INVALID_CREDENTIALS' };
    }
    const user = await this.userRepo.findOne({
      where: { email: e, status: Status.Normal },
    });
    if (!user) {
      return { ok: false, message: 'INVALID_CREDENTIALS' };
    }
    const match = await bcrypt.compare(password.trim(), user.password);
    if (!match) {
      return { ok: false, message: 'INVALID_CREDENTIALS' };
    }
    return { ok: true, user };
  }

  /**
   * 修改密码
   */
  async changePassword(
    userId: number,
    currentPassword: string,
    newPassword: string,
  ): Promise<{ success: boolean; message: string }> {
    const user = await this.userRepo.findOne({
      where: { id: userId, status: Status.Normal },
    });
    if (!user) {
      return { success: false, message: 'User not found' };
    }

    // 验证当前密码
    const match = await bcrypt.compare(currentPassword.trim(), user.password);
    if (!match) {
      return { success: false, message: 'Old password is wrong' };
    }

    // 验证新密码
    const validatedNewPassword = this.validatePasswordPlain(newPassword);
    if (!validatedNewPassword) {
      return {
        success: false,
        message: `Password must be at least ${PASS_MIN} characters`,
      };
    }

    // 更新密码
    const hashed = await bcrypt.hash(validatedNewPassword, SALT_ROUNDS);
    await this.userRepo.update(userId, { password: hashed });

    return { success: true, message: 'Password changed successfully' };
  }

  /**
   * 删除订单（软删除）
   */
  async deleteOrder(
    userId: number,
    orderId: number,
  ): Promise<{ success: boolean; message: string }> {
    // 查找订单（不限制状态，因为可能已经被删除）
    const inquiry = await this.inquiryRepo.findOne({
      where: { id: orderId, userId },
    });

    if (!inquiry) {
      return { success: false, message: 'Order not found' };
    }

    // 如果已经是删除状态，直接返回成功
    if (inquiry.status === Status.Hidden) {
      return { success: true, message: 'Order already deleted' };
    }

    // 软删除：将状态改为 Hidden
    const result = await this.inquiryRepo.update(
      { id: orderId, userId },
      { status: Status.Hidden },
    );

    if (result.affected === 0) {
      return { success: false, message: 'Failed to delete order' };
    }

    return { success: true, message: 'Order deleted successfully' };
  }
}
