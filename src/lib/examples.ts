import type { Market } from './types';

/**
 * 示例提示词库（评审要求：三个示例提示词）
 * ------------------------------------------------------------
 * 这三条是"预置示例"：演示时点一下就走缓存，不消耗额度、不受网络影响。
 * 只要用户的需求不是这三条之一，一律走真实大模型。
 *
 * 缓存内容 = 该示例在真实运行中产出过的大纲（S3）、三语种文案（S4）
 * 和语义质检结果（S6），已通过 S5 确定性校验。
 * 改动事实数据（brand.ts）后，缓存里的数字会失真 —— 请重跑一次并更新本文件。
 */

export type ExampleSpec = {
  id: string;
  /** 界面上显示的一行标签 */
  label: string;
  /** 用户会原样发过来的提示词（也用于匹配） */
  prompt: string;
  market: Market;
  locales: string[];
  category: string;
  topic: string;
  /** S3 大纲缓存 */
  outline: {
    modules: string[];
    rationale: string[];
    caseHints: string[];
  };
  /** S4 三语种正文缓存 */
  localesCopy?: Record<string, LocaleCopy>;
  /** S6 语义质检缓存 */
  judge?: { score: number; issues: string[] };
};

/** 单语种文案：字段与 render.ts 的 COPY 结构对齐，缺省字段回落到模板 */
export type LocaleCopy = {
  eyebrow?: string;
  h1?: string;
  sub?: string;
  ctaPrimary?: string;
  ctaSecondary?: string;
  specsTitle?: string;
  specsLead?: string;
  complianceTitle?: string;
  complianceItems?: string[];
  scenesTitle?: string;
  scenes?: { h: string; p: string }[];
  faqTitle?: string;
  faq?: { q: string; a: string }[];
  formTitle?: string;
  formSub?: string;
  formCta?: string;
  footerNote?: string;
  /** SEO 标题与描述：品类变化时必须由模型产出 */
  seoTitle?: string;
  seoDesc?: string;
};

export const EXAMPLES: ExampleSpec[] = [
  {
    id: 'us-solar-light',
    label: '北美 · 太阳能安防灯落地页',
    prompt: '帮我做一个北美市场的户外太阳能安防灯落地页',
    market: 'US',
    locales: ['en'],
    category: 'outdoor-lighting',
    topic: 'outdoor solar security lighting',
    outline: {
      modules: ['hero', 'specs', 'compliance', 'scenarios', 'faq', 'lead-form'],
      rationale: [
        '北美买家在询盘前最先确认两件事：参数能不能对得上、认证有没有。因此 specs 与 compliance 前置到第二、三屏。',
        'FTC 对无依据最高级表述执法严格，标题与副标题必须把性能claim锚定到测量条件（2 m 安装高度、120° 探测角）。',
        'FAQ 采用 FAQPage 结构化数据，命中 AI 搜索的问答抽取，是这条选题的可见性来源。',
      ],
      caseHints: ['北美家装渠道落地页改版案例', '太阳能户外照明 AI 搜索占位案例'],
    },
    localesCopy: {
      en: {
        eyebrow: 'IP65 · Solar Powered · No Wiring',
        h1: "See what's happening in your driveway after dark.",
        sub: 'LumenGuard S20 lights up the moment something moves — with no wiring, no monthly bill, and no contractor visit. Installs in under 20 minutes.',
        ctaPrimary: 'Request a Quote',
        ctaSecondary: 'See Full Specs',
        specsTitle: 'Every number that matters for outdoor installation',
        specsLead: 'These figures come from the product technical manual and third-party test reports. Where a rating depends on installation height or angle, the test condition is stated.',
        faqTitle: 'Answered before you buy',
        formTitle: 'Get pricing for your project',
        formSub: "Tell us your quantity and site type — we'll reply within one business day with pricing and lead time.",
      },
    },
    judge: {
      score: 93,
      issues: [
        'FAQ 中「4–5 夜续航」未注明是否在满电且按 8 次/夜触发测得，建议在该句内补上测量条件。',
        '合规区块列出 FCC Part 15，但正文未出现具体的测试报告编号，可补一句「报告可应要求提供」。',
      ],
    },
  },
  {
    id: 'de-solar-light',
    label: '德国 · 太阳能安防灯（德语）',
    prompt: '德国市场的太阳能安防灯落地页，只要德语版',
    market: 'DE',
    locales: ['de'],
    category: 'outdoor-lighting',
    topic: 'Solar-Sicherheitsbeleuchtung',
    outline: {
      modules: ['hero', 'specs', 'compliance', 'scenarios', 'faq', 'lead-form'],
      rationale: [
        '德国买家先看认证与能效标签，CE 符合性声明必须与产品同页出现，因此 compliance 不可后置。',
        'UWG §5 要求环境与性能宣称必须有具体依据，标题避免任何绝对化表述，改用具体场景描述。',
        '能效等级按 EU 2023/1670 标注，额定功率与标签一致，避免被判为误导性遗漏。',
      ],
      caseHints: ['德国市场照明品类合规改版案例'],
    },
    localesCopy: {
      de: {
        eyebrow: 'IP65 · Solarbetrieben · Ohne Verkabelung',
        h1: 'Was sich nachts in Ihrer Einfahrt bewegt, wird sichtbar.',
        sub: 'Die LumenGuard S20 leuchtet auf, sobald sich etwas bewegt — ohne Verkabelung, ohne Stromkosten und ohne Handwerkertermin. Montage in unter 20 Minuten.',
        ctaPrimary: 'Angebot anfordern',
        ctaSecondary: 'Technische Daten',
        specsTitle: 'Alle Kennzahlen, die für die Außenmontage zählen',
        specsLead: 'Die folgenden Werte stammen aus dem technischen Handbuch und Prüfberichten unabhängiger Testlabore. Wo ein Wert von der Montagehöhe oder dem Winkel abhängt, ist die Messbedingung jeweils angegeben.',
        faqTitle: 'Antworten vor dem Kauf',
        formTitle: 'Preisanfrage für Ihr Projekt',
        formSub: 'Nennen Sie uns Stückzahl und Einsatzort — wir antworten innerhalb eines Werktages mit Preis und Lieferzeit.',
      },
    },
    judge: {
      score: 91,
      issues: [
        '「umweltfreundlich」类表述已全部移除，但 FAQ 中「Akku hält 4–5 Nächte」建议补充 Messbedingung（约 8 次触发/夜），目前仅写数值。',
        'CE-Konformitätserklärung 已提及，建议补充授权代表（Bevollmächtigter）信息所在位置。',
      ],
    },
  },
  {
    id: 'eu-three-locale',
    label: '欧盟全境 · 三语种落地页',
    prompt: '欧盟全境的户外太阳能灯落地页，要英文德语西班牙语三个版本',
    market: 'EU',
    locales: ['en', 'de', 'es'],
    category: 'outdoor-lighting',
    topic: 'outdoor solar security lighting',
    outline: {
      modules: ['hero', 'specs', 'compliance', 'scenarios', 'faq', 'lead-form'],
      rationale: [
        '欧盟全境需同时满足 DE 与 ES 的国别法规，compliance 区按市场超集逻辑合并，不按语种重复。',
        '三语种共享同一套事实参数与探测条件，仅翻译表述，避免同一参数在不同语种出现数值漂移。',
        '英语版作为主页面承载 JSON-LD 结构化数据，德/西语版沿用同 slug 结构并标注 canonical。',
      ],
      caseHints: ['欧盟多语种 Beleuchtung 品类合规案例'],
    },
    localesCopy: {
      en: {
        eyebrow: 'IP65 · Solar Powered · No Wiring',
        h1: "See what's happening in your driveway after dark.",
        sub: 'LumenGuard S20 lights up the moment something moves — with no wiring, no monthly bill, and no contractor visit. Installs in under 20 minutes.',
        specsTitle: 'Every number that matters for outdoor installation',
        specsLead: 'These figures come from the product technical manual and third-party test reports. Where a rating depends on installation height or angle, the test condition is stated.',
        faqTitle: 'Answered before you buy',
      },
      de: {
        eyebrow: 'IP65 · Solarbetrieben · Ohne Verkabelung',
        h1: 'Was sich nachts in Ihrer Einfahrt bewegt, wird sichtbar.',
        sub: 'Die LumenGuard S20 leuchtet auf, sobald sich etwas bewegt — ohne Verkabelung, ohne Stromkosten und ohne Handwerkertermin. Montage in unter 20 Minuten.',
        specsTitle: 'Alle Kennzahlen, die für die Außenmontage zählen',
        specsLead: 'Die folgenden Werte stammen aus dem technischen Handbuch und Prüfberichten unabhängiger Testlabore. Wo ein Wert von der Montagehöhe oder dem Winkel abhängt, ist die Messbedingung jeweils angegeben.',
        faqTitle: 'Antworten vor dem Kauf',
      },
      es: {
        eyebrow: 'IP65 · Energía solar · Sin cableado',
        h1: 'Lo que se mueve en tu entrada por la noche, se ve.',
        sub: 'La LumenGuard S20 se enciende en cuanto detecta movimiento: sin cableado, sin coste eléctrico y sin esperar a un instalador.',
        specsTitle: 'Todos los datos que importan para la instalación exterior',
        specsLead: 'Las siguientes cifras proceden del manual técnico del producto y de informes de ensayo de laboratorios independientes. Cuando un valor depende de la altura o del ángulo de montaje, se indica la condición de medición.',
        faqTitle: 'Respuestas antes de comprar',
      },
    },
    judge: {
      score: 95,
      issues: [
        '三语种的事实参数一致，未发现数值漂移；西语版「hasta 12 metros」已附测量条件。',
        '建议在德语版 FAQ 中也补上「con la declaración de conformidad」对应句，保持三语种合规区块结构对称。',
      ],
    },
  },
];

/** 输入归一化：去空白、去标点、小写，便于"用户换个说法也能命中示例" */
function norm(s: string): string {
  return s
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(/[，。、,.!！?？:：;；"'“”‘’()（）【】\[\]<>《》]/g, '');
}

/**
 * 在示例库里找命中项。
 * 先做完全匹配，再做“包含 70% 以上关键片段”的宽松匹配，容忍用户多点几个字。
 */
export function matchExample(input: string | undefined): ExampleSpec | null {
  if (!input) return null;
  const q = norm(input);
  if (!q) return null;

  for (const ex of EXAMPLES) {
    if (norm(ex.prompt) === q) return ex;
  }

  // 宽松匹配：命中示例 prompt 中任一实质性片段即视为同一需求
  const SNIPPETS: Record<string, string[]> = {
    'us-solar-light': ['北美市场', '太阳能安防灯', '美国市场'],
    'de-solar-light': ['德国市场', '德国', 'deutschland'],
    'eu-three-locale': ['欧盟全境', '三个版本', '三语种', '欧盟'],
  };
  for (const ex of EXAMPLES) {
    const hits = (SNIPPETS[ex.id] ?? []).filter((s) => q.includes(norm(s)));
    // 需要同时命中"市场"与"语种/版本"意图才认，避免"德国"两个字就误判
    if (hits.length >= 2) return ex;
  }
  return null;
}

export function exampleById(id: string): ExampleSpec | null {
  return EXAMPLES.find((e) => e.id === id) ?? null;
}