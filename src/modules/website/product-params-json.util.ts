/**
 * 将后台 Univer 保存的 paramsJson（IWorkbookData 快照或二维数组）解析为前台表格数据。
 */

export type ProductParamsTable = {
  head: string[];
  rows: string[][];
};

export type ProductParamsBlock = {
  title: string;
  tables: ProductParamsTable[];
  /** 非 JSON / 旧版纯文案 */
  legacyText?: string;
};

function cellToString(cell: unknown): string {
  if (cell == null || cell === '') return '';
  if (
    typeof cell === 'string' ||
    typeof cell === 'number' ||
    typeof cell === 'boolean'
  ) {
    return String(cell);
  }
  if (typeof cell === 'object') {
    const o = cell as Record<string, unknown>;
    if (o.v != null && typeof o.v !== 'object') return String(o.v);
    if (o.m != null) return String(o.m);
  }
  return '';
}

function getRowObj(
  cellData: Record<string, unknown>,
  r: number,
): Record<string, unknown> | null {
  const row = cellData[String(r)] ?? cellData[r];
  if (row && typeof row === 'object' && !Array.isArray(row))
    return row as Record<string, unknown>;
  return null;
}

function cellDataToGrid(cellData: unknown): string[][] {
  if (!cellData || typeof cellData !== 'object') return [];
  const cd = cellData as Record<string, unknown>;
  const rowIndices = Object.keys(cd)
    .map((k) => Number.parseInt(k, 10))
    .filter((n) => Number.isFinite(n));
  if (rowIndices.length === 0) return [];
  const maxR = Math.max(...rowIndices);
  const rows: string[][] = [];
  let globalMaxC = -1;
  for (let r = 0; r <= maxR; r++) {
    const rowObj = getRowObj(cd, r);
    if (!rowObj) {
      rows.push([]);
      continue;
    }
    const colIndices = Object.keys(rowObj)
      .map((k) => Number.parseInt(k, 10))
      .filter((n) => Number.isFinite(n));
    const maxC = colIndices.length ? Math.max(...colIndices) : -1;
    globalMaxC = Math.max(globalMaxC, maxC);
    const row: string[] = [];
    for (let c = 0; c <= maxC; c++) {
      const cell = rowObj[c] ?? rowObj[String(c)];
      row.push(cellToString(cell));
    }
    rows.push(row);
  }
  const mc = Math.max(globalMaxC, -1);
  for (const row of rows) {
    while (row.length <= mc) row.push('');
  }
  return trimGrid(rows);
}

function trimGrid(grid: string[][]): string[][] {
  const g = grid.map((r) => [...r]);
  while (g.length && g[g.length - 1].every((c) => !String(c).trim())) {
    g.pop();
  }
  if (!g.length) return [];
  const maxCol = Math.max(0, ...g.map((r) => r.length));
  let lastNonEmpty = -1;
  for (let c = 0; c < maxCol; c++) {
    if (g.some((r) => (r[c] || '').trim())) lastNonEmpty = c;
  }
  return g.map((r) => {
    const slice = r.slice(0, lastNonEmpty + 1);
    while (slice.length <= lastNonEmpty) slice.push('');
    return slice;
  });
}

/** 用全空行拆成多块（同一 Sheet 内上下多个表） */
function splitGridIntoTableGrids(grid: string[][]): string[][][] {
  const blocks: string[][][] = [];
  let cur: string[][] = [];
  for (const row of grid) {
    const empty = !row.some((c) => String(c).trim());
    if (empty) {
      if (cur.length) {
        blocks.push(cur);
        cur = [];
      }
    } else {
      cur.push(row);
    }
  }
  if (cur.length) blocks.push(cur);
  return blocks.length ? blocks : [grid];
}

function gridToTable(grid: string[][]): ProductParamsTable | null {
  if (!grid.length) return null;
  const head = grid[0].map((c) => String(c ?? ''));
  const bodyRows = grid.slice(1);
  const width = Math.max(
    head.length,
    bodyRows.reduce((w, r) => Math.max(w, (r || []).length), 0),
    1,
  );
  const headPadded = [...head];
  while (headPadded.length < width) headPadded.push('');
  const rows = bodyRows.map((r) => {
    const cells = (r || []).map((c) => String(c ?? ''));
    const out = [...cells];
    while (out.length < width) out.push('');
    return out.slice(0, width);
  });
  return { head: headPadded.slice(0, width), rows };
}

function parseWorkbook(p: Record<string, unknown>): ProductParamsTable[] {
  const sheets = p.sheets as Record<string, unknown> | undefined;
  const order = (p.sheetOrder as string[] | undefined) ?? [];
  if (!sheets || !order.length) return [];
  const tables: ProductParamsTable[] = [];
  for (const sid of order) {
    const sheet = sheets[sid] as Record<string, unknown> | undefined;
    if (!sheet) continue;
    const grid = cellDataToGrid(sheet.cellData);
    const parts = splitGridIntoTableGrids(grid);
    for (const g of parts) {
      const t = gridToTable(g);
      if (t) tables.push(t);
    }
  }
  return tables;
}

function parseDataString(
  dataStr: string,
): ProductParamsTable[] | { legacyText: string } {
  const raw = dataStr.trim();
  if (!raw) return [];
  try {
    let p: unknown = JSON.parse(raw);
    if (typeof p === 'string') {
      try {
        p = JSON.parse(p);
      } catch {
        return { legacyText: raw };
      }
    }
    if (Array.isArray(p)) {
      if (!p.length) return [];
      if (Array.isArray(p[0])) {
        const grid = (p as unknown[][]).map((row) =>
          (row || []).map((c) => String(c ?? '')),
        );
        const trimmed = trimGrid(grid);
        const parts = splitGridIntoTableGrids(trimmed);
        return parts
          .map((g) => gridToTable(g))
          .filter((t): t is ProductParamsTable => t != null);
      }
      return { legacyText: raw };
    }
    if (p && typeof p === 'object' && 'sheets' in p && 'sheetOrder' in p) {
      return parseWorkbook(p as Record<string, unknown>);
    }
    return { legacyText: raw };
  } catch {
    return { legacyText: raw };
  }
}

export function buildProductParamsRenderBlocks(
  paramsJson: { title: string; data: string }[] | null | undefined,
): ProductParamsBlock[] {
  if (!paramsJson || !paramsJson.length) return [];
  const blocks: ProductParamsBlock[] = [];
  for (const item of paramsJson) {
    const title = String(item.title ?? '').trim();
    const parsed = parseDataString(String(item.data ?? ''));
    if ('legacyText' in parsed) {
      if (parsed.legacyText.trim()) {
        blocks.push({ title, tables: [], legacyText: parsed.legacyText });
      }
      continue;
    }
    if (!parsed.length) continue;
    blocks.push({ title, tables: parsed });
  }
  return blocks;
}
