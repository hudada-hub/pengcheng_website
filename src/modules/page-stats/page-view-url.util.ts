import { createHash } from 'crypto';

const DB_URL_MAX = 512;

/** 去重用：pathname 小写、去尾 /、query 按名排序、路径段 decode */
export function normalizePageUrlForDedupe(raw: string): string {
  let s = String(raw || '').trim();
  const hashIdx = s.indexOf('#');
  if (hashIdx >= 0) s = s.slice(0, hashIdx);

  let pathname = '';
  let search = '';
  if (s.startsWith('http://') || s.startsWith('https://')) {
    try {
      const u = new URL(s);
      pathname = u.pathname;
      search = u.search || '';
    } catch {
      const q = s.indexOf('?');
      pathname = q >= 0 ? s.slice(0, q) : s;
      search = q >= 0 ? '?' + s.slice(q + 1) : '';
    }
  } else {
    const q = s.indexOf('?');
    pathname = q >= 0 ? s.slice(0, q) : s;
    search = q >= 0 ? '?' + s.slice(q + 1) : '';
  }

  pathname = pathname.toLowerCase();
  if (pathname.length > 1 && pathname.endsWith('/')) {
    pathname = pathname.slice(0, -1);
  }

  pathname = pathname
    .split('/')
    .map((seg) => {
      try {
        return decodeURIComponent(seg);
      } catch {
        return seg;
      }
    })
    .join('/');

  if (search.startsWith('?')) {
    const params = new URLSearchParams(search.slice(1));
    const keys = [...new Set([...params.keys()])].sort();
    const pairs: string[] = [];
    for (const k of keys) {
      const vals = params.getAll(k).sort();
      for (const v of vals) {
        pairs.push(`${encodeURIComponent(k)}=${encodeURIComponent(v)}`);
      }
    }
    search = pairs.length ? '?' + pairs.join('&') : '';
  } else {
    search = '';
  }

  return pathname + search;
}

export function hashNormalizedPageUrl(normalized: string): string {
  return createHash('sha256')
    .update(normalized, 'utf8')
    .digest('hex')
    .slice(0, 32);
}

/** 入库展示用截断，与 spec 一致 */
export function truncatePageUrlForDb(raw: string): string {
  const s = String(raw || '').trim();
  if (s.length <= DB_URL_MAX) return s;
  return s.slice(0, DB_URL_MAX);
}
