import type { LintViolation, Market } from './types';

/**
 * 确定性校验：零误判、可解释、可单元测试。
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
    pattern: /\b(best|#1|number one|100%|guaranteed|the most advanced|unbeatable)\b/gi,
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
    excusedBy: /(\bgemäß\b|\bnach\s+(?:ISO|EN|TÜV|DIN)\b|\bTÜV\b|\bPrüfbericht\b|\bZertifikat\w*\b|\bgeprüft\b)/i,
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
    ruleId: 'EU-ENERGY-LABEL',
    markets: ['EU', 'DE', 'ES'],
    type: '能效标识缺失',
    // 由结构检查处理，正则仅兜底检测是否引用了能效等级
    pattern: /(?!)/,
    message: 'EU 2023/1670：照明类页面须标注能效等级与额定功率',
  },
  {
    ruleId: 'CE-DECLARATION',
    markets: ['EU', 'DE', 'ES'],
    type: 'CE 符合性声明缺失',
    pattern: /(?!)/,
    message: 'CE 标识须附符合性声明与授权代表信息',
  },
  {
    ruleId: 'FCC-PART15',
    markets: ['US'],
    type: 'FCC 认证声明缺失',
    pattern: /(?!)/,
    message: '北美市场须声明 FCC Part 15 合规',
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

/** 判断页面是否包含某类结构性声明 */
const STRUCTURAL_CHECKS: Array<{
  ruleId: string;
  markets: Market[];
  type: string;
  test: (html: string, body: string) => boolean;
  message: string;
}> = [
  {
    ruleId: 'EU-ENERGY-LABEL', markets: ['EU', 'DE', 'ES'], type: '能效标识缺失',
    test: (h) => /(2023\/1670|Energieeffizienzklasse|clase energética|energy class|能效等级)/i.test(h),
    message: 'EU 2023/1670：照明类页面须标注能效等级与额定功率',
  },
  {
    ruleId: 'CE-DECLARATION', markets: ['EU', 'DE', 'ES'], type: 'CE 符合性声明缺失',
    test: (h) => /\bCE\b/.test(h) && /(Konformitätserklärung|declaración de conformidad|Declaration of Conformity)/i.test(h),
    message: 'CE 标识须附符合性声明与授权代表信息',
  },
  {
    ruleId: 'FCC-PART15', markets: ['US'], type: 'FCC 认证声明缺失',
    test: (h) => /FCC/i.test(h),
    message: '北美市场须声明 FCC Part 15 合规',
  },
];

export function lintPage(input: LintInput): LintViolation[] {
  const { locale, market, bodyText, html } = input;
  const out: LintViolation[] = [];
  const paragraphs = bodyText.split('\n');

  for (const r of RULES) {
    if (r.markets !== 'all' && !r.markets.includes(market)) continue;
    if (r.pattern.source === '(?!)') continue;
    const re = new RegExp(r.pattern.source, r.pattern.flags);
    let m: RegExpExecArray | null;
    while ((m = re.exec(bodyText)) !== null) {
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

  for (const sc of STRUCTURAL_CHECKS) {
    if (!sc.markets.includes(market)) continue;
    if (!sc.test(html, bodyText)) {
      out.push({
        ruleId: sc.ruleId, locale, type: sc.type, matched: '(缺失)',
        location: '页面结构', message: sc.message,
      });
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