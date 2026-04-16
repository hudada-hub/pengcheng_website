import type { FastifyRequest } from 'fastify';

export function getClientIp(req: FastifyRequest): string {
  const xf = req.headers['x-forwarded-for'];
  if (typeof xf === 'string' && xf.trim()) {
    return xf.split(',')[0].trim();
  }
  if (Array.isArray(xf) && xf[0]) {
    return String(xf[0]).split(',')[0].trim();
  }
  const raw = (req as { ip?: string }).ip;
  return typeof raw === 'string' && raw.trim() ? raw.trim() : '0.0.0.0';
}
