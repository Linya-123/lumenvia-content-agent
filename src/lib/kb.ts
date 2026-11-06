/**
 * 知识库（代码内置）
 * ------------------------------------------------------------
 * 18 条内置条目：包含法规参考、模拟案例与虚拟产品假设。部分条目不是外部验证的事实，
 * 不能将模拟样本或虚拟参数称为真实的运营证据。
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
    title: '欧盟光源能效标签适用性核查',
    content: 'EU 2019/2015 针对适用光源的能效标签；其附录 IV 第 2(c) 项排除特定电池供电光源（包括太阳能花园灯）。必须按实际产品构造核实适用范围，不能默认本演示产品必须贴标。',
    source: '欧盟委员会授权条例 (EU) 2019/2015',
    sourceUrl: 'https://eur-lex.europa.eu/eli/reg/2019/2015',
    ruleId: 'EU-ENERGY-APPLICABILITY', confidence: 5,
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
    content: '应先确认产品所属指令/法规是否要求 CE 标识，适用时准备对应符合性技术资料与 EU 符合性声明。制造商/进口商等身份及标示责任也需按市场和产品类别核对。',
    source: 'Regulation (EC) No 765/2008（CE 标识规则）',
    ruleId: 'CE-DECLARATION', effectiveAt: '2010-01-01', confidence: 5,
  },
  {
    id: 6, zone: 'rule', market: 'US', category: CATEGORY,
    title: 'FCC Part 15 合规声明',
    content: 'FCC Part 15 是否适用，需要按实际产品电子结构、辐射/发射类型和市场要求判断；不能一概宣称本虚拟产品已通过 FCC 测试。',
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
    content: '演示内容假设：用户可能关注冬季续航、安装和防护等级。应通过真实访谈或运营数据验证排序。',
    source: '演示性用户需求假设（非真实调研）', confidence: 3,
  },
  {
    id: 9, zone: 'cognition', market: 'DE', category: CATEGORY,
    title: '德语市场：参数表优先于场景故事',
    content: '演示性内容策略：可将技术参数前置，以便用户理解规格。该市场偏好尚未用真实用户数据验证。',
    source: '演示性用户需求假设（非真实调研）', confidence: 3,
  },
  {
    id: 10, zone: 'cognition', market: 'ES', category: CATEGORY,
    title: '西语市场：安装便捷性权重高',
    content: '演示性内容策略：可突出安装步骤，但不得把用户偏好或安装速度描述成经调研证实的结论。',
    source: '演示性用户需求假设（非真实调研）', confidence: 3,
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
    content: '演示案例：可以用场景痛点开场。未进行真实询盘率实验，不应宣传该策略已经带来转化提升。',
    source: '演示性案例草案（非真实历史效果）', confidence: 4,
  },
  {
    id: 13, zone: 'case', market: 'DE', category: CATEGORY,
    title: '德语版缺失认证标识导致跳出（反例）',
    content: '演示反例：不能为了建立信任而添加未经核实的 CE/TÜV 认证；应显示适用性说明和资料核验状态。没有真实跳出率数据。',
    source: '演示性反例（无真实跳出率数据）', confidence: 4,
  },
  {
    id: 14, zone: 'case', market: 'ES', category: CATEGORY,
    title: '西语版加装「快速自装」流程图',
    content: '演示案例：考虑增加三步安装图示以解释操作。未实际测量停留时长或询盘转化。',
    source: '演示性案例草案（非真实历史效果）', confidence: 3,
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
    content: '虚拟产品示例参数：循环寿命及低温性能未附第三方报告，不能作真实产品性能保证。',
    source: '虚拟产品演示参数（未核实）', confidence: 4,
  },
  {
    id: 17, zone: 'fact', market: null, category: CATEGORY,
    title: '太阳能板功率与续航换算',
    content: '虚拟产品示例：5 W × 4 h = 理想 20 Wh，实际充电还受转换损失、温度与电池标称电压影响；不等于承诺一天充满。',
    source: '虚拟产品演示参数（未核实）', confidence: 4,
  },
  {
    id: 18, zone: 'fact', market: 'EU', category: CATEGORY,
    title: '能效标签等级划分',
    content: '对于适用 EU 2019/2015 的光源，能效标签采用 A–G 等级；电池供电产品（如太阳能花园灯）可能按附录 IV 排除，需先核实产品定义和供电结构。',
    source: 'EU 2019/2015 · 附录 IV（适用性需核实）', confidence: 5,
  },
];

/* ============================================================
   市场 → 适用规则域
   EU 模式仅演示 DE/ES 与欧盟级参考资料，不能代表欧盟所有成员国法规，
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