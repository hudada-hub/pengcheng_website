import {
  CanActivate,
  ExecutionContext,
  Injectable,
  ForbiddenException,
} from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';
import type { FastifyRequest, FastifyReply } from 'fastify';

/**
 * 对 POST 等请求校验 CSRF token（与 @fastify/csrf-protection 配合）
 * 表单需包含 name="_csrf" 的 hidden 或通过 header 传递
 */
@Injectable()
export class CsrfGuard implements CanActivate {
  constructor(private readonly httpAdapterHost: HttpAdapterHost) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<FastifyRequest>();
    const reply = context.switchToHttp().getResponse<FastifyReply>();
    const fastify = this.httpAdapterHost.httpAdapter.getInstance();
    if (typeof fastify.csrfProtection !== 'function') {
      return true;
    }
    return new Promise<boolean>((resolve, reject) => {
      fastify.csrfProtection(req, reply, (err: Error) => {
        if (err) {
          reject(new ForbiddenException('CSRF 校验失败'));
        } else {
          resolve(true);
        }
      });
    });
  }
}
