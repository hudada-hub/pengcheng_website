/** 自然日与 TTL 均按 Asia/Shanghai（无夏令时），与访问统计 spec 一致 */

export function shanghaiYmdCompact(d = new Date()): string {
  const ymd = new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d);
  return ymd.replace(/-/g, '');
}

/** 到「上海次日 00:05」的秒数，用于日计数 key 的 EXPIRE */
export function ttlSecondsUntilShanghaiNext005(now = new Date()): number {
  const dateStr = new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
  let targetMs = Date.parse(`${dateStr}T00:05:00+08:00`);
  if (targetMs <= now.getTime()) {
    targetMs += 86400000;
  }
  return Math.max(1, Math.ceil((targetMs - now.getTime()) / 1000));
}
