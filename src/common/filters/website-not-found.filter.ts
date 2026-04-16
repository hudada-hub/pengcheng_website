import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { LOCALE_KEY } from '../../modules/website/base-website.controller';
import { WebsiteNotFoundViewService } from '../../modules/website/website-not-found-view.service';

/**
 * 前台无匹配路由时返回多语言 HTML 404（而非 JSON），与 `website/not-found` 一致。
 * 后台 /admin、仅 JSON 的 Accept 保持默认行为。
 */
@Injectable()
@Catch(NotFoundException)
export class WebsiteNotFoundFilter implements ExceptionFilter {
  constructor(
    private readonly websiteNotFoundView: WebsiteNotFoundViewService,
  ) {}

  catch(exception: NotFoundException, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const req = ctx.getRequest<FastifyRequest>();
    const res = ctx.getResponse<FastifyReply>();

    const status = exception.getStatus();
    if (status !== 404) {
      this.sendDefaultJson(res, exception);
      return;
    }

    const url = req.url?.split('?')[0] ?? '';
    if (url.startsWith('/admin')) {
      this.sendDefaultJson(res, exception);
      return;
    }
    if (url.startsWith('/api')) {
      this.sendDefaultJson(res, exception);
      return;
    }

    const method = req.method || 'GET';
    if (method !== 'GET' && method !== 'HEAD') {
      this.sendDefaultJson(res, exception);
      return;
    }

    const accept = (req.headers.accept || '').toLowerCase();
    const wantsJsonOnly =
      accept.includes('application/json') &&
      !accept.includes('text/html') &&
      !accept.includes('*/*');
    if (wantsJsonOnly) {
      this.sendDefaultJson(res, exception);
      return;
    }

    void this.renderWebsiteNotFound(req, res, exception);
  }

  private sendDefaultJson(
    res: FastifyReply,
    exception: NotFoundException,
  ): void {
    const response = exception.getResponse();
    const payload =
      typeof response === 'object' && response !== null
        ? response
        : { statusCode: exception.getStatus(), message: String(response) };
    res.status(404).type('application/json').send(payload);
  }

  private async renderWebsiteNotFound(
    req: FastifyRequest,
    res: FastifyReply,
    exception: NotFoundException,
  ): Promise<void> {
    try {
      const pathname = (req.url || '').split('?')[0] || '/';
      const segments = pathname.split('/').filter(Boolean);
      const first = segments[0] ?? '';
      const payload =
        await this.websiteNotFoundView.buildGenericNotFoundPayload(
          segments.length > 0 ? first : null,
        );
      const contactFormCsrfToken = await (res as any).generateCsrf?.();
      (req as any)[LOCALE_KEY] = payload.locale;
      await (res as any).code(404).view('website/not-found', {
        ...payload,
        contactFormCsrfToken: contactFormCsrfToken ?? '',
      });
    } catch {
      this.sendDefaultJson(res, exception);
    }
  }
}
