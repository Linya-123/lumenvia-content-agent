import type { AdFact } from './pipeline';

/**
 * V8: conservative measurable-claim gate for rendered marketing text.
 * This is a consistency check against SUPPLIED product facts, not a claim of independent
 * verification, scientific validity, legal compliance, or complete factual coverage.
 * Do not accept user-uploaded text as verified merely because it is present.
 */
export type ProductMetricIssue = {
  field: string;
  unsupported: string[];
  action: 'withheld';
};

const NUMBER = String.raw`[-−]?\d+(?:[.,]\d+)?(?:\s*(?:[–—-]|to|or|bis|oder|a|o)\s*[-−]?\d+(?:[.,]\d+)?)?`;
const UNIT = String.raw`mAh|kWh|Wh|lm|lumens?|watts?|W|°\s?C|℃|%|°|degrees?|grad(?:os)?|m(?:et(?:er|re)s?)?|mm|cm|min(?:utes?)?|minutes?|Minuten?|minutos?|hours?|Stunden?|horas?|nights?|Nächte|noches|cycles?|Zyklen|ciclos|activations?|Auslösungen|activaciones|K`;
const METRICS = new RegExp(String.raw`\bIP\s?\d{2}\b|(?<![\p{L}\p{N}])(${NUMBER})\s*[-‑]?\s*(${UNIT})(?![\p{L}])`, 'giu');

function canonicalUnit(unit: string): string {
  const t = unit.toLowerCase().replace(/\s+/g, '');
  if (/^(meter|metre|meters|metres|m)$/.test(t)) return 'm';
  if (/^(min|mins|minute|minutes|minuten|minuto|minutos)$/.test(t)) return 'min';
  if (/^(hour|hours|stunde|stunden|hora|horas)$/.test(t)) return 'hours';
  if (/^(night|nights|nächte|noche|noches)$/.test(t)) return 'nights';
  if (/^(degree|degrees|grad|grado|grados|°)$/.test(t)) return 'deg';
  if (/^(cycle|cycles|zyklen|ciclo|ciclos)$/.test(t)) return 'cycles';
  if (/^(activation|activations|auslösungen|activaciones)$/.test(t)) return 'activations';
  if (/^(w|watt|watts)$/.test(t)) return 'w';
  if (/^°c$|^℃$/.test(t)) return 'c';
  return t;
}
function canonicalNumber(s: string): string {
  return s.replace(/−/g, '-')
    .replace(/\b(to|or|bis|oder|a|o)\b/gi, '-')
    .replace(/\s+/g, '')
    .replace(/[–—]/g, '-')
    .replace(/(?<=\d)[.,](?=\d{3}(?:\D|$))/g, '')
    .replace(/,(?=\d)/g, '.');
}
export function extractMeasurableClaims(text: string): Array<{ raw: string; key: string }> {
  const result: Array<{ raw: string; key: string }> = [];
  for (const m of text.matchAll(METRICS)) {
    const raw = m[0];
    let key: string;
    if (/^IP\s?\d{2}$/i.test(raw)) key = raw.toUpperCase().replace(/\s/g, '');
    else key = canonicalNumber(m[1]) + ':' + canonicalUnit(m[2]);
    result.push({raw, key});
  }
  return result;
}

export function unsupportedMetrics(text: string, facts: AdFact[]): string[] {
  const known = new Set(facts.flatMap(f => extractMeasurableClaims(f.value).map(x => x.key)));
  // Source ranges support either endpoint as an abbreviation in a short sentence.
  for (const value of [...known]) {
    const range = /^(-?\d+(?:\.\d+)?)-(-?\d+(?:\.\d+)?):(.+)$/.exec(value);
    if (range) { known.add(`${range[1]}:${range[3]}`); known.add(`${range[2]}:${range[3]}`); }
  }
  return [...new Set(extractMeasurableClaims(text).filter(x => !known.has(x.key)).map(x => x.raw))];
}

const WITHHELD: Record<string, string> = {
  en: 'Additional measurable product claims have been withheld pending supporting product evidence.',
  de: 'Zusätzliche messbare Produktaussagen wurden bis zum Vorliegen geeigneter Nachweise zurückgehalten.',
  es: 'Se han omitido afirmaciones cuantificables adicionales hasta contar con pruebas del producto.',
};

/** Check EVERY user-visible template/model copy field, incl. FAQ JSON-LD source. */
export function guardPageCopy<T extends object>(
  source: T, facts: AdFact[], locale: string,
): { copy: T; issues: ProductMetricIssue[] } {
  const issues: ProductMetricIssue[] = [];
  const descend = (value: unknown, field: string): unknown => {
    if (typeof value === 'string') {
      const unsupported = unsupportedMetrics(value, facts);
      if (!unsupported.length) return value;
      issues.push({ field, unsupported, action: 'withheld' });
      return WITHHELD[locale] ?? WITHHELD.en;
    }
    if (Array.isArray(value)) return value.map((v, i) => descend(v, `${field}[${i}]`));
    if (value && typeof value === 'object') {
      return Object.fromEntries(Object.entries(value)
        .map(([k, v]) => [k, descend(v, field ? `${field}.${k}` : k)]));
    }
    return value;
  };
  return {copy:descend(source,'') as T,issues};
}

/** Detect unsupported measurable claims in user-visible HTML (skips JS/CSS). */
function visibleHtml(html: string): string {
  return html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<!--[^]*?-->/g,' ')
    .replace(/<[^>]*>/g,' ')
    .replace(/&nbsp;/g,' ');
}

export function auditRenderedMetrics(html: string, facts: AdFact[]): string[] {
  return unsupportedMetrics(visibleHtml(html), facts);
}

/** A transparent map from every recognized on-page number to the supplied DEMO fact(s). */
export function traceRenderedMetrics(html: string, facts: AdFact[]) {
  const sourceMap = new Map<string, string[]>();
  for (const f of facts) for (const metric of extractMeasurableClaims(f.value)) {
    const keys = [metric.key];
    const range = /^(-?\d+(?:\.\d+)?)-(-?\d+(?:\.\d+)?):(.+)$/.exec(metric.key);
    if (range) keys.push(`${range[1]}:${range[3]}`, `${range[2]}:${range[3]}`);
    for (const key of keys) sourceMap.set(key, [...new Set([...(sourceMap.get(key) ?? []), f.label])]);
  }
  return [...new Map(extractMeasurableClaims(visibleHtml(html)).map(x => [x.key, x])).values()]
    .map(x => ({ claim: x.raw, factLabels: sourceMap.get(x.key) ?? [],
      source: 'built-in-fictional-demo-facts', independentlyVerified: false }));
}
