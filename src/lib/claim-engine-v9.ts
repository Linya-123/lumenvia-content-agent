import { extractMeasurableClaims } from './fact-guard';
import type { ProductFactV9 } from './product-profile-v9';
import { unsupportedPetFeederCapability } from './unsupported-features-v93';

export type ClaimRecordV9 = {
  id: string; locale: string; fieldPath: string; original: string; final: string;
  action: 'retained'|'safe_rewrite'|'withheld';
  reason: string; factIds: string[]; sourceIds: string[];
  independentVerification: false;
};

const HIGH_RISK = /\b(?:CE|FCC|RoHS)[ -]?(?:certified|approved|compliant|verified)|\b(?:certified|guaranteed|tested and approved|free shipping|lifetime warranty|clinically proven)\b|\b(?:zertifiziert|zertifizierung bestätigt|garantiert|certificado|certificada|garantizado|garantizada|envío gratis)\b/iu;
const PRICE = /(?:[$€£]\s*\d[\d.,]*|\b\d[\d.,]*\s*(?:USD|EUR|GBP|euros?)\b)/iu;
const QUANT = /\b\d+(?:[.,]\d+)?\s*(?:years?|Jahre?|años?|days?|Tage?|días?)\b/iu;
const NO_PROOF_UNITS = /\b(?:\d{3,5}\s*(?:cycles?|Zyklen|ciclos))\b/iu;

const CLASSES: Array<[string,RegExp]> = [
  ['ip',/\b(?:IP\s?\d\d|dust|water|wasserdicht|impermeab|protecci[oó]n)\b/iu],
  ['battery',/\b(?:battery|batterie|bater[ií]a|mAh|LiFePO4)\b/iu],
  ['panel_power',/\b(?:panel|module|solarzelle|placa solar|solar panel)\b/iu],
  ['lumen',/\b(?:light output|brightness|lumen|luminosidad|helligkeit|lm)\b/iu],
  ['range',/\b(?:detect|sensor|range|distance|erkennung|reichweite|alcance|detecci[oó]n)\b/iu],
  ['cable_length',/\b(?:cable|kabel|cabo|cableado)\b/iu],
  ['runtime',/\b(?:runtime|nights?|nächte|noches|autonomy|autonom[ií]a)\b/iu],
  ['install',/\b(?:install|montage|montaje|minutos|minutes?|minuten)\b/iu],
  ['temp',/\b(?:temperature|temperatur|temperatura|°\s?C)\b/iu],
  ['price',/\b(?:price|cost|preis|precio|USD|EUR)\b/iu],
];
function meaning(text: string): string | null {
  for (const [field,re] of CLASSES) if(re.test(text)) return field;
  return null;
}
function metricKeyList(text: string) { return extractMeasurableClaims(text).map(x=>x.key); }
const NORMALIZE = (v: string) => v.toLowerCase().replace(/[\s\u00a0]/g,'').replace('−','-');
function hasMatchingFact(metric: string, sentence: string, facts: ProductFactV9[]): ProductFactV9 | undefined {
  const intended = meaning(sentence);
  return facts.find(f => {
    if(!metricKeyList(f.value).includes(metric)) return false;
    // If a statement explicitly describes a different measurement, equal numbers aren't proof.
    const sourceMeaning = meaning(`${f.field} ${f.value}`) ?? f.field;
    return !intended || intended === sourceMeaning ||
      (intended==='battery' && sourceMeaning==='runtime' && /night|nacht|noche/iu.test(sentence));
  });
}
function genericReplacement(locale:string, facts:ProductFactV9[], category='outdoor-lighting'):string {
  if(category!=='outdoor-lighting')return locale==='de'?'Entdecken Sie das Produkt und seine dokumentierten Merkmale.':locale==='es'?'Conozca el producto y sus características documentadas.':'Explore the product and its documented features.';
  const solar = facts.some(f => f.field==='power_source' && /solar/iu.test(f.value));
  const scene = facts.some(f=> f.field==='scenario' && /garage|车库/iu.test(f.value));
  if(locale==='de') return solar ? 'Entdecken Sie solarbetriebene Beleuchtung für den Außenbereich.' : 'Entdecken Sie Beleuchtung für den vorgesehenen Außenbereich.';
  if(locale==='es') return solar ? 'Descubra soluciones de iluminación solar para exteriores.' : 'Descubra opciones de iluminación para los espacios exteriores.';
  return solar ? (scene ? 'Explore solar-powered lighting for garage entrances and outdoor spaces.' : 'Explore solar-powered lighting for outdoor spaces.') : 'Explore lighting options for outdoor spaces.';
}
/**
 * Narrow last-mile mixed-language detector for marketing text.
 * Keep common loanwords (App, Feeder, Smartphone) and brand names allowed;
 * flag English *phrases* and corrupt tokens inside DE/ES, not all Latin text.
 */
function targetLanguageLeak(text:string,locale:string):boolean {
  if(/[\u3400-\u9fff\u3040-\u30ff]/u.test(text))return true;
  if(locale==='de'||locale==='es'){
    return /\b(?:well suited|as long as|please check|you can|in order to|for more information|click here|well suited foreht|foreht)\b/iu.test(text);
  }
  return false;
}

function splitSentences(value:string):string[] {
  // Sentence boundaries, not decimal dots; don't split abbreviations inside numbers.
  return value.split(/(?<=[.!?。！？])\s+(?=[A-ZÀ-Ý¿¡\p{L}])/u);
}
function checkPart(value:string,facts:ProductFactV9[]):{reason:string;support:ProductFactV9[]}|null {
  const expandedFeature=unsupportedPetFeederCapability(value,facts);
  if(expandedFeature)return {reason:expandedFeature,support:[]};
  const qualitativePerformance=/\b(?:completely waterproof|fully waterproof|waterproof|weatherproof|unbreakable|indestructible|lasts forever|long[- ]lasting guaranteed)\b|wasserdicht|unzerbrechlich|impermeable|irrompible/iu;
  if(qualitativePerformance.test(value) && !facts.some(f=>f.field==='feature' && qualitativePerformance.test(f.value))) return {reason:'防水、耐用等定性性能声明缺少本次产品资料支持',support:[]};
  if (HIGH_RISK.test(value)) return {reason:'认证、保证、服务承诺等需要独立资料，不能直接肯定宣传',support:[]};
  if (PRICE.test(value) || QUANT.test(value) || NO_PROOF_UNITS.test(value)) {
    const relevant = facts.find(f => (f.field==='price'||f.field==='warranty') && NORMALIZE(value).includes(NORMALIZE(f.value)));
    if (!relevant) return {reason:'价格、期限或服务承诺缺少对应产品资料',support:[]};
  }
  // Qualitative product characteristics also require an explicit user-provided source.
  const qualitative: Array<{pattern:RegExp; field:string; label:string}> = [
    {pattern:/\bsolar[- ]powered\b|solarbetrieben|iluminaci[oó]n solar/iu,field:'power_source',label:'solar power'},
    {pattern:/\bmotion[ -]sens(?:or|ing)\b|bewegungsmelder|sensor de movimiento/iu,field:'motion_sensor',label:'motion sensor'},
    {pattern:/\bno (?:mains )?wiring\b|ohne netzanschluss|sin conexi[oó]n a la red/iu,field:'no_mains',label:'no mains wiring'},
  ];
  const qualitativeFacts:ProductFactV9[]=[];
  for(const q of qualitative) {
    if(!q.pattern.test(value))continue;
    const support=facts.find(f=>f.field===q.field);
    if(!support)return {reason:`${q.label} 产品特征尚未由用户明确提供`,support:[]};
    qualitativeFacts.push(support);
  }
  const metrics = metricKeyList(value);
  const found: ProductFactV9[]=[...qualitativeFacts];
  for(const metric of metrics) {
    const f=hasMatchingFact(metric,value,facts);
    if(!f) return {reason:`可量化声明 ${metric} 缺少同一语义字段的资料支持`,support:[]};
    found.push(f);
  }
  return found.length ? {reason:'ok',support:[...new Map(found.map(f=>[f.id,f])).values()]} : null;
}
/** Deterministic local sentence-level repair; no paid API calls in this layer. */
export function reviewMarketingCopy<T extends object>(copy:T,locale:string,facts:ProductFactV9[],category='outdoor-lighting') {
  const records:ClaimRecordV9[]=[];
  const normalize=(value:unknown,path:string):unknown=>{
    if(typeof value==='string') {
      const sentences=splitSentences(value);
      const repaired=sentences.map(sentence=>{
        const localeMismatch=['en','de','es'].includes(locale) && targetLanguageLeak(sentence,locale);
        const result=localeMismatch ? {reason:'生成文案含非目标语句段或异常英文碎片',support:[] as ProductFactV9[]} : checkPart(sentence,facts);
        const action=result && result.reason!=='ok' ? 'safe_rewrite' : 'retained';
        const newSentence=action==='safe_rewrite' ? genericReplacement(locale,facts,category) : sentence;
        // Track evidence-bearing claims and revisions, not every harmless button label.
        if(result) {
          const support=result.support;
          records.push({id:`C${String(records.length+1).padStart(3,'0')}`,locale,
            fieldPath:path,original:sentence,final:newSentence,action,
            reason:action==='safe_rewrite'?result.reason:'数值与用户提供的资料字段一致；真实性尚未独立核验',
            factIds:support.map(f=>f.id),sourceIds:support.map(f=>f.sourceId),independentVerification:false});
        }
        return newSentence;
      });
      return repaired.join(' ');
    }
    if(Array.isArray(value))return value.map((x,i)=>normalize(x,`${path}[${i}]`));
    if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,normalize(v,path?`${path}.${k}`:k)]));
    return value;
  };
  const result=normalize(copy,'') as T;
  return {copy:result,claims:records};
}

export function inspectFinalPage(html:string,facts:ProductFactV9[],locale?:string):string[] {
  // Structured product facts are rendered from explicit request data and audited by source ID.
  // Exclude the <dl> facts table here to avoid joining unrelated numeric fields into one sentence.
  const text=html.replace(/<dl\s+class="specs">[\s\S]*?<\/dl>/giu,' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/giu,' ')
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/giu,' ')
    .replace(/<[^>]+>/g,'\n')
    .replace(/&(?:amp|nbsp|quot|lt|gt);/g,' ');
  const issues:string[]=[];
  for(const part of text.split(/[.!?。！？]\s*|\n/g).filter(Boolean)) {
    const issue=checkPart(part,facts);
    if(issue&&issue.reason!=='ok') issues.push(`${issue.reason}: ${part.trim().slice(0,120)}`);
  }
  // SEO description and JSON-LD are scanned separately from visible HTML.
  const meta = /<meta\s+name="description"\s+content="([^"]*)"/i.exec(html)?.[1]??'';
  const metaIssue=checkPart(meta,facts);if(metaIssue&&metaIssue.reason!=='ok')issues.push(`SEO: ${metaIssue.reason}`);
  // Last-mile language check covers rendered customer copy, SEO and schema.
  // Do not treat source code, CSS or JS text as customer-facing prose.
  if(locale && ['en','de','es'].includes(locale)) {
    const main=/<main\b[^>]*>([\s\S]*?)<\/main>/i.exec(html)?.[1]??'';
    const customerText=main.replace(/<[^>]+>/g,' ');
    const title=/<title>([^<]*)<\/title>/i.exec(html)?.[1]??'';
    const structured=(html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/giu)??[]).join(' ');
    const leaked=[customerText,title,meta,structured].some(v=>targetLanguageLeak(v,locale));
    if(leaked)issues.push(`输出语言不一致：${locale} 页面含非目标语句段或异常文本，请核验文案与产品事实的本地化`);
  }
  return [...new Set(issues)];
}
