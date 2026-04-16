import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { createTransport } from 'nodemailer';
import type { Transporter } from 'nodemailer';
import { SystemConfig } from '../../entities/system-config.entity';
import { readFile } from 'fs/promises';
import { join } from 'path';

export interface CartInquiryItemAttribute {
  categoryTitle: string;
  valueTitle: string;
}

export interface CartInquiryItem {
  productId: number;
  productName: string;
  quantity: number;
  thumbUrl?: string;
  attributes?: CartInquiryItemAttribute[];
}

export interface CartInquiryMailData {
  inquiryId: number;
  orderUuid: string;
  fullName: string;
  email: string;
  nation?: string | null;
  locationCity?: string | null;
  phoneNumber?: string | null;
  message?: string | null;
  items: CartInquiryItem[];
  createdAt: Date;
  baseUrl?: string;
}

export interface ContactMailData {
  contactId: number;
  fullName: string;
  email: string;
  nation?: string | null;
  locationCity?: string | null;
  phoneNumber?: string | null;
  message?: string | null;
  createdAt: Date;
  baseUrl?: string;
}

export interface JoinUsMailData {
  recruitId: number;
  companyName: string;
  email: string;
  city?: string | null;
  phone?: string | null;
  message?: string | null;
  qualificationFiles?: { fileName: string; fileUrl: string }[];
  createdAt: Date;
  baseUrl?: string;
  toEmail?: string;
}

interface SmtpConfig {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  pass: string;
}

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);

  constructor(
    @InjectRepository(SystemConfig)
    private readonly systemConfigRepo: Repository<SystemConfig>,
  ) {}

  private async getConfig(name: string): Promise<string | null> {
    const config = await this.systemConfigRepo.findOne({
      where: { name, status: 1 },
    });
    return config?.value || null;
  }

  private async getMailProvider(): Promise<'qq' | 'gmail'> {
    const provider = await this.getConfig('邮件服务商');
    return provider === 'gmail' ? 'gmail' : 'qq'; // 默认使用 QQ 邮箱
  }

  private async getSmtpConfig(): Promise<SmtpConfig | null> {
    const provider = await this.getMailProvider();

    if (provider === 'gmail') {
      const [user, pass] = await Promise.all([
        this.getConfig('邮件发送邮箱'),
        this.getConfig('邮件发送密码'),
      ]);
      if (!user || !pass) return null;
      return {
        host: 'smtp.gmail.com',
        port: 587,
        secure: false,
        user,
        pass,
      };
    } else {
      // QQ 邮箱
      const [user, pass] = await Promise.all([
        this.getConfig('qq发送邮箱'),
        this.getConfig('qq邮箱令牌'),
      ]);
      if (!user || !pass) return null;
      return {
        host: 'smtp.qq.com',
        port: 465,
        secure: true,
        user,
        pass,
      };
    }
  }

  private async getSalesEmail(): Promise<string | null> {
    // 优先使用联系我们-发送邮箱配置，如果不存在则回退到销售邮箱
    const contactEmail = await this.getConfig('联系我们-发送邮箱');
    if (contactEmail) {
      return contactEmail;
    }
    return this.getConfig('销售邮箱');
  }

  async sendCartInquiryEmail(data: CartInquiryMailData): Promise<boolean> {
    const smtpConfig = await this.getSmtpConfig();
    const salesEmail = await this.getSalesEmail();

    if (!smtpConfig) {
      this.logger.warn('邮件配置不完整：缺少发送邮箱或密码');
      return false;
    }

    if (!salesEmail) {
      this.logger.warn('未配置销售邮箱，无法发送询价通知');
      return false;
    }

    // 创建邮件传输器
    const transporter: Transporter = createTransport({
      host: smtpConfig.host,
      port: smtpConfig.port,
      secure: smtpConfig.secure,
      auth: {
        user: smtpConfig.user,
        pass: smtpConfig.pass,
      },
      tls: {
        rejectUnauthorized: false,
      },
      connectionTimeout: 10000,
      greetingTimeout: 10000,
      socketTimeout: 10000,
    });

    const hasOrderItems = data.items.length > 0;
    const baseUrl = data.baseUrl || process.env.SITE_URL || '';

    // 生成产品列表 HTML
    const itemsHtml = data.items
      .map((item, index) => {
        const attributesHtml =
          item.attributes && item.attributes.length > 0
            ? `<div style="margin-top: 8px; font-size: 12px; color: #666;">
              ${item.attributes.map((attr) => `<span style="background: #f0f0f0; padding: 2px 6px; border-radius: 3px; margin-right: 5px;">${attr.categoryTitle}: ${attr.valueTitle}</span>`).join('')}
             </div>`
            : '';

        // 添加域名前缀到图片 URL
        const thumbUrl = item.thumbUrl
          ? item.thumbUrl.startsWith('http')
            ? item.thumbUrl
            : `${baseUrl}${item.thumbUrl.startsWith('/') ? '' : '/'}${item.thumbUrl}`
          : null;

        const imageHtml = thumbUrl
          ? `<img src="${thumbUrl}" alt="${item.productName}" style="width: 60px; height: 60px; object-fit: cover; border-radius: 4px; border: 1px solid #ddd;">`
          : `<div style="width: 60px; height: 60px; background: #f5f5f5; border-radius: 4px; display: flex; align-items: center; justify-content: center; color: #999; font-size: 12px;">无图</div>`;

        return `
      <tr style="border-bottom: 1px solid #eee;">
        <td style="padding: 15px 10px; text-align: center;">${index + 1}</td>
        <td style="padding: 15px 10px; text-align: center;">${imageHtml}</td>
        <td style="padding: 15px 10px;">
          <div style="font-weight: bold; color: #333;">${item.productName}</div>
          <div style="font-size: 12px; color: #999; margin-top: 4px;">ID: ${item.productId}</div>
          ${attributesHtml}
        </td>
      </tr>
    `;
      })
      .join('');

    const subject = `【询价通知】来自 ${data.fullName} 的购物车询价 - 订单号: ${data.orderUuid.slice(0, 8)}`;

    const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 800px; margin: 0 auto; padding: 20px; }
    .header { background: #f5f5f5; padding: 20px; border-radius: 5px; margin-bottom: 20px; }
    .section { margin-bottom: 20px; }
    .section-title { font-size: 18px; font-weight: bold; margin-bottom: 10px; color: #0066cc; }
    .info-row { margin: 5px 0; }
    .info-label { font-weight: bold; display: inline-block; width: 100px; }
    table { width: 100%; border-collapse: collapse; }
    th { background: #f5f5f5; padding: 12px 10px; text-align: left; font-weight: bold; }
    td { padding: 10px; }
    .message-box { background: #f9f9f9; padding: 15px; border-left: 4px solid #0066cc; margin-top: 10px; }
    .highlight { color: #0066cc; font-weight: bold; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h2 style="margin: 0; color: #0066cc;">购物车询价通知</h2>
      <p style="margin: 5px 0 0 0; color: #666;">询价编号: #${data.inquiryId} | 订单号: ${data.orderUuid}</p>
      <p style="margin: 5px 0 0 0; color: #666;">提交时间: ${data.createdAt.toLocaleString('zh-CN')}</p>
      ${hasOrderItems ? `<p style="margin: 5px 0 0 0; color: #0066cc;" class="highlight">包含 ${data.items.length} 件商品</p>` : ''}
    </div>

    <div class="section">
      <div class="section-title">联系人信息</div>
      <div class="info-row"><span class="info-label">姓名:</span> ${data.fullName}</div>
      <div class="info-row"><span class="info-label">邮箱:</span> ${data.email}</div>
      ${data.phoneNumber ? `<div class="info-row"><span class="info-label">电话:</span> ${data.phoneNumber}</div>` : ''}
      ${data.nation ? `<div class="info-row"><span class="info-label">国家:</span> ${data.nation}</div>` : ''}
      ${data.locationCity ? `<div class="info-row"><span class="info-label">城市:</span> ${data.locationCity}</div>` : ''}
    </div>

    ${
      data.message
        ? `
    <div class="section">
      <div class="section-title">留言内容</div>
      <div class="message-box">${data.message.replace(/\n/g, '<br>')}</div>
    </div>
    `
        : ''
    }

    ${
      hasOrderItems
        ? `
    <div class="section">
      <div class="section-title">询价商品列表 (${data.items.length}件)</div>
      <table border="1" style="border-color: #ddd;">
        <thead>
          <tr>
            <th style="width: 50px; text-align: center;">序号</th>
            <th style="width: 80px; text-align: center;">图片</th>
            <th>产品信息</th>
          </tr>
        </thead>
        <tbody>
          ${itemsHtml}
        </tbody>
      </table>
    </div>
    `
        : '<div class="section"><p style="color: #999;">此询价不包含商品信息</p></div>'
    }

    <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee; color: #999; font-size: 12px;">
      <p>此邮件由系统自动发送，请勿直接回复。</p>
      <p>鹏成新能源官网 - 购物车询价系统</p>
    </div>
  </div>
</body>
</html>
    `;

    const text = `
购物车询价通知
==============

询价编号: #${data.inquiryId}
订单号: ${data.orderUuid}
提交时间: ${data.createdAt.toLocaleString('zh-CN')}
${hasOrderItems ? `包含商品: ${data.items.length} 件\n` : ''}

联系人信息
----------
姓名: ${data.fullName}
邮箱: ${data.email}
${data.phoneNumber ? `电话: ${data.phoneNumber}\n` : ''}${data.nation ? `国家: ${data.nation}\n` : ''}${data.locationCity ? `城市: ${data.locationCity}\n` : ''}

${data.message ? `留言内容\n----------\n${data.message}\n\n` : ''}

${
  hasOrderItems
    ? `询价商品列表 (${data.items.length}件)\n----------------\n${data.items
        .map((item, index) => {
          const attrs =
            item.attributes && item.attributes.length > 0
              ? ` [${item.attributes.map((a) => `${a.categoryTitle}: ${a.valueTitle}`).join(', ')}]`
              : '';
          return `${index + 1}. [ID:${item.productId}] ${item.productName}${attrs}`;
        })
        .join('\n')}\n`
    : '此询价不包含商品信息\n'
}

---
此邮件由系统自动发送，请勿直接回复。
鹏成新能源官网 - 购物车询价系统
    `;

    try {
      await transporter.sendMail({
        from: `"鹏成新能源" <${smtpConfig.user}>`,
        to: salesEmail,
        subject,
        text,
        html,
      });
      this.logger.log(
        `询价邮件已发送至销售邮箱: ${salesEmail} (使用 ${await this.getMailProvider()} 邮箱)`,
      );
      return true;
    } catch (error) {
      this.logger.error(`发送询价邮件失败: ${error.message}`, error.stack);
      return false;
    }
  }

  async sendContactEmail(data: ContactMailData): Promise<boolean> {
    const smtpConfig = await this.getSmtpConfig();
    const salesEmail = await this.getSalesEmail();

    if (!smtpConfig) {
      this.logger.warn('邮件配置不完整：缺少发送邮箱或密码');
      return false;
    }

    if (!salesEmail) {
      this.logger.warn('未配置销售邮箱，无法发送联系表单通知');
      return false;
    }

    // 创建邮件传输器
    const transporter: Transporter = createTransport({
      host: smtpConfig.host,
      port: smtpConfig.port,
      secure: smtpConfig.secure,
      auth: {
        user: smtpConfig.user,
        pass: smtpConfig.pass,
      },
      tls: {
        rejectUnauthorized: false,
      },
      connectionTimeout: 10000,
      greetingTimeout: 10000,
      socketTimeout: 10000,
    });

    const subject = `【联系表单】来自 ${data.fullName} 的新消息`;

    const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: #f5f5f5; padding: 20px; border-radius: 5px; margin-bottom: 20px; }
    .section { margin-bottom: 20px; }
    .section-title { font-size: 18px; font-weight: bold; margin-bottom: 10px; color: #0066cc; }
    .info-row { margin: 5px 0; }
    .info-label { font-weight: bold; display: inline-block; width: 100px; }
    .message-box { background: #f9f9f9; padding: 15px; border-left: 4px solid #0066cc; margin-top: 10px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h2 style="margin: 0; color: #0066cc;">联系表单通知</h2>
      <p style="margin: 5px 0 0 0; color: #666;">消息编号: #${data.contactId}</p>
      <p style="margin: 5px 0 0 0; color: #666;">提交时间: ${data.createdAt.toLocaleString('zh-CN')}</p>
    </div>

    <div class="section">
      <div class="section-title">联系人信息</div>
      <div class="info-row"><span class="info-label">姓名:</span> ${data.fullName}</div>
      <div class="info-row"><span class="info-label">邮箱:</span> ${data.email}</div>
      ${data.phoneNumber ? `<div class="info-row"><span class="info-label">电话:</span> ${data.phoneNumber}</div>` : ''}
      ${data.nation ? `<div class="info-row"><span class="info-label">国家:</span> ${data.nation}</div>` : ''}
      ${data.locationCity ? `<div class="info-row"><span class="info-label">城市:</span> ${data.locationCity}</div>` : ''}
    </div>

    ${
      data.message
        ? `
    <div class="section">
      <div class="section-title">留言内容</div>
      <div class="message-box">${data.message.replace(/\n/g, '<br>')}</div>
    </div>
    `
        : ''
    }

    <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee; color: #999; font-size: 12px;">
      <p>此邮件由系统自动发送，请勿直接回复。</p>
      <p>鹏成新能源官网 - 联系表单系统</p>
    </div>
  </div>
</body>
</html>
    `;

    const text = `
联系表单通知
==============

消息编号: #${data.contactId}
提交时间: ${data.createdAt.toLocaleString('zh-CN')}

联系人信息
----------
姓名: ${data.fullName}
邮箱: ${data.email}
${data.phoneNumber ? `电话: ${data.phoneNumber}\n` : ''}${data.nation ? `国家: ${data.nation}\n` : ''}${data.locationCity ? `城市: ${data.locationCity}\n` : ''}

${data.message ? `留言内容\n----------\n${data.message}\n` : ''}

---
此邮件由系统自动发送，请勿直接回复。
鹏成新能源官网 - 联系表单系统
    `;

    try {
      await transporter.sendMail({
        from: `"鹏成新能源" <${smtpConfig.user}>`,
        to: salesEmail,
        subject,
        text,
        html,
      });
      this.logger.log(
        `联系表单邮件已发送至销售邮箱: ${salesEmail} (使用 ${await this.getMailProvider()} 邮箱)`,
      );
      return true;
    } catch (error) {
      this.logger.error(`发送联系表单邮件失败: ${error.message}`, error.stack);
      return false;
    }
  }

  async sendJoinUsEmail(data: JoinUsMailData): Promise<boolean> {
    const smtpConfig = await this.getSmtpConfig();
    // 优先使用传入的 toEmail，否则使用销售邮箱
    const targetEmail = data.toEmail?.trim() || (await this.getSalesEmail());

    if (!smtpConfig) {
      this.logger.warn('邮件配置不完整：缺少发送邮箱或密码');
      return false;
    }

    if (!targetEmail) {
      this.logger.warn('未配置目标邮箱，无法发送加入我们通知');
      return false;
    }

    // 创建邮件传输器
    const transporter: Transporter = createTransport({
      host: smtpConfig.host,
      port: smtpConfig.port,
      secure: smtpConfig.secure,
      auth: {
        user: smtpConfig.user,
        pass: smtpConfig.pass,
      },
      tls: {
        rejectUnauthorized: false,
      },
      connectionTimeout: 10000,
      greetingTimeout: 10000,
      socketTimeout: 10000,
    });

    const subject = `【加入我们】来自 ${data.companyName} 的新申请`;

    const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: linear-gradient(135deg, #0066cc 0%, #0052a3 100%); padding: 25px; border-radius: 5px; margin-bottom: 20px; color: white; }
    .section { margin-bottom: 20px; }
    .section-title { font-size: 18px; font-weight: bold; margin-bottom: 10px; color: #0066cc; }
    .info-row { margin: 8px 0; }
    .info-label { font-weight: bold; display: inline-block; width: 120px; color: #555; }
    .info-value { color: #333; }
    .message-box { background: #f9f9f9; padding: 15px; border-left: 4px solid #0066cc; margin-top: 10px; }
    .highlight { color: #0066cc; font-weight: bold; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h2 style="margin: 0; color: white;">加入我们 - 新申请通知</h2>
      <p style="margin: 10px 0 0 0; color: rgba(255,255,255,0.9);">申请编号: #${data.recruitId}</p>
      <p style="margin: 5px 0 0 0; color: rgba(255,255,255,0.9);">提交时间: ${data.createdAt.toLocaleString('zh-CN')}</p>
    </div>

    <div class="section">
      <div class="section-title">公司信息</div>
      <div class="info-row"><span class="info-label">公司名称:</span> <span class="info-value highlight">${data.companyName}</span></div>
      ${data.city ? `<div class="info-row"><span class="info-label">所在城市:</span> <span class="info-value">${data.city}</span></div>` : ''}
    </div>

    <div class="section">
      <div class="section-title">联系方式</div>
      <div class="info-row"><span class="info-label">邮箱:</span> <span class="info-value">${data.email}</span></div>
      ${data.phone ? `<div class="info-row"><span class="info-label">电话:</span> <span class="info-value">${data.phone}</span></div>` : ''}
    </div>

    ${
      data.message
        ? `
    <div class="section">
      <div class="section-title">留言内容</div>
      <div class="message-box">${data.message.replace(/\n/g, '<br>')}</div>
    </div>
    `
        : ''
    }

    <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee; color: #999; font-size: 12px;">
      <p>此邮件由系统自动发送，请勿直接回复。</p>
      <p>鹏成新能源官网 - 加入我们系统</p>
    </div>
  </div>
</body>
</html>
    `;

    const text = `
加入我们 - 新申请通知
==============

申请编号: #${data.recruitId}
提交时间: ${data.createdAt.toLocaleString('zh-CN')}

公司信息
----------
公司名称: ${data.companyName}
${data.city ? `所在城市: ${data.city}\n` : ''}

联系方式
----------
邮箱: ${data.email}
${data.phone ? `电话: ${data.phone}\n` : ''}

${
  data.message
    ? `留言内容
----------
${data.message}
`
    : ''
}

---
此邮件由系统自动发送，请勿直接回复。
鹏成新能源官网 - 加入我们系统
    `;

    // 生成资质文件列表HTML
    const filesHtml =
      data.qualificationFiles && data.qualificationFiles.length > 0
        ? `
    <div class="section">
      <div class="section-title">资质文件 (${data.qualificationFiles.length}个)</div>
      <div style="background: #f9f9f9; padding: 15px; border-radius: 4px;">
        ${data.qualificationFiles
          .map(
            (file, index) => `
          <div style="margin: 8px 0; padding: 8px; background: white; border-radius: 4px; border-left: 3px solid #0066cc;">
            <span style="color: #666;">${index + 1}.</span>
            <a href="${data.baseUrl}${file.fileUrl}" target="_blank" style="color: #0066cc; text-decoration: none; margin-left: 8px;">${file.fileName}</a>
          </div>
        `,
          )
          .join('')}
      </div>
    </div>
    `
        : '';

    // 生成资质文件列表文本
    const filesText =
      data.qualificationFiles && data.qualificationFiles.length > 0
        ? `
资质文件 (${data.qualificationFiles.length}个)
----------
${data.qualificationFiles.map((file, index) => `${index + 1}. ${file.fileName}: ${data.baseUrl}${file.fileUrl}`).join('\n')}
`
        : '';

    // 更新HTML内容，添加资质文件部分
    const htmlWithFiles = html.replace(
      '</body>',
      `${filesHtml}
  </body>`,
    );

    // 更新文本内容，添加资质文件部分
    const textWithFiles = text + filesText;

    // 准备附件
    const attachments: { filename: string; content: Buffer }[] = [];
    if (data.qualificationFiles && data.qualificationFiles.length > 0) {
      for (const file of data.qualificationFiles) {
        try {
          // 文件路径在 public 目录下
          const filePath = join(
            process.cwd(),
            'public',
            file.fileUrl.replace(/^\//, ''),
          );
          const fileContent = await readFile(filePath);
          attachments.push({
            filename: file.fileName,
            content: fileContent,
          });
        } catch (err) {
          this.logger.warn(
            `无法读取附件文件: ${file.fileUrl}, 错误: ${err.message}`,
          );
        }
      }
    }

    try {
      await transporter.sendMail({
        from: `"鹏成新能源" <${smtpConfig.user}>`,
        to: targetEmail,
        subject,
        text: textWithFiles,
        html: htmlWithFiles,
        attachments: attachments.length > 0 ? attachments : undefined,
      });
      this.logger.log(
        `加入我们邮件已发送至: ${targetEmail} (使用 ${await this.getMailProvider()} 邮箱), 附件: ${attachments.length}个`,
      );
      return true;
    } catch (error) {
      this.logger.error(`发送加入我们邮件失败: ${error.message}`, error.stack);
      return false;
    }
  }
}
