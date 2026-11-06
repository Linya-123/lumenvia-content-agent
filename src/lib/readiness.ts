import { getLLM } from './llm';
import type { Readiness } from './types';
import { extractText } from './lint';

/**
 * 引用就绪度：4 项指标，全部程序可算、可解释、可复现。
 * 这是"AI 引用"不可控结果的可验证代理指标。
 */

const FACT_PATTERNS = [
  /\b\d+(\.\d+)?\s*(m|mm|cm|lumens?|lm|mAh|W|Wp|°C|°F|%|nights?|hours?|minutes?|cycles?)\b/gi,
  /\bIP\s?\d{2}\b/gi,
  /\b(CE|FCC|RoHS|TÜV|ISO\s?\d+)\b/gi,
  /\b[A-Z]{2,}-\d{3,}\b/g,
  /\d{4}\/\d+/g,
];

export function factDensity(html: string): { score: number; facts: number; words: number } {
  const text = extractText(html);
  const words = (text.match(/[\p{L}\p{N}]+/gu) ?? []).length || 1;
  let facts = 0;
  for (const p of FACT_PATTERNS) {
    facts += (text.match(p) ?? []).length;
  }
  const per100 = (facts / words) * 100;
  // 每 100 词 4 个事实点算满分
  const score = Math.max(0, Math.min(100, Math.round((per100 / 4) * 100)));
  return { score, facts, words };
}

export function citationCoverage(html: string, hasJsonLd: boolean): number {
  let s = 0;
  if (/(technical manual|Handbuch|manual técnico|用户手册|技术手册)/i.test(html)) s += 30;
  if (/(test report|Prüfbericht|informes? de ensayo|检测报告)/i.test(html)) s += 30;
  if (hasJsonLd) s += 40;
  return s;
}

export function entityConsistency(
  pages: Array<{ locale: string; html: string }>,
  brandName: string,
  sku: string,
): { score: number; notes: string[] } {
  const notes: string[] = [];
  let hits = 0;
  for (const p of pages) {
    const t = extractText(p.html);
    const hasBrand = t.includes(brandName);
    const hasSku = t.includes(sku);
    if (hasBrand) hits++;
    else notes.push(`${p.locale} 缺少品牌名 ${brandName}`);
    if (!hasSku) notes.push(`${p.locale} 未出现统一型号 ${sku}`);
  }
  const base = pages.length ? Math.round((hits / pages.length) * 100) : 0;
  // 型号写法不一致扣分
  const ipVariants = new Set<string>();
  for (const p of pages) {
    const m = extractText(p.html).match(/IP\s?65/g);
    if (m) ipVariants.add(m[0].replace(/\s/g, '').length > 4 ? 'IP 65' : 'IP65');
  }
  let score = base;
  if (ipVariants.size > 1) {
    score -= 100 / Math.max(pages.length, 1) / 2;
    notes.push('参数写法不统一（IP65 / IP 65 混用）');
  }
  return { score: Math.max(0, Math.round(score)), notes };
}

export function crawlability(html: string): { score: number; notes: string[] } {
  const notes: string[] = [];
  let s = 0;
  const title = /<title>([^<]{10,70})<\/title>/i.exec(html);
  const desc = /<meta\s+name="description"\s+content="([^"]{50,})"/i.exec(html);
  const h1 = (html.match(/<h1[^>]*>/gi) ?? []).length;
  const jsonld = (html.match(/application\/ld\+json/gi) ?? []).length;
  const alt = (html.match(/<img[^>]+alt="[^"]+"/gi) ?? []).length;
  const imgs = (html.match(/<img/gi) ?? []).length;
  const canonical = /rel="canonical"/i.test(html);

  if (title) s += 20; else notes.push('缺少或过短的 title');
  if (desc) s += 20; else notes.push('缺少 meta description');
  if (h1 === 1) s += 15; else notes.push(`h1 数量为 ${h1}（应为 1）`);
  if (jsonld >= 1) s += 20; else notes.push('缺少 JSON-LD 结构化数据');
  if (jsonld >= 2) s += 10;
  if (imgs === 0 || alt / Math.max(imgs, 1) > 0.8) s += 10; else notes.push('存在缺少 alt 的图片');
  if (canonical) s += 5;
  return { score: Math.min(100, s), notes };
}

export function computeReadiness(params: {
  mainHtml: string;
  allPages: Array<{ locale: string; html: string }>;
  brandName: string;
  sku: string;
}): Readiness & { details: Record<string, string[]> } {
  const fd = factDensity(params.mainHtml);
  const hasJsonLd = /application\/ld\+json/i.test(params.mainHtml);
  const cc = citationCoverage(params.mainHtml, hasJsonLd);
  const ec = entityConsistency(params.allPages, params.brandName, params.sku);
  const cr = crawlability(params.mainHtml);

  return {
    factDensity: fd.score,
    citationCoverage: cc,
    entityConsistency: ec.score,
    crawlability: cr.score,
    pass: fd.score >= 60 && cc >= 70 && ec.score >= 80 && cr.score >= 75,
    details: {
      factDensity: [`${fd.facts} 个事实点 / ${fd.words} 词`],
      citationCoverage: [hasJsonLd ? '包含 JSON-LD；这只是结构化信息，不代表外部证据已核验' : '缺少 JSON-LD；不能据此推断真实证据数量'],
      entityConsistency: ec.notes,
      crawlability: cr.notes,
    },
  };
}

/** 语义质检：LLM 判官；stub 模式下用规则近似，保证流程可跑 */
export async function semanticJudge(params: {
  html: string;
  topic: string;
  rules: string[];
}): Promise<{ score: number | null; issues: string[]; judge: string }> {
  const llm = getLLM();
  const text = extractText(params.html).slice(0, 6000);
  const prompt = `你是出海营销内容的语义质检判官。评估以下内容，只输出 JSON：
{"score": 0-100, "issues": ["问题1"]}
评分维度：是否偏离选题「${params.topic}」、是否夸大、是否与已加载的规则冲突。
规则清单：${params.rules.slice(0, 10).join(' | ')}

内容：
${text}`;

  if (llm.name.startsWith('stub')) {
    // stub 模式：用可解释的启发式近似，避免假装是 LLM 判断
    const issues: string[] = [];
    let score = 95;
    const t = extractText(params.html);
    if (t.length < 1200) { issues.push('正文偏短，事实铺陈不足'); score -= 10; }
    if (!/FAQ|Preguntas|Häufige/i.test(t)) { issues.push('缺少 FAQ 段落，不利于被结构化抽取'); score -= 8; }
    if (t.split('\n').some((l) => l.length > 600)) { issues.push('存在超长段落，可读性差'); score -= 4; }
    return { score, issues, judge: 'stub-heuristic' };
  }

  try {
    const raw = await llm.chat(
      [
        { role: 'system', content: '你只输出 JSON，不要任何解释。' },
        { role: 'user', content: prompt },
      ],
      { jsonMode: true, temperature: 0.2 },
    );
    const parsed = JSON.parse(raw) as { score?: number; issues?: string[] };
    return {
      score: typeof parsed.score === 'number' && Number.isFinite(parsed.score) ? Math.max(0, Math.min(100, Math.round(parsed.score))) : null,
      issues: parsed.issues ?? [],
      judge: llm.name,
    };
  } catch (e) {
    return { score: null, issues: [`判官调用失败：${(e as Error).message}`], judge: 'unavailable' };
  }
}