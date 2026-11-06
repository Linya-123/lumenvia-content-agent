/**
 * Auditable optional market-demand inputs. CSV is user supplied; all unprovided
 * historical stats in analytics.ts remain DEMO snapshots, not live analytics.
 */
export type MarketRow = {
  market: 'US' | 'DE' | 'ES';
  topic: string;
  impressions: number;
  pageCount: number;
};
export type TopicRank = MarketRow & {
  demandShare: number;
  supplyShare: number;
  gapRatio: number | null;
  priority: 'P0' | 'P1' | 'P2';
};

const ALLOWED_MARKETS = new Set(['US', 'DE', 'ES']);

function splitCsvLine(line: string): string[] {
  const cells: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      if (quoted && line[i + 1] === '"') { cell += '"'; i++; }
      else quoted = !quoted;
    } else if (c === ',' && !quoted) { cells.push(cell.trim()); cell = ''; }
    else { cell += c; }
  }
  if (quoted) throw new Error('CSV 存在未闭合的引号');
  cells.push(cell.trim());
  return cells;
}

export function parseMarketCsv(raw: unknown): MarketRow[] {
  if (typeof raw !== 'string' || raw.length > 100000) throw new Error('市场CSV为空或过大');
  const lines = raw.replace(/^\uFEFF/, '').split(/\r?\n/).map(s => s.trim()).filter(Boolean);
  if (lines.length < 3 || lines.length > 501) throw new Error('CSV至少需要2行数据，最多500行');
  const header = splitCsvLine(lines[0]).map(s => s.toLowerCase());
  const expected = ['market', 'topic', 'impressions', 'page_count'];
  if (header.length !== expected.length || header.some((x,i) => x !== expected[i])) {
    throw new Error('CSV表头应为 market,topic,impressions,page_count');
  }
  const seen = new Set<string>();
  return lines.slice(1).map((line, i) => {
    const cells = splitCsvLine(line);
    if (cells.length !== 4) throw new Error(`CSV 第 ${i+2} 行字段数量错误`);
    const [market, topic, impressionsStr, pagesStr] = cells;
    const impressions = Number(impressionsStr), pageCount = Number(pagesStr);
    if (!ALLOWED_MARKETS.has(market)) throw new Error(`CSV 第 ${i+2} 行市场不支持`);
    if (!topic || topic.length > 160) throw new Error(`CSV 第 ${i+2} 行主题为空或过长`);
    if (!/^\d+$/.test(impressionsStr) || !/^\d+$/.test(pagesStr) || !Number.isSafeInteger(impressions) || !Number.isSafeInteger(pageCount)) {
      throw new Error(`CSV 第 ${i+2} 行曝光量与页面数必须是非负整数`);
    }
    const key = `${market}\0${topic.toLocaleLowerCase()}`;
    if (seen.has(key)) throw new Error('CSV 中市场与主题组合重复: '+topic);
    seen.add(key);
    return { market: market as MarketRow['market'], topic, impressions, pageCount };
  });
}

export function rankMarketTopics(rows: MarketRow[], market: 'US'|'DE'|'ES'|'EU'): TopicRank[] {
  if (market === 'EU') throw new Error('跨市场曝光和页面数不可直接混算；请分别选择 US、DE 或 ES 做选题分析');
  const subset = rows.filter(r => r.market === market);
  if (subset.length < 2) throw new Error('所选市场至少需要2个可比较的主题数据行');
  const totalImpressions = subset.reduce((a,r) => a + r.impressions, 0);
  const totalPages = subset.reduce((a,r) => a + r.pageCount, 0);
  if (totalImpressions <= 0 || totalPages <= 0) throw new Error('市场曝光量和页面总量必须均大于0');
  return subset.map((r) => {
    const demandShare = 100 * r.impressions / totalImpressions;
    const supplyShare = 100 * r.pageCount / totalPages;
    const gapRatio = supplyShare > 0 ? demandShare / supplyShare : null;
    const priority: 'P0'|'P1'|'P2' = r.impressions > 0 && (gapRatio === null || gapRatio >= 2.5) ? 'P0'
      : gapRatio !== null && gapRatio >= 1.5 ? 'P1' : 'P2';
    return { ...r, demandShare, supplyShare, gapRatio, priority };
  }).sort((a,b) => {
    // no supply but nonzero demand takes precedence; then numerical gaps
    const ar = a.gapRatio ?? (a.impressions > 0 ? Number.POSITIVE_INFINITY : 0);
    const br = b.gapRatio ?? (b.impressions > 0 ? Number.POSITIVE_INFINITY : 0);
    return br-ar || b.impressions-a.impressions;
  });
}

export function marketTopicDecision(rows: MarketRow[], market: 'US'|'DE'|'ES'|'EU') {
  const ranked = rankMarketTopics(rows, market);
  const best = ranked[0];
  const fmt = (v: number) => v.toFixed(1);
  return {
    topic: best.topic,
    priority: best.priority,
    reason: `基于本次上传的 ${rows.length} 条CSV记录：主题曝光占比 ${fmt(best.demandShare)}%，页面供给占比 ${fmt(best.supplyShare)}%。统计窗口和采集口径需由上传者确认。`,
    evidence: [
      { label:'数据来源', value:'用户本次上传CSV（未经第三方核验）' },
      { label:'主题曝光占比', value:`${fmt(best.demandShare)}%` },
      { label:'承接页占比', value:`${fmt(best.supplyShare)}%` },
      { label:'缺口比', value: best.gapRatio === null ? '无覆盖页面' : `${fmt(best.gapRatio)} : 1` },
    ],
  };
}
