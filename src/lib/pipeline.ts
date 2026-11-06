import { retrieveExact, retrieveSemantic } from './kb';
import { lintPage, extractText } from './lint';
import { computeReadiness, semanticJudge } from './readiness';
import { renderPage } from './render';
import { renderSparseV9 } from './render-v9';
import type { ProductFactV9 } from './product-profile-v9';
import type { ClaimRecordV9 } from './claim-engine-v9';
import type { EditorialDecisionV91 } from './content-select-v91';
import { dynamicTopicDecision } from './topic-planner-v92';
import { generateOutline, generateCopy, type OutlineResult, type CopyResult } from './generate';
import type {PageDesignPlan} from './design-planner-v95';
import type { ExampleSpec, LocaleCopy } from './examples';
import type { EvidenceDocument } from './evidence';
import { type ProductMetricIssue } from './fact-guard';
import type { MarketRow } from './market-data';
import type {
  Citation, JobSpec, LintViolation, Market, TopicDecision,
} from './types';

/**
 * 编排引擎
 * ------------------------------------------------------------
 * 纯内存 + 纯函数，不依赖数据库。
 * 每个阶段返回 { summary, detail }，由调用方通过 SSE 推送到前端。
 */

export type StageResult = {
  summary: string;
  detail?: unknown;
  citations?: Citation[];
};

export type AdFact = { label: string; value: string; sourceId?: string };

/* ============================================================
   S1 · 规则加载（精确召回）
   ============================================================ */
export async function stage1Rules(market: Market, category: string): Promise<StageResult> {
  const hits = retrieveExact({ zones: ['rule'], market, category, limit: 40 });
  const citations: Citation[] = hits.slice(0, 3).map((h) => ({
    ruleId: h.ruleId, title: h.title, source: h.source, zone: h.zone,
  }));
  return {
    summary: hits.length ? `已加载 ${hits.length} 条品类参考规则` : '暂无品类专属规则 · 启用通用风险筛查',
    detail: {
      byMarket: market,
      rules: hits.map((h) => ({
        ruleId: h.ruleId, title: h.title, source: h.source, effectiveAt: h.effectiveAt,
      })),
    },
    citations,
  };
}

/* ============================================================
   S2 · 选题定档（数据驱动）
   ============================================================ */
export async function stage2Topic(
  spec: JobSpec, marketRows?: MarketRow[], facts: AdFact[] = [],
): Promise<StageResult & { decision: TopicDecision }> {
  const decision = await dynamicTopicDecision(spec, marketRows, facts.map(f=>({label:f.label,value:f.value})));
  return {
    summary: decision.source === 'uploaded_csv' ? `CSV 主题分析 · ${decision.priority}` :
      decision.source === 'llm_reasoning' ? '动态内容规划 · 模型建议' : '动态内容规划 · 离线建议',
    detail: decision, decision,
  };
}

/* ============================================================
   S3 · 结构规划（LLM 产出，示例命中走缓存，失败回退模板）
   ============================================================ */
export async function stage3Outline(
  spec: JobSpec,
  rules: Array<{ ruleId?: string; title: string }> = [],
  cached?: ExampleSpec['outline'],
  decision?: TopicDecision,
  factCount = 0,
): Promise<StageResult & { outline: OutlineResult }> {
  const outline = await generateOutline(spec, rules, cached, decision, factCount);

  const cases = retrieveSemantic({
    zones: ['case'], market: spec.market, category: spec.category,
    query: spec.topic, limit: 3,
  });

  const badge = outline.source === 'llm' ? '模型生成'
    : outline.source === 'cache' ? '示例缓存' : '模板兜底';
  const summary = `${outline.modules.length} 个模块 · ${badge}`;

  return {
    summary,
    detail: {
      modules: outline.modules,
      design: outline.design,
      rationale: outline.rationale,
      caseHints: outline.caseHints,
      source: outline.source,
      ...(outline.error ? { error: outline.error } : {}),
    },
    citations: cases.slice(0, 2).map((c) => ({
      title: c.title, source: c.source, zone: c.zone,
    })),
    outline,
  };
}

/* ============================================================
   S4 · 多语种生成（LLM 产出文案 → 模板渲染 HTML）
   ============================================================ */
export async function stage4Generate(
  spec: JobSpec,
  facts: AdFact[],
  opts: {
    modules?: string[];
    design?: PageDesignPlan;
    cachedCopy?: Record<string, LocaleCopy>;
    /** 续写修订：基于上一版文案 + 用户新指令 */
    revision?: { instruction: string; previousByLocale: Record<string, LocaleCopy> };
    evidenceDocs?: EvidenceDocument[];
    factsByLocale?: Record<string, AdFact[]>;
    profileV9?: ProductFactV9[];
    focusAreas?: string[];
  } = {},
): Promise<{
  summary: string;
  pages: Array<{ locale: string; html: string }>;
  sources: Array<{ locale: string; source: CopyResult['source']; error?: string }>;
  copyByLocale: Record<string, LocaleCopy>;
  factGuard: Array<ProductMetricIssue & { locale: string }>;
  claimsV9: ClaimRecordV9[];
  editorialV91: EditorialDecisionV91[];
}> {
  const modules = opts.modules ?? ALLOWED_MODULES_FALLBACK;

  const results = await Promise.all(
    spec.locales.map((locale) =>
      generateCopy({
        spec, locale, modules,
        cached: opts.cachedCopy?.[locale],
        facts: opts.factsByLocale?.[locale] ?? facts,
        evidenceDocs: opts.evidenceDocs,
        focusAreas: opts.focusAreas,
        designConcept: opts.design?.concept,
        revision: opts.revision?.previousByLocale[locale]
          ? {
              previous: opts.revision.previousByLocale[locale],
              instruction: opts.revision.instruction,
            }
          : undefined,
      }),
    ),
  );

  const factGuard: Array<ProductMetricIssue & {locale: string}> = [];
  const claimsV9: ClaimRecordV9[] = [];
  const editorialV91: EditorialDecisionV91[] = [];
  const pages = results.map((r) => {
    if (opts.profileV9) {
      const rendered = renderSparseV9({...spec, locale:r.locale, facts:opts.profileV9, copy:r.copy, modules, focusAreas:opts.focusAreas, designPlan:opts.design});
      claimsV9.push(...rendered.claims);
      editorialV91.push(...rendered.editorial);
      return {locale:r.locale, html:rendered.html};
    }
    const issues: ProductMetricIssue[] = [];
    const html = renderPage({
      ...spec,
      locale: r.locale,
      // site = 当前渲染语种，templates 的 title/meta 才能跟着语种走
      site: r.locale,
      facts: opts.factsByLocale?.[r.locale] ?? facts,
      copy: r.copy,
      factGuardLog: issues,
      // 模型给了 SEO 标题就用模型的；否则用本语种的模板标题（不是 spec 里那个固定值）
      ...(r.copy.seoTitle
        ? { title: `${r.copy.seoTitle} | ${spec.brandName}` }
        : spec.title
          ? {}
          : { title: `${TITLE_BY_LOCALE[r.locale] ?? TITLE_BY_LOCALE.en}` }),
      ...(r.copy.seoDesc ? { metaDesc: r.copy.seoDesc } : {}),
      ...(spec.topic ? { slug: slugify(spec.topic) } : {}),
    });
    factGuard.push(...issues.map(issue => ({ ...issue, locale:r.locale })));
    return {locale:r.locale, html};
  });

  const sources = results.map((r) => ({
    locale: r.locale, source: r.source, ...(r.error ? { error: r.error } : {}),
  }));

  const llmCount = sources.filter((s) => s.source === 'llm').length;
  const cacheCount = sources.filter((s) => s.source === 'cache').length;
  const fallback = sources.filter((s) => s.source === 'template').map((s) => s.locale);

  const parts = [`${pages.length} 语种`];
  if (llmCount) parts.push(`模型 ${llmCount}`);
  if (cacheCount) parts.push(`缓存 ${cacheCount}`);
  if (fallback.length) parts.push(`兜底 ${fallback.join('/')}`);

  return {
    summary: parts.join(' · '),
    pages,
    sources,
    copyByLocale: Object.fromEntries(results.map((r) => [r.locale, r.copy])),
    factGuard,
    claimsV9,
    editorialV91,
  };
}

const ALLOWED_MODULES_FALLBACK = ['hero', 'specs', 'compliance', 'scenarios', 'faq', 'lead-form'];

/** 无模型文案时的语种化标题兜底（不要在德语页上输出英文 title） */
const TITLE_BY_LOCALE: Record<string, string> = {
  en: 'Solar Security Lighting for Yard & Driveway',
  de: 'Solar-Sicherheitsleuchte für Einfahrt & Hof',
  es: 'Luz solar de seguridad para entradas y patios',
};

/** 选题 → URL slug，支持西语/德语重音符号 */
function slugify(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'product';
}

/**
 * 违规表述的局部改写表。
 * S5 打回后如果只会"删掉整段"，模型辛苦写的正文会被掏空 ——
 * 所以先按规则做同义替换，把句子保住；替换后仍不合格才整段移除。
 */
const VIOLATION_REWRITE: Record<string, Record<string, string>> = {
  'FTC-SUPERLATIVE': {
    best: 'well suited for', 'number one': 'widely used', '100%': 'consistently',
    guaranteed: 'covered by a stated test condition', 'the most advanced': 'current-generation',
    unbeatable: 'hard to match on stated specs',
  },
  'ES-LEY3-1991': {
    'el mejor': 'una opción adecuada', 'número uno': 'de uso extendido',
    '100%': 'de forma consistente', garantizado: 'con condición de medición indicada',
    insuperable: 'con rendimiento verificado',
  },
  'DE-UWG-5': {
    umweltfreundlichste: 'für den Außenbereich vorgesehene', umweltfreundlich: 'für den Außenbereich vorgesehene',
    klimaneutral: 'für den Außenbereich geeignet', nachhaltig: 'für den Außenbereich geeignet',
  },
  'GLOBAL-MEDICAL': { cure: 'help with', treats: 'is designed for', heals: 'supports' },
};

/** 把命中的违规表述就地改写；返回改写后的 HTML */
function rewriteViolation(html: string, matched: string, ruleId: string): string {
  const table = VIOLATION_REWRITE[ruleId] ?? {};
  const alt = table[matched.toLowerCase()] ?? table[matched] ?? '';
  const esc = matched.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  // 优先只改正文文本节点，避免误伤 class 名 / JSON-LD 键
  const re = new RegExp(`(?<=>)([^<]*?)${esc}([^<]*?)(?=<)`, 'gi');
  let out = html;
  if (alt) {
    out = out.replace(re, (_m, before: string, after: string) => `${before}${alt}${after}`);
  }
  // 若属性或 JSON-LD 中仍含风险文字，交给后续审查和质量门；不得全局修改 HTML。
  // 清理替换造成的多余空白与空标签
  return out
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/>\s+</g, '><')
    .replace(/<(\w+)[^>]*>\s*<\/\1>/g, '');
}

/* ============================================================
   S5 · 确定性校验（含打回重试）
   ============================================================ */
export type LintOutcome = {
  violations: LintViolation[];
  retried: string[];
  pages: Array<{ locale: string; html: string }>;
};

export async function stage5Lint(
  pages: Array<{ locale: string; html: string }>,
  market: Market,
): Promise<LintOutcome> {
  const violations: LintViolation[] = [];

  for (const p of pages) {
    const v = lintPage({
      locale: p.locale,
      market,
      bodyText: extractText(p.html),
      html: p.html,
    });
    if (v.length) violations.push(...v);
  }

  if (violations.length === 0) {
    return { violations: [], retried: [], pages };
  }

  const badLocales = [...new Set(violations.map((v) => v.locale))];

  // 修复：先做局部改写（保住句子），实在改不掉的整段移除
  const fixed = pages.map((p) => {
    if (!badLocales.includes(p.locale)) return p;
    let html = p.html;
    html = html.replace(/<p class="draft-warn">[\s\S]*?<\/p>/g, '');
    for (const v of violations.filter((x) => x.locale === p.locale)) {
      if (v.matched === '(缺失)') continue;
      html = rewriteViolation(html, v.matched, v.ruleId);
    }
    return { ...p, html };
  });

  // 重试后再校验一遍，只报剩余问题
  const remaining: LintViolation[] = [];
  for (const p of fixed) {
    const v = lintPage({
      locale: p.locale, market,
      bodyText: extractText(p.html), html: p.html,
    });
    if (v.length) remaining.push(...v);
  }

  return { violations: remaining, retried: badLocales, pages: fixed };
}

/** 返回首轮违规，供 SSE 推送"被拦截了什么" */
export function firstViolationsPerLocale(
  pages: Array<{ locale: string; html: string }>,
  market: Market,
): LintViolation[] {
  const out: LintViolation[] = [];
  for (const p of pages) {
    const v = lintPage({
      locale: p.locale, market,
      bodyText: extractText(p.html), html: p.html,
    });
    if (v[0]) out.push(v[0]);
  }
  return out;
}

/* ============================================================
   S6 · 语义质检
   ============================================================ */
export async function stage6Semantic(
  spec: JobSpec,
  main: { locale: string; html: string },
  rules: string[],
): Promise<{ summary: string; score: number | null; issues: string[]; judge: string }> {
  const r = await semanticJudge({ html: main.html, topic: spec.topic, rules });
  return { summary: r.score===null ? '评分未完成 · 需复核' : `${r.score} 分${r.judge==='stub-heuristic'?'（离线规则）':''}`, score: r.score, issues: r.issues, judge: r.judge };
}

/* ============================================================
   S7 · 引用就绪度
   ============================================================ */
export async function stage7Readiness(
  pages: Array<{ locale: string; html: string }>,
  brandName: string,
  sku: string,
) {
  const main = pages[0];
  const r = computeReadiness({
    mainHtml: main.html, allPages: pages, brandName, sku,
  });
  const passed = [
    r.factDensity >= 60,
    r.citationCoverage >= 70,
    r.entityConsistency >= 80,
    r.crawlability >= 75,
  ].filter(Boolean).length;
  return { readiness: r, summary: `${passed}/4 项达标` };
}