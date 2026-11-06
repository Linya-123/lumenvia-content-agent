import type { LintViolation, Market } from './types';

/**
 * 确定性规则筛查：可解释、可单元测试；规则检查不等于完整法律合规审核。
 * 与 LLM 判官分工明确 —— 这里只判"能编程判定的事"。
 */

type Rule = {
  ruleId: string;
  markets: Market[] | 'all';
  type: string;
  /** 命中即违规的正则 */
  pattern: RegExp;
  /** 若违规词所在段落内出现这些依据词，则视为"已给出依据"，豁免 */
  excusedBy?: RegExp;
  message: string;
};

export const RULES: Rule[] = [
  {
    ruleId: 'FTC-SUPERLATIVE',
    markets: ['US', 'EU'],
    type: '绝对化最高级',
    pattern: /\b(?:best|number one|guaranteed|the most advanced|unbeatable)\b|#1|100\s*%/gi,
    message: 'FTC 广告指南：禁用无依据最高级表述',
  },
  {
    ruleId: 'DE-UWG-5',
    markets: ['DE', 'EU'],
    type: '无依据环境宣称',
    // 德语有词形变化（umweltfreundlich / umweltfreundlichste / umweltfreundlicher），
    // 不能用 \b 全词匹配，改为词干 + 允许词尾
    pattern: /umweltfreundlich\w*|klimaneutral\w*|nachhaltig\w*|100\s*%\s*ökologisch/gi,
    // 豁免词必须带词边界：否则 "nachhaltig" 里的 "nach" 会被误判成"依据"
    message: '德国 UWG §5：环境宣称须有具体依据',
  },
  {
    ruleId: 'ES-LEY3-1991',
    markets: ['ES', 'EU'],
    type: '绝对化宣称',
    pattern: /\b(el mejor|n[uú]mero uno|100\s*%|garantizado|insuperable)\b/gi,
    message: '西班牙 Ley 3/1991：广告不得含无依据的绝对化表述',
  },
  {
    ruleId: 'INVALID-EU-LIGHTING-REG',
    markets: 'all',
    type: '错误的照明法规引用',
    pattern: /2023\/1670/gi,
    message: '2023/1670 不适用照明标签，应检查 EU 2019/2015 及产品适用范围',
  },
  {
    ruleId: 'UNVERIFIED-CERT-CLAIM',
    markets: 'all',
    type: '未经核验的认证表述',
    pattern: /\b(?:CE|FCC|RoHS|TÜV)[\s-]*(?:certified|approved|verified)\b|\b(?:CE|FCC)[\s-]*zertifiziert\b|\bcertificad[oa]\s+(?:CE|FCC)\b/gi,
    message: '演示产品未提供可核验证书，不能直接发布已获认证的肯定性表述',
  },
  {
    ruleId: 'GLOBAL-MEDICAL',
    markets: 'all',
    type: '医疗功效宣称',
    pattern: /\b(cure|treats?|heals?|medical grade|治疗|治愈)\b/gi,
    message: '非医疗产品禁止使用医疗功效宣称',
  },
];

export type LintInput = {
  locale: string;
  market: Market;
  bodyText: string;
  html: string;
};

export function lintPage(input: LintInput): LintViolation[] {
  const { locale, market, bodyText } = input;
  const out: LintViolation[] = [];
  const paragraphs = bodyText.split('\n');

  for (const r of RULES) {
    if (r.markets !== 'all' && !r.markets.includes(market)) continue;
    // EU is a multi-locale bundle, not permission to apply every country's language regex to every page.
    if (r.ruleId === 'FTC-SUPERLATIVE' && locale !== 'en') continue;
    if (r.ruleId === 'DE-UWG-5' && locale !== 'de') continue;
    if (r.ruleId === 'ES-LEY3-1991' && locale !== 'es') continue;
    if (r.pattern.source === '(?!)') continue;
    const re = new RegExp(r.pattern.source, r.pattern.flags);
    let m: RegExpExecArray | null;
    while ((m = re.exec(bodyText)) !== null) {
      if (r.ruleId === 'UNVERIFIED-CERT-CLAIM') {
        const left = bodyText.slice(Math.max(0, m.index - 48), m.index);
        if (/(?:\bnot|\bnever|\bnicht|\bno(?:\s+ha\s+sido)?|\bnon|未经|并未|尚未)\s+$/i.test(left)) continue;
      }
      // 豁免必须"同段有依据"，不能全文出现一次依据就全段落都算合规
      if (r.excusedBy) {
        const upto = bodyText.slice(0, m.index);
        const paraIdx = upto.split('\n').length - 1;
        const para = paragraphs[paraIdx] ?? '';
        if (r.excusedBy.test(para)) continue;
      }
      out.push({
        ruleId: r.ruleId, locale, type: r.type, matched: m[0],
        location: `正文第 ${locateParagraph(bodyText, m.index)} 段`,
        message: r.message,
      });
      break; // 同类只报第一处，避免噪声
    }
  }


  return out;
}

function locateParagraph(text: string, index: number): number {
  return text.slice(0, index).split('\n').filter((s) => s.trim()).length + 1;
}

/** 从 HTML 抽正文（简易实现，够用即可） */
export function extractText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    // 块级标签 → 换行（保持段落边界，供"同段有依据"豁免判断使用）
    .replace(/<\/(p|div|section|li|tr|h[1-6]|td|th|header|footer|table|ul|ol|form)>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    // 其余行内标签 → 空格，不能换行，否则同一句话会被切碎
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{2,}/g, '\n')
    .trim();
}