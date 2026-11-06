import type { TopicDecision } from './types';

/**
 * 选题缺口数据（运营效果数据快照）
 * ------------------------------------------------------------
 * 以下值是可运行的演示快照，不是已核验运营数据；正式分析应由用户提供CSV。
 * 使用本次上传的 market,topic,impressions,page_count CSV 可在 S2 替换默认快照。
 *
 * 字段含义：
 *   demandPct —— 该主题在目标市场搜索曝光中的占比
 *   supplyPct —— 承接该主题的落地页在页面总量中的占比
 *   缺口比 = demandPct / supplyPct，越大说明「有需求但没承接页」
 */

export type GapRow = {
  market: string;
  topic: string;
  demandPct: number;
  supplyPct: number;
};

export const TOPIC_GAPS: GapRow[] = [
  { market: 'US', topic: 'outdoor solar security lighting', demandPct: 21, supplyPct: 6 },
  { market: 'DE', topic: 'Solar-Sicherheitsbeleuchtung', demandPct: 17, supplyPct: 5 },
  { market: 'ES', topic: 'iluminación solar de seguridad', demandPct: 14, supplyPct: 7 },
  { market: 'EU', topic: 'outdoor solar security lighting', demandPct: 21, supplyPct: 6 },
];

/** 覆盖度数据：产出量 → 有曝光 → 有点击 → 有询盘（页面漏斗） */
export const FUNNEL = {
  producedPages: 1240,
  withImpressions: 386,
  withClicks: 171,
  withInquiries: 42,
};

export function getTopicGap(market: string, category: string): (GapRow & { ratio: number }) {
  void category;
  const row = TOPIC_GAPS.find((g) => g.market === market) ?? TOPIC_GAPS[0];
  const ratio = row.supplyPct > 0 ? row.demandPct / row.supplyPct : 99;
  return { ...row, ratio };
}

export function toDecision(market: string, category: string): TopicDecision {
  const g = getTopicGap(market, category);
  return {
    topic: g.topic,
    priority: g.ratio >= 2.5 ? 'P0' : g.ratio >= 1.5 ? 'P1' : 'P2',
    reason: `该主题曝光占比 ${g.demandPct}%，但承接页仅占页面总量 ${g.supplyPct}%，缺口比 ${g.ratio.toFixed(1)} : 1`,
    evidence: [
      { label: '主题曝光占比', value: `${g.demandPct}%` },
      { label: '承接页占比', value: `${g.supplyPct}%` },
      { label: '缺口比', value: `${g.ratio.toFixed(1)} : 1` },
      { label: '漏斗（产出/曝光/点击/询盘）', value: `${FUNNEL.producedPages}/${FUNNEL.withImpressions}/${FUNNEL.withClicks}/${FUNNEL.withInquiries}` },
    ],
  };
}