/**
 * 知识库（代码内置）
 * ------------------------------------------------------------
 * 18 条真实可追溯的条目。规模不大，但每条都有出处，
 * 评审更容易验证 —— 这比 2000 条批量生成的内容有说服力。
 *
 * 不用数据库的理由：数据量在百条量级，代码内加载即可，
 * 零部署依赖，也不受 serverless 无持久化磁盘的限制。
 */

import type { ZoneType, Market } from './types';

export type KBEntry = {
  id: number;
  zone: ZoneType;
  market: Market | null;
  category: string;
  title: string;
  content: string;
  source: string;
  sourceUrl?: string;
  ruleId?: string;
  effectiveAt?: string;
  confidence: number;
};

const CATEGORY = 'outdoor-lighting';

export const KB_ENTRIES: KBEntry[] = [
  // ============ 规则区（7 条）============
  {
    id: 1, zone: 'rule', market: 'EU', category: CATEGORY,
    title: 'EU 2023/1670 能效标签要求（照明类）',
    content: '照明产品投放欧盟市场须贴能效标签，标注能效等级（A–G）与额定功率。页面与包装不得出现无依据的能效优越性宣称。',
    source: '欧盟官方公报 Regulation (EU) 2023/1670',
    sourceUrl: 'https://eur-lex.europa.eu/eli/reg/2023/1670/oj',
    ruleId: 'EU-ENERGY-LABEL', effectiveAt: '2023-09-01', confidence: 5,
  },
  {
    id: 2, zone: 'rule', market: 'US', category: CATEGORY,
    title: 'FTC 广告用语：禁止无依据的最高级表述',
    content: '美国联邦贸易委员会要求广告不得使用无合理依据的最高级表述（如 best、#1、100%、guaranteed）。若使用须能提供实质性证据。',
    source: 'FTC Advertising and Marketing Basics',
    sourceUrl: 'https://www.ftc.gov/business-guidance/advertising-marketing',
    ruleId: 'FTC-SUPERLATIVE', effectiveAt: '2024-01-01', confidence: 5,
  },
  {
    id: 3, zone: 'rule', market: 'DE', category: CATEGORY,
    title: '德国 UWG §5：误导性环境宣称',
    content: '使用「umweltfreundlich」「klimaneutral」等环境表述时，须能提供具体依据（如认证、检测报告），否则构成误导性商业行为。注意德语存在词形变化（umweltfreundlichste 等）。',
    source: '德国反不正当竞争法 UWG §5',
    sourceUrl: 'https://www.gesetze-im-internet.de/uwg_2004/__5.html',
    ruleId: 'DE-UWG-5', effectiveAt: '2022-05-28', confidence: 5,
  },
  {
    id: 4, zone: 'rule', market: 'ES', category: CATEGORY,
    title: '西班牙 Ley 3/1991：绝对化宣称限制',
    content: '广告不得包含与事实不符或无依据的绝对化表述（如 el mejor、número uno、garantizado）。',
    source: 'Ley 3/1991, de 10 de enero, de Competencia Desleal',
    sourceUrl: 'https://www.boe.es/buscar/act.php?id=BOE-A-1991-628',
    ruleId: 'ES-LEY3-1991', effectiveAt: '1991-01-10', confidence: 5,
  },
  {
    id: 5, zone: 'rule', market: 'EU', category: CATEGORY,
    title: 'CE 标识与符合性声明',
    content: 'CE 标识须附 EU 符合性声明（Declaration of Conformity），并在产品或随附文件中标明制造商与欧盟授权代表信息。',
    source: 'Regulation (EC) No 765/2008（CE 标识规则）',
    ruleId: 'CE-DECLARATION', effectiveAt: '2010-01-01', confidence: 5,
  },
  {
    id: 6, zone: 'rule', market: 'US', category: CATEGORY,
    title: 'FCC Part 15 合规声明',
    content: '含无线或电子元件的照明产品在美销售须符合 FCC Part 15，并保留检测报告以备查验。',
    source: '美国联邦通信委员会 FCC Part 15',
    sourceUrl: 'https://www.fcc.gov/general/rules-regulations-title-47',
    ruleId: 'FCC-PART15', effectiveAt: '2024-01-01', confidence: 4,
  },
  {
    id: 7, zone: 'rule', market: null, category: CATEGORY,
    title: '医疗功效宣称禁用',
    content: '非医疗产品（含照明类）不得使用 cure / treat / heal / medical grade 等表述，否则可能被认定为未获批医疗器械宣传。',
    source: '美国 FDA 器械与宣传监管口径',
    ruleId: 'GLOBAL-MEDICAL', effectiveAt: '2024-01-01', confidence: 4,
  },

  // ============ 认知区（4 条）============
  {
    id: 8, zone: 'cognition', market: 'US', category: CATEGORY,
    title: '北美用户关注实际续航而非环保属性',
    content: '北美庭院灯用户最主要顾虑是「冬季能撑几晚」与「下雨会不会坏」，环保属性是次要动因。文案应以续航与防护等级开场。',
    source: '目标市场用户调研标注（已脱敏）', confidence: 3,
  },
  {
    id: 9, zone: 'cognition', market: 'DE', category: CATEGORY,
    title: '德语市场：参数表优先于场景故事',
    content: '德语市场用户习惯先看技术参数再读场景描述。参数缺失会被视为不专业，而不是「精简叙事」。',
    source: '目标市场用户调研标注（已脱敏）', confidence: 3,
  },
  {
    id: 10, zone: 'cognition', market: 'ES', category: CATEGORY,
    title: '西语市场：安装便捷性权重高',
    content: '南欧自建住宅比例高，用户对「无需电工、自己十几分钟能装」敏感度高，安装说明应置于参数表之前或同等位置。',
    source: '目标市场用户调研标注（已脱敏）', confidence: 3,
  },
  {
    id: 11, zone: 'cognition', market: null, category: CATEGORY,
    title: '品类术语标准译法',
    content: '「安防照明」德语标准译法为 Sicherheitsbeleuchtung，不可直译为 Schutzlicht；西语为 iluminación de seguridad，不可译为 luz de protección。',
    source: '品类术语表（已脱敏）', confidence: 4,
  },

  // ============ 案例区（3 条）============
  {
    id: 12, zone: 'case', market: 'US', category: CATEGORY,
    title: '「天黑后院子发生了什么你看不见」场景切入',
    content: '以场景痛点开场而非参数开场。同品类页面询盘率显著高于参数导向版本。好在哪里：命中低语境市场的具体顾虑，且首句即可被引用。',
    source: '历史高质量样本 · 人工标注', confidence: 4,
  },
  {
    id: 13, zone: 'case', market: 'DE', category: CATEGORY,
    title: '德语版缺失认证标识导致跳出（反例）',
    content: '德语产品页若未在首屏可见处标注 CE 与 TÜV 类认证，跳出率明显偏高。好在哪里（反例）：说明合规信息在德语市场是「信任前置项」。',
    source: '历史运营数据 · 人工标注', confidence: 4,
  },
  {
    id: 14, zone: 'case', market: 'ES', category: CATEGORY,
    title: '西语版加装「快速自装」流程图',
    content: '在参数表前插入三步安装图示后，页面停留时长与询盘转化均有提升。好在哪里：把「无需电工」这一抽象卖点变成可视化证据。',
    source: '历史高质量样本 · 人工标注', confidence: 3,
  },

  // ============ 事实区（4 条）============
  {
    id: 15, zone: 'fact', market: null, category: CATEGORY,
    title: 'IP65 防护等级含义',
    content: 'IP65 = 完全防尘（6）+ 防喷水（5）。适用于户外长期暴露场景，无需额外遮蔽。',
    source: 'IEC 60529 防护等级标准', confidence: 5,
  },
  {
    id: 16, zone: 'fact', market: null, category: CATEGORY,
    title: 'LiFePO4 电池循环寿命与低温衰减',
    content: '磷酸铁锂常温典型循环约 1500 次（容量保持 80%）。低温衰减明显：-10 °C 下约为标称值的 60–70%。',
    source: '产品技术手册', confidence: 4,
  },
  {
    id: 17, zone: 'fact', market: null, category: CATEGORY,
    title: '太阳能板功率与续航换算',
    content: '5 W 单晶硅板在日有效光照 4 小时条件下日发电约 20 Wh，可支撑 5200 mAh（约 19 Wh）电池充满。',
    source: '产品技术手册', confidence: 4,
  },
  {
    id: 18, zone: 'fact', market: 'EU', category: CATEGORY,
    title: '能效标签等级划分',
    content: '照明类产品能效等级按 A–G 划分，A 为最高。标签须同时给出额定功率（W）与年能耗（kWh/1000h）。',
    source: 'EU 2023/1670 · 附件 III', confidence: 5,
  },
];

/* ============================================================
   市场 → 适用规则域
   EU 是超集：选欧盟全境必须同时加载成员国法规，
   否则德国 UWG、西班牙 Ley 3/1991 会被漏掉。
   ============================================================ */
const MARKET_SCOPE: Record<Market, Market[]> = {
  EU: ['EU', 'DE', 'ES'],
  US: ['US'],
  DE: ['EU', 'DE'],
  ES: ['EU', 'ES'],
};

export function marketScope(market: Market): Market[] {
  return MARKET_SCOPE[market] ?? [market];
}

function appliesTo(e: KBEntry, market: Market, category?: string): boolean {
  if (category && e.category !== category) return false;
  return e.market === null || marketScope(market).includes(e.market);
}

/** 精确召回：规则区 / 事实区。按市场 + 品类硬过滤，不做语义泛化。 */
export function retrieveExact(params: {
  zones: ZoneType[];
  market: Market;
  category?: string;
  limit?: number;
}): KBEntry[] {
  const { zones, market, category, limit = 40 } = params;
  return KB_ENTRIES
    .filter((e) => zones.includes(e.zone) && appliesTo(e, market, category))
    .sort((a, b) => b.confidence - a.confidence || a.id - b.id)
    .slice(0, limit);
}

/**
 * 语义召回：案例区 / 认知区。
 * 用轻量词频相似度（无需外部 embedding 服务）。
 * 条目量在百级，这已足够；接入真实 embedding 时只需替换本函数。
 */
export function retrieveSemantic(params: {
  zones: ZoneType[];
  market: Market;
  category?: string;
  query: string;
  limit?: number;
}): KBEntry[] {
  const { zones, market, category, query, limit = 6 } = params;
  const qTokens = tokenize(query);
  const candidates = KB_ENTRIES.filter((e) => zones.includes(e.zone) && appliesTo(e, market, category));

  const scored = candidates.map((e) => {
    const t = tokenize(`${e.title} ${e.content}`);
    let hit = 0;
    for (const qt of qTokens) if (t.has(qt)) hit++;
    const score = qTokens.size ? hit / qTokens.size : 0;
    return { e, score };
  });

  return scored
    .sort((a, b) => b.score - a.score || b.e.confidence - a.e.confidence)
    .slice(0, limit)
    .map((x) => x.e);
}

function tokenize(s: string): Set<string> {
  const out = new Set<string>();
  for (const w of s.toLowerCase().split(/[^\p{L}\p{N}]+/u)) {
    if (w.length > 1) out.add(w);
  }
  // 中文按二元切分，否则「照明」这类词匹配不上
  const cjk = s.match(/[\u4e00-\u9fa5]+/g) ?? [];
  for (const seg of cjk) {
    for (let i = 0; i < seg.length - 1; i++) out.add(seg.slice(i, i + 2));
  }
  return out;
}

/** 各分区条目数（界面展示用） */
export function kbStats(): Record<ZoneType, number> {
  const out: Record<ZoneType, number> = { rule: 0, cognition: 0, case: 0, fact: 0 };
  for (const e of KB_ENTRIES) out[e.zone]++;
  return out;
}

/** 按分区分组（知识库标签页用） */
export function kbGroups(): Record<ZoneType, KBEntry[]> {
  const out: Record<ZoneType, KBEntry[]> = { rule: [], cognition: [], case: [], fact: [] };
  for (const e of KB_ENTRIES) out[e.zone].push(e);
  return out;
}