import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { FastifyRequest } from 'fastify';

declare module 'fastify' {
  interface Session {
    adminUserId?: number;
    adminUsername?: string;
  }
}

@Injectable()
export class AdminAuthGuard implements CanActivate {
  canActivate(ctx: ExecutionContext): boolean {
    const request = ctx.switchToHttp().getRequest<FastifyRequest>();
    const session = (request as any).session;
    if (!session?.adminUserId) {
      throw new UnauthorizedException('请先登录');
    }
    return true;
  }
}
