import { validateSubmittedFacts } from './product-profile-v9';
import {resolveTaskLocales, type SupportedMarket} from './task-intake-v92';

/** Request boundary for public demo API. Not an authentication substitute. */
export type AcceptedMarket = 'US' | 'DE' | 'ES' | 'EU';
export type ValidatedRunRequest = {
  market: AcceptedMarket;
  locales: string[];
  category: string;
  topic: string;
  intent?: string;
  prompt?: string;
  exampleId?: string;
  parentId?: string;
  instruction?: string;
  marketCsv?: string;
  evidenceDocs?: unknown[];
  productFacts?: Array<{field:string;value:string}>;
};

const SUPPORTED_MARKETS: Record<AcceptedMarket, string[]> = {
  US: ['en'], DE: ['de'], ES: ['es'], EU: ['en', 'de', 'es'],
};
const MAX_BYTES = 512_000;

/** Reject oversized streaming bodies instead of parsing arbitrarily large JSON. */
export async function readLimitedRequestJson(req: Request): Promise<unknown> {
  if (!/^application\/json(?:;|$)/i.test(req.headers.get('content-type') ?? '')) {
    throw new Error('需要 application/json 请求');
  }
  const declaredLength = Number(req.headers.get('content-length') || 0);
  if (Number.isFinite(declaredLength) && declaredLength > MAX_BYTES) {
    throw new Error('请求体过大，超过512 KB');
  }
  if (!req.body) throw new Error('请求体不能为空');
  const reader = req.body.getReader();
  const decoder = new TextDecoder('utf-8', { fatal: true });
  let byteCount = 0;
  let text = '';
  try {
    for (;;) {
      const {done, value} = await reader.read();
      if (done) break;
      byteCount += value.byteLength;
      if (byteCount > MAX_BYTES) {
        await reader.cancel();
        throw new Error('请求体过大，超过512 KB');
      }
      text += decoder.decode(value,{stream:true});
    }
    text += decoder.decode();
    return JSON.parse(text) as unknown;
  } catch (e) {
    if (e instanceof SyntaxError) throw new Error('JSON 格式错误');
    throw e;
  } finally {
    reader.releaseLock();
  }
}

function shortText(value: unknown, key: string, limit: number, optional = false): string | undefined {
  if (value === undefined || value === null || value === '') {
    if (optional) return undefined;
    throw new Error(`${key} 不能为空`);
  }
  if (typeof value !== 'string' || value.trim().length > limit || !value.trim() || /[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(value)) {
    throw new Error(`${key} 格式错误或超过${limit}字符`);
  }
  return value.trim();
}

/** Reject invalid country/locale combinations and model-call fanout. */
export function validateRunRequest(raw: unknown): ValidatedRunRequest {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('任务格式错误');
  const data = raw as Record<string, unknown>;
  const market = data.market;
  if (typeof market !== 'string' || !(market in SUPPORTED_MARKETS)) throw new Error('不支持的目标市场');
  const validMarket = market as AcceptedMarket;
  const localeList = data.locales ?? resolveTaskLocales(validMarket as SupportedMarket, typeof data.prompt==='string'?data.prompt:'');
  if (!Array.isArray(localeList) || localeList.length < 1 || localeList.length > 3 ||
    localeList.some(x => typeof x !== 'string' || !['en','de','es'].includes(x)) ||
    new Set(localeList).size !== localeList.length) throw new Error('输出语言无效（仅支持 en、de、es，最多3种且不能重复）');
  const productFacts = validateSubmittedFacts(data.productFacts);
  const category = shortText(data.category ?? 'outdoor-lighting','category',80);
  // General products use the universal planner / renderer; category-specific rules are optional.
  const topic = shortText(data.topic ?? 'outdoor solar security lighting','topic',240);
  const intent = shortText(data.intent,'intent',120,true);
  const prompt = shortText(data.prompt,'prompt',5000,true);
  const exampleId = shortText(data.exampleId,'exampleId',100,true);
  const parentId = shortText(data.parentId,'parentId',128,true);
  const instruction = shortText(data.instruction,'instruction',3000,true);
  if (data.marketCsv !== undefined && (typeof data.marketCsv !== 'string' || data.marketCsv.length > 100000)) {
    throw new Error('市场CSV不是字符串或超过100 KB');
  }
  if (data.evidenceDocs !== undefined && (!Array.isArray(data.evidenceDocs) || data.evidenceDocs.length > 3)) {
    throw new Error('最多上传3个证据文件');
  }
  return {
    market: validMarket, locales: [...localeList], category: category!, topic: topic!,
    ...(intent ? {intent} : {}), ...(prompt ? {prompt} : {}),
    ...(exampleId ? {exampleId} : {}), ...(parentId ? {parentId} : {}),
    ...(instruction ? {instruction} : {}),
    ...(typeof data.marketCsv === 'string' ? {marketCsv: data.marketCsv} : {}),
    ...(Array.isArray(data.evidenceDocs) ? {evidenceDocs: data.evidenceDocs} : {}),
    productFacts,
  };
}
