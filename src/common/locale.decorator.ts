import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export const LOCALE_KEY = 'locale'; // 从 path 解析出的语言 code，如 zh, en

export const Locale = createParamDecorator(
  (data: unknown, ctx: ExecutionContext): string => {
    const request = ctx.switchToHttp().getRequest();
    return request[LOCALE_KEY] || 'zh';
  },
);
