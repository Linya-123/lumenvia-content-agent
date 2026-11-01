export type Market = 'US' | 'DE' | 'ES' | 'EU';
export const MARKETS: { id: Market; label: string; locales: string[] }[] = [
  { id: 'US', label: '北美（US/CA）', locales: ['en'] },
  { id: 'DE', label: '西欧（DE/FR）', locales: ['de'] },
  { id: 'ES', label: '南欧（ES/IT）', locales: ['es'] },
  { id: 'EU', label: '欧盟全境', locales: ['en', 'de', 'es'] },
];

export type ZoneType = 'rule' | 'cognition' | 'case' | 'fact';
export const ZONE_LABEL: Record<ZoneType, string> = {
  rule: '规则区',
  cognition: '认知区',
  case: '案例区',
  fact: '事实区',
};

export type StageDef = {
  id: number;
  key: string;
  name: string;
  desc: string;
  isNew: boolean;
};

/** 9 阶段编排 —— 前三个是"Agent 化"增量，后六个复用原流水线 */
export const STAGES: StageDef[] = [
  { id: 0, key: 'clarify',   name: '需求澄清',   desc: '自然语言 → 结构化任务单',            isNew: true },
  { id: 1, key: 'rules',     name: '规则加载',   desc: '目标市场 + 品类 → 硬约束清单',        isNew: true },
  { id: 2, key: 'topic',     name: '选题定档',   desc: '效果数据 + 内容缺口 → 选题与理由',    isNew: true },
  { id: 3, key: 'outline',   name: '结构规划',   desc: '选题 + 案例 → 页面大纲',              isNew: false },
  { id: 4, key: 'generate',  name: '多语种生成', desc: '大纲 + 约束 → N 语种初稿',            isNew: false },
  { id: 5, key: 'lint',      name: '确定性校验', desc: '禁词 / 必填字段 / 认证标识',          isNew: false },
  { id: 6, key: 'semantic',  name: '语义质检',   desc: 'LLM 判官评分 + 打回原因',             isNew: false },
  { id: 7, key: 'readiness', name: '引用就绪度', desc: '事实密度 / 来源 / 实体 / 可抓取',     isNew: true },
  { id: 8, key: 'assemble',  name: '产出组装',   desc: '终稿 → 完整落地页 HTML',              isNew: false },
];

export type JobSpec = {
  market: Market;
  locales: string[];
  category: string;
  topic: string;
  intent: string;
  brandName: string;
  domain: string;
  /** 当前语种（渲染时用） */
  site: string;
  slug: string;
  title: string;
  metaDesc: string;
};

export type Readiness = {
  factDensity: number;
  citationCoverage: number;
  entityConsistency: number;
  crawlability: number;
  pass: boolean;
};

export type LintViolation = {
  ruleId: string;
  locale: string;
  location: string;
  type: string;
  matched: string;
  message: string;
};

export type TopicDecision = {
  topic: string;
  priority: 'P0' | 'P1' | 'P2';
  reason: string;
  evidence: { label: string; value: string }[];
};

export type Citation = {
  ruleId?: string | null;
  title: string;
  source: string;
  zone: ZoneType;
};

export type StageEvent =
  | { kind: 'stage'; stage: number; status: 'running' | 'ok' | 'retried' | 'failed'; summary: string; detail?: unknown }
  | { kind: 'citation'; citations: Citation[] }
  | { kind: 'message'; content: string }
  | { kind: 'choices'; options: string[] };