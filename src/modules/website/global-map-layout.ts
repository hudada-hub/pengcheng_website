import type { Config } from '../../entities/config.entity';
import { Status } from '../../common/entities/base.entity';

function trimStr(v: unknown): string {
  return typeof v === 'string' ? v.trim() : '';
}

function isActiveConfig(c: Config | null | undefined): c is Config {
  return !!c && c.status === Status.Normal;
}

export function slugifyGlobalMapSectionId(label: string): string {
  const base = label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return base || 'global-map';
}

export interface GlobalMapViewModel {
  sectionId: string;
  title: string;
  subtitle: string;
  legendHq: string;
  legendOffice: string;
  supplement: string;
  /** 已 JSON.stringify，供模板 `{{{ globalMapPointsJson }}}` 嵌入 script */
  pointsJson: string;
  hasContent: boolean;
}

/**
 * about-us-map（type 8）+ about-us-map-data（type 10 数组，description 为「经度, 纬度」）
 * 图例：content.title / content.description / content.content
 * 总部：数组首条为总部；或某项 content / subDescription 为 hq
 */
export function parseGlobalMapFromConfigs(
  mapCfg: Config | null,
  dataCfg: Config | null,
): GlobalMapViewModel {
  const fallback: GlobalMapViewModel = {
    sectionId: 'global-sales-service-network',
    title: '',
    subtitle: '',
    legendHq: 'Headquarter',
    legendOffice: 'Office',
    supplement: '',
    pointsJson: '[]',
    hasContent: false,
  };

  if (!isActiveConfig(dataCfg)) return fallback;

  const raw = dataCfg.content;
  const arr = Array.isArray(raw) ? raw : [];

  type RawPoint = {
    name: string;
    lng: number;
    lat: number;
    valueScale: number;
    explicitHq: boolean;
  };

  const tmp: RawPoint[] = [];
  let i = 0;
  for (const row of arr) {
    if (!row || typeof row !== 'object') continue;
    const o = row as Record<string, unknown>;
    const name = trimStr(o.title);
    const coordRaw = trimStr(o.description);
    const parts = coordRaw.split(/[\s,，]+/).filter(Boolean);
    if (parts.length < 2) continue;
    const lng = parseFloat(parts[0]);
    const lat = parseFloat(parts[1]);
    if (!Number.isFinite(lng) || !Number.isFinite(lat) || !name) continue;
    const explicitHq =
      trimStr(o.content).toLowerCase() === 'hq' ||
      trimStr(o.subDescription).toLowerCase() === 'hq';
    const valueScale = Math.max(70, 100 - i * 2);
    tmp.push({ name, lng, lat, valueScale, explicitHq });
    i += 1;
  }

  if (tmp.length === 0) return fallback;

  const explicitIdx = tmp.findIndex((p) => p.explicitHq);
  const hqName = explicitIdx >= 0 ? tmp[explicitIdx].name : tmp[0].name;

  const forClient = tmp.map((p) => ({
    name: p.name,
    lng: p.lng,
    lat: p.lat,
    v: p.valueScale,
    isHq: p.name === hqName,
  }));

  let title = '';
  let subtitle = '';
  let legendHq = fallback.legendHq;
  let legendOffice = fallback.legendOffice;
  let supplement = '';

  if (isActiveConfig(mapCfg)) {
    title = trimStr(mapCfg.title);
    subtitle = trimStr(mapCfg.description);
    const contentObj =
      mapCfg.content &&
      typeof mapCfg.content === 'object' &&
      !Array.isArray(mapCfg.content)
        ? mapCfg.content
        : null;
    if (contentObj) {
      const t = trimStr(contentObj.title);
      const d = trimStr(contentObj.description);
      const c = trimStr(contentObj.content);
      if (t) legendHq = t;
      if (d) legendOffice = d;
      supplement = c;
    }
  }

  const sectionId = slugifyGlobalMapSectionId(
    title || 'global sales service network',
  );

  return {
    sectionId,
    title,
    subtitle,
    legendHq,
    legendOffice,
    supplement,
    pointsJson: JSON.stringify(forClient),
    hasContent: true,
  };
}
