import { getLLM, type ChatMessage } from './llm';
import type { AdFact } from './pipeline';
import type { JobSpec, Market } from './types';
import { retrieveSemantic } from './kb';
import type { ExampleSpec, LocaleCopy } from './examples';

/**
 * S3 / S4 的大模型生成
 * ------------------------------------------------------------
 * 分工：
 *   - 有 LLM：真调用模型产出大纲与三语种文案（结构化 JSON → 渲染）
 *   - 无 LLM / 调用失败 / JSON 不合规：回退确定性模板，链路永远不断
 *   - 命中示例提示词：直接走 examples.ts 里的缓存，一次模型都不调
 *
 * 设计红线：模型只负责"说什么"，不负责"长什么样"。
 * HTML 结构、CSS、JSON-LD、合规区块骨架一律由 render.ts 控制，
 * 这样模型自由发挥也不会把页面写坏或抠掉合规声明。
 */

export type OutlineResult = {
  modules: string[];
  rationale: string[];
  caseHints: string[];
  source: 'llm' | 'cache' | 'template';
  error?: string;
};

const ALLOWED_MODULES = ['hero', 'specs', 'compliance', 'scenarios', 'faq', 'lead-form'];

const LOCALE_NAME: Record<string, string> = {
  en: 'English',
  de: 'German (Deutsch)',
  es: 'Spanish (Español)',
};

/** 从模型返回里抠出 JSON：容忍 ```json 围栏和前后废话 */
function parseJsonLoose<T>(raw: string): T {
  let s = raw.trim();
  const fence = /```(?:json)?\s*([\s\S]*?)```/i.exec(s);
  if (fence) s = fence[1].trim();
  const start = s.indexOf('{');
  const end = s.lastIndexOf('}');
  if (start >= 0 && end > start) s = s.slice(start, end + 1);
  return JSON.parse(s) as T;
}

/* ============================================================
   S3 · 结构规划
   ============================================================ */
export async function generateOutline(
  spec: JobSpec,
  rules: Array<{ ruleId?: string; title: string }>,
  cached?: ExampleSpec['outline'],
): Promise<OutlineResult> {
  // 1) 示例命中 → 缓存
  if (cached) {
    return { ...cached, source: 'cache' };
  }

  const llm = getLLM();
  const template: OutlineResult = {
    modules: ALLOWED_MODULES,
    rationale: ['按品类与市场惯例选择 6 模块：hero → specs → compliance → scenarios → faq → lead-form'],
    caseHints: retrieveSemantic({
      zones: ['case'], market: spec.market, category: spec.category,
      query: spec.topic, limit: 3,
    }).map((c) => c.title),
    source: 'template',
  };

  if (llm.name.startsWith('stub')) return template;

  const rulesText = rules.map((r) => `${r.ruleId ?? '-'} ${r.title}`).join('\n');
  const messages: ChatMessage[] = [
    {
      role: 'system',
      content: `你是出海 B2B/B2C 落地页的结构规划器。只输出 JSON，不要解释。
可用模块只能从这个集合里选：${ALLOWED_MODULES.join(', ')}。
输出格式：{"modules": ["..."], "rationale": ["理由1","理由2","理由3"], "caseHints": ["可参考的案例方向"]}
要求：
- modules 按页面从上到下顺序排列，必须包含 compliance 与 faq
- rationale 用中文，每条说明一个模块为什么这么排，要扣住本次市场与合规约束
- caseHints 不要编造具体公司名或数据`,
    },
    {
      role: 'user',
      content: `目标市场：${spec.market}
品类：${spec.category}
选题：${spec.topic}
已加载的硬约束（生成前必须考虑）：
${rulesText || '（无）'}

请给出这个落地页的结构规划。`,
    },
  ];

  try {
    const raw = await llm.chat(messages, { jsonMode: true, temperature: 0.3, maxTokens: 800 });
    const parsed = parseJsonLoose<{ modules?: string[]; rationale?: string[]; caseHints?: string[] }>(raw);
    const modules = (parsed.modules ?? [])
      .map((m) => String(m).trim())
      .filter((m) => ALLOWED_MODULES.includes(m));
    if (!modules.length) throw new Error('modules 为空或不合法');

    return {
      modules,
      rationale: (parsed.rationale ?? []).map(String).slice(0, 5),
      caseHints: (parsed.caseHints ?? []).map(String).slice(0, 4).length
        ? (parsed.caseHints ?? []).map(String).slice(0, 4)
        : template.caseHints,
      source: 'llm',
    };
  } catch (e) {
    return { ...template, error: (e as Error).message };
  }
}

/* ============================================================
   S4 · 多语种正文
   ============================================================ */
export type CopyResult = {
  locale: string;
  copy: LocaleCopy;
  source: 'llm' | 'cache' | 'template';
  error?: string;
};

const MARKET_RULE_HINT: Record<Market, string> = {
  US: 'FTC 广告指南：禁止无依据的最高级与绝对化表述（best / #1 / 100% / guaranteed / unbeatable 等一律不许出现）；须声明 FCC Part 15。',
  DE: '德国 UWG §5：环境与性能宣称必须有具体依据，禁止 umweltfreundlich / klimaneutral / nachhaltig 这类无依据表述；须有 CE 符合性声明与授权代表信息。',
  ES: '西班牙 Ley 3/1991：广告不得含无依据的绝对化表述，禁止 el mejor / número uno / garantizado / insuperable；须有 CE 符合性声明。',
  EU: '同时适用德国 UWG §5 与西班牙 Ley 3/1991，并须按 EU 2023/1670 标注能效等级与额定功率、附 CE 符合性声明。',
};

const FORBIDDEN = [
  'best', 'number one', '#1', '100%', 'guaranteed', 'unbeatable',
  'el mejor', 'número uno', 'garantizado', 'insuperable',
  'umweltfreundlich', 'klimaneutral', 'nachhaltig',
  'cure', 'treats', 'heals',
];

/** 模型文案里如果混进了违规词，就地换掉再交给 S5，不浪费一次打回 */
function scrubForbidden(copy: LocaleCopy, locale: string): { copy: LocaleCopy; scrubbed: string[] } {
  const scrubbed: string[] = [];
  const REPLACE: Record<string, string> = {
    best: 'well suited for', 'number one': '',
    'el mejor': 'una opción adecuada', 'número uno': '',
    garantizado: 'con condiciones de medición indicadas',
    insuperable: 'con rendimiento verificado',
    umweltfreundlich: 'mit Prüfbericht belegt', klimaneutral: 'mit Nachweis auf Anfrage',
    nachhaltig: 'langlebig',
  };
  const walk = (v: unknown, keyPath: string): unknown => {
    if (typeof v === 'string') {
      let s = v;
      for (const bad of FORBIDDEN) {
        const re = new RegExp(bad.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
        if (re.test(s)) {
          scrubbed.push(`${keyPath}: "${bad}"`);
          s = s.replace(re, REPLACE[bad] ?? '');
        }
      }
      return s.replace(/\s{2,}/g, ' ').trim();
    }
    if (Array.isArray(v)) return v.map((x, i) => walk(x, `${keyPath}[${i}]`));
    if (v && typeof v === 'object') {
      const o: Record<string, unknown> = {};
      for (const [k, x] of Object.entries(v)) o[k] = walk(x, `${keyPath}.${k}`);
      return o;
    }
    return v;
  };
  void locale;
  return { copy: walk(copy, 'copy') as LocaleCopy, scrubbed };
}

export async function generateCopy(params: {
  spec: JobSpec;
  locale: string;
  facts: AdFact[];
  modules: string[];
  cached?: LocaleCopy;
  /**
   * 续写/修订：把上一版文案交给模型，按用户这条新指令局部改写。
   * 给了 revision 时不再走示例缓存 —— 用户要的是「在原稿基础上改」。
   */
  revision?: { previous: LocaleCopy; instruction: string };
}): Promise<CopyResult> {
  const { spec, locale, facts, modules, cached, revision } = params;

  // 1) 修订模式优先：有上一版就基于它改，不再命中示例缓存
  if (revision) {
    const llm0 = getLLM();
    if (llm0.name.startsWith('stub')) {
      return { locale, copy: revision.previous, source: 'template' };
    }
  }

  // 2) 示例命中 → 缓存
  if (cached && !revision) return { locale, copy: cached, source: 'cache' };

  const empty: LocaleCopy = {};
  const llm = getLLM();
  if (llm.name.startsWith('stub')) return { locale, copy: empty, source: 'template' };

  const factLines = facts
    .filter((f) => f.label !== 'sku')
    .map((f) => `- ${f.label}: ${f.value}`)
    .join('\n');

  const schema = `{
  "eyebrow": "一行小标签，例：IP65 · 太阳能 · 免布线",
  "h1": "主标题，一句，基于场景，不夸",
  "sub": "副标题，2 句内，说明解决什么问题",
  "ctaPrimary": "主按钮文案",
  "ctaSecondary": "次按钮文案",
  "specsTitle": "参数区标题",
  "specsLead": "参数区导语，说明数据来源与测量条件",
  "scenesTitle": "场景区标题",
  "scenes": [{"h": "场景名", "p": "1-2 句，带具体安装条件"}],
  "faqTitle": "FAQ 区标题",
  "faq": [{"q": "问题", "a": "答案，带具体数值与测量条件"}],
  "formTitle": "表单标题",
  "formSub": "表单说明",
  "formCta": "表单按钮",
  "seoTitle": "页面 title，60 字符内，品类准确，不带夸大",
  "seoDesc": "meta description，150 字符内，说明是什么 + 关键参数 + 场景"
}`;

  /* ---------- 修订模式：基于上一版按指令局部改写 ---------- */
  if (revision) {
    const llm2 = getLLM();
    const prev = revision.previous;
    const prevJson = JSON.stringify(prev, null, 2);
    const factLines2 = facts
      .filter((f) => f.label !== 'sku')
      .map((f) => `- ${f.label}: ${f.value}`)
      .join('\n');

    const revMessages: ChatMessage[] = [
      {
        role: 'system',
        content: `你是 ${LOCALE_NAME[locale] ?? 'English'} 的资深出海落地页文案专家。用户在上一版文案上提出了修改意见，你要**在原稿基础上修改**，不是重写。你只输出 JSON。

修改原则：
1. **只改用户明确要求改的部分**，其余字段必须逐字保持原样（包括标点、数字、专有名词）。没被提到的一律不动。
2. 修改后仍须遵守全部硬性约束：只能用给定产品事实，禁止新增数值/认证/奖项；每个性能数字带测量条件；禁止出现 ${FORBIDDEN.join(' / ')}。
3. 市场法规：${MARKET_RULE_HINT[spec.market]}
4. 全部内容用 ${LOCALE_NAME[locale] ?? 'English'} 书写（若用户要求换语言除外），IP65 / lm / mAh / °C 不翻译。
5. scenes 3 条、faq 4 条，除非用户明确要求增删。
6. 输出完整 JSON（全部字段），不是 diff。未修改字段原样带出。

输出 JSON 结构：
${schema}`,
      },
      {
        role: 'user',
        content: `产品事实（唯一可用数据源）：
${factLines2}

品牌：${spec.brandName} · 市场：${spec.market} · 选题：${spec.topic}

===== 上一版文案（原文）=====
${prevJson}

===== 用户的修改要求 =====
${revision.instruction}

请按要求修改并输出完整 JSON。`,
      },
    ];

    try {
      const raw = await llm2.chat(revMessages, { jsonMode: true, temperature: 0.35, maxTokens: 2600 });
      const parsed = parseJsonLoose<LocaleCopy>(raw);
      if (!parsed || typeof parsed !== 'object') throw new Error('返回不是对象');
      if (!parsed.h1) throw new Error('缺少 h1');
      const { copy } = scrubForbidden(parsed, locale);
      // 保底：用户在加内容时，别让模型把 faq/scenes 改没了
      if (!copy.faq?.length && prev.faq?.length) copy.faq = prev.faq;
      if (!copy.scenes?.length && prev.scenes?.length) copy.scenes = prev.scenes;
      return { locale, copy, source: 'llm' };
    } catch (e) {
      return {
        locale,
        copy: prev,
        source: 'template',
        error: `修订失败，已保留上一版：${(e as Error).message}`,
      };
    }
  }

  const messages: ChatMessage[] = [
    {
      role: 'system',
      content: `你是 ${LOCALE_NAME[locale] ?? 'English'} 的资深出海落地页文案专家。你只输出 JSON，不要 markdown 围栏，不要解释。

硬性约束（违反即废稿）：
1. 只能使用我给的产品事实，禁止新增任何数值、认证、奖项、客户评价。
2. 每个性能数字必须在同一句里带上测量条件（如 @2 m 安装高度、120° 探测角）。
3. 禁止出现这些词或其任何变体：${FORBIDDEN.join(' / ')}
4. 市场法规要求：${MARKET_RULE_HINT[spec.market]}
5. 全部内容用 ${LOCALE_NAME[locale] ?? 'English'} 书写，专有名词与数字保持原样（IP65、lm、mAh、°C 不翻译不改写）。
6. scenes 给 3 条，faq 给 4 条。不要输出合规声明区块，那个由系统模板负责。
7. seoTitle / seoDesc 必须准确反映【品类】与【选题】，不要照抄「solar security lighting」这类默认词。

输出 JSON 结构：
${schema}`,
    },
    {
      role: 'user',
      content: `产品事实（唯一可用数据源）：
${factLines}

品牌：${spec.brandName}
目标市场：${spec.market}
选题：${spec.topic}
页面模块顺序：${modules.join(' → ')}

请生成这个页面的 ${LOCALE_NAME[locale] ?? 'English'} 文案。`,
    },
  ];

  try {
    const raw = await llm.chat(messages, { jsonMode: true, temperature: 0.6, maxTokens: 2600 });
    const parsed = parseJsonLoose<LocaleCopy>(raw);
    if (!parsed || typeof parsed !== 'object') throw new Error('返回不是对象');
    if (!parsed.h1 || !parsed.faq?.length) throw new Error('缺少 h1 或 faq');
    const { copy } = scrubForbidden(parsed, locale);
    return { locale, copy, source: 'llm' };
  } catch (e) {
    return { locale, copy: empty, source: 'template', error: (e as Error).message };
  }
}