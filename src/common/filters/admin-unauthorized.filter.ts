import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  UnauthorizedException,
} from '@nestjs/common';
import type { FastifyRequest, FastifyReply } from 'fastify';

/**
 * 未登录访问后台时重定向到登录页，而不是返回 401 JSON
 */
@Catch(UnauthorizedException)
export class AdminUnauthorizedFilter implements ExceptionFilter {
  catch(exception: UnauthorizedException, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<FastifyReply>();
    const req = ctx.getRequest<FastifyRequest>();
    const url = req.url?.split('?')[0] ?? '';

    const isAdminPage =
      url.startsWith('/admin') &&
      !url.startsWith('/admin/login') &&
      !url.startsWith('/admin/api');

    const wantsHtml =
      req.method === 'GET' ||
      (req.headers.accept && String(req.headers.accept).includes('text/html'));

    if (isAdminPage && wantsHtml) {
      res.redirect('/admin/login', 302);
      return;
    }

    res.status(401).send({
      statusCode: 401,
      message: exception.message ?? '请先登录',
    });
  }
}
