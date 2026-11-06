import type { EvidenceDocument } from './evidence';

export type ClaimIssue = {
  locale: string;
  ruleId: string;
  matched: string;
  severity: 'block' | 'review';
  reason: string;
  candidateEvidenceIds: string[];
};
export type ClaimAuditResult = {
  issues: ClaimIssue[];
  evidenceCount: number;
  unreviewedCount: number;
  publicationReady: false;
  note: string;
};

type Pattern = { ruleId: string; pattern: RegExp; kind: 'declaration' | 'test_report' | 'other'; reason: string };
const HIGH_RISK: Pattern[] = [
  {
    ruleId: 'CERTIFICATION-ASSERTION',
    pattern: /\b(?:CE|FCC|RoHS|TÜV)\s*[-–]?\s*(?:certified|approved|verified|compliant)\b|\b(?:CE|FCC)\s*[-–]?\s*(?:zertifiziert|konform|geprüft)\b|\bcertificad[oa]\s+(?:CE|FCC)\b|\b(?:CE|FCC)\s+(?:certificado|verificado)\b|\bcertified\s+(?:CE|FCC)\b/gi,
    kind: 'declaration',
    reason: '认证或合规肯定声明缺少经过独立核验的对应产品文件',
  },
  {
    ruleId: 'CERTIFICATE-AVAILABILITY-CLAIM',
    pattern: /\b(?:has|holds|obtained|achieved|received)\s+(?:an?\s+)?(?:CE|FCC|RoHS|TÜV)\s+(?:certificate|certification|approval)\b|\b(?:CE|FCC|RoHS|TÜV)\s+(?:certificate|certification|approval)\s+(?:included|provided|available|issued)\b|\bFCC\s+Part\s*15\s*[-–]?\s*(?:certified|verified|approved)\b|\bEU\s+Declaration\s+of\s+Conformity\s+(?:is\s+)?(?:supplied|included|available|provided)\b/gi,
    kind: 'declaration',
    reason: '宣称持有证书或随产品提供符合性文件，但未能确认针对该产品的真实文件',
  },
  {
    ruleId: 'EU-CERTIFICATE-AVAILABILITY',
    pattern: /\b(?:CE|FCC|RoHS|TÜV)\s+(?:certificate|certification|approval)\s+(?:is\s+)?(?:included|provided|available|issued|supplied)\b|\b(?:CE|FCC)\s*[-–]?\s*Konformitätserklärung\s+(?:liegt\s+bei|wird\s+mitgeliefert|ist\s+vorhanden)\b/gi,
    kind: 'declaration',
    reason: '肯定声称认证文件已经提供，必须核查与相应产品型号匹配的有效文件',
  },
  {
    ruleId: 'SPANISH-CERTIFICATION-ASSERTION',
    pattern: /\b(?:cuenta\s+con|dispone\s+de|tiene|con)\s+(?:la\s+)?(?:certificación|certificado|marcado)\s+(?:CE|FCC|RoHS)\b|\b(?:certificación|certificado|marcado)\s+(?:CE|FCC|RoHS)\s+(?:verificad[oa]|aprobado|obtenido|incluido|disponible)\b/gi,
    kind: 'declaration',
    reason: '西语认证或认证文件的肯定表述缺少独立核验',
  },
  {
    ruleId: 'CHINESE-CERTIFICATION-ASSERTION',
    pattern: /(?:已|已经)?(?:通过|获得|取得|具备)\s*(?:CE|FCC|RoHS)\s*(?:认证|证书|批准)|(?:CE|FCC|RoHS)\s*(?:认证|证书)\s*(?:已获批|已取得|齐全|有效|随附|已通过)/gi,
    kind: 'declaration',
    reason: '中文认证或证书的肯定声明未经独立核验',
  },
  {
    ruleId: 'LAB-REPORT-ASSERTION',
    pattern: /\b(?:independent|third[- ]party)\s+(?:lab(?:oratory)?|test)\s+reports?\s+(?:confirms?|verif(?:y|ies)|proves?|shows?)\b|\b(?:verified|confirmed)\s+by\s+(?:independent|third[- ]party)\s+(?:laborator(?:y|ies)|tests?)\b/gi,
    kind: 'test_report',
    reason: '宣称第三方检验证实时，需要经核验的对应检测报告',
  },
  {
    ruleId: 'WRONG-LIGHTING-LAW',
    pattern: /\b2023\/1670\b/gi,
    kind: 'other',
    reason: 'EU 2023/1670 并非照明能效标签法规，禁止作为照明合规依据',
  },
];

function plainText(html: string): string {
  // Marketing claims can also appear in HTML meta description or Open Graph tags.
  // Capture attribute content as plain text (do not parse it as markup/code).
  const metaDescriptions = [...html.matchAll(/<meta\b[^>]*>/gi)]
    .map((m) => m[0])
    .filter((tag) => /\b(?:name|property)\s*=\s*(["'])(?:description|og:description|twitter:description)\1/i.test(tag))
    .map((tag) => /\bcontent\s*=\s*(?:"([^"]*)"|'([^']*)')/i.exec(tag))
    .map((m) => m?.[1] ?? m?.[2] ?? '')
    .filter(Boolean);
  // Preserve JSON-LD text content for review; do not treat CSS/JS source as claims.
  return (html
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script\b(?![^>]*type=["']application\/ld\+json["'])[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/[ \t\r\n]+/g, ' ')) + ' ' + metaDescriptions.join(' ');
}

/** Do not mistake an explicitly negated statement for a positive certification claim. */
function isNegated(text: string, start: number): boolean {
  const before = text.slice(Math.max(0, start - 48), start);
  // Chinese negation has no mandatory whitespace; English/Spanish/German do.
  return /(?:未|尚未|没有|未能|未经|并未)\s*$/.test(before)
    || /(?:\bnot|\bnever|\bwithout|\bnicht|\bno(?:\s+ha\s+sido)?|\bnon|\bsin)\s+(?:(?:yet|been|independently|fully|actually)\s+){0,3}$/i.test(before);
}

/** A candidate document is a *lead for manual review*, not proof. */
export function auditGeneratedPages(
  pages: Array<{ locale: string; html: string }>,
  evidence: EvidenceDocument[] = [],
): ClaimAuditResult {
  const issues: ClaimIssue[] = [];
  for (const page of pages) {
    const text = plainText(page.html);
    for (const rule of HIGH_RISK) {
      const re = new RegExp(rule.pattern.source, rule.pattern.flags);
      let m: RegExpExecArray | null;
      let count = 0;
      while ((m = re.exec(text)) !== null && count < 5) {
        if (rule.ruleId !== 'WRONG-LIGHTING-LAW' && isNegated(text, m.index)) continue;
        const candidateEvidenceIds = evidence
          .filter((doc) => rule.kind === 'other' || doc.kind === rule.kind)
          .map((doc) => doc.id);
        issues.push({
          locale: page.locale, ruleId: rule.ruleId, matched: m[0],
          severity: rule.ruleId === 'WRONG-LIGHTING-LAW' ? 'block' : 'review',
          reason: rule.reason, candidateEvidenceIds,
        });
        count++;
      }
    }
  }
  return {
    issues,
    evidenceCount: evidence.length,
    unreviewedCount: evidence.length,
    publicationReady: false,
    note: '此结果仅表示自动筛查；上传文件未核验真实性、适用型号或法律效力。演示内容不可直接视为可商用合规成品。',
  };
}

const REPAIR_PATTERNS = HIGH_RISK.map((rule) => rule.pattern);

/**
 * Conservative local repair on *copy fields*, never on raw HTML, JSON-LD or CSS.
 * The replacement explicitly avoids suggesting that supporting evidence exists.
 */
export function redactUnsubstantiatedCopy<T>(copy: T, locale: string): { copy: T; redactions: number } {
  let redactions = 0;
  const safe = locale === 'de'
    ? 'Zertifizierungsangaben müssen vor der Veröffentlichung unabhängig geprüft werden.'
    : locale === 'es'
      ? 'Las afirmaciones de certificación requieren verificación independiente antes de su publicación.'
      : 'Certification claims require independent verification before publication.';

  // Replacing a few words inside an existing sentence can produce nonsensical
  // claims ("This product is Certification status ..."). Replace the complete
  // sentence instead; preserve all unrelated sentences and structured fields.
  function repairSentence(sentence: string): string {
    const candidates = REPAIR_PATTERNS.flatMap((pattern) =>
      [...sentence.matchAll(new RegExp(pattern.source, pattern.flags))]
    ).filter((m) => !isNegated(sentence, m.index ?? 0));
    if (!candidates.length) return sentence;
    redactions += candidates.length;
    return safe;
  }
  function walk(item: unknown): unknown {
    if (typeof item === 'string') {
      return item.split(/(?<=[.!?。！？])\s+/).map(repairSentence).join(' ');
    }
    if (Array.isArray(item)) return item.map(walk);
    if (item && typeof item === 'object') return Object.fromEntries(
      Object.entries(item).map(([key, val]) => [key, walk(val)]),
    );
    return item;
  }
  return { copy: walk(copy) as T, redactions };
}
