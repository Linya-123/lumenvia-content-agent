import { recordLLMCall, recordLLMFailure, recordLLMUsage } from './llm-metrics';

/**
 * LLM 抽象层
 * ------------------------------------------------------------
 * 走 OpenAI 兼容协议。默认对接硅基流动 SiliconFlow：
 *   LLM_BASE_URL=https://api.siliconflow.cn/v1
 *   LLM_MODEL=deepseek-ai/DeepSeek-V4.1-Flash   （默认；推理模型，默认关闭 thinking）
 *   EMBED_MODEL=BAAI/bge-m3                     （1024 维，与 EMBED_DIM 一致）
 * 换供应商（DeepSeek / 通义 / 智谱 / vLLM）只改这三个变量，代码不动。
 *
 * LLM_ENABLED=false 时走 deterministic stub —— 用于：
 *   1. 评审时无需外部额度，链路永远跑得通
 *   2. 单元测试与 CI
 *   3. 现场断网兜底
 */

/** 默认模型：硅基流动上的 DeepSeek V4.1 Flash（便宜、快、JSON 稳定） */
export const DEFAULT_MODEL = 'deepseek-ai/DeepSeek-V4.1-Flash';

export type ChatMessage = { role: 'system' | 'user' | 'assistant'; content: string };

export type ChatOptions = {
  temperature?: number;
  maxTokens?: number;
  jsonMode?: boolean;
  signal?: AbortSignal;
};

export interface LLMClient {
  readonly name: string;
  chat(messages: ChatMessage[], opts?: ChatOptions): Promise<string>;
  embed(texts: string[]): Promise<number[][]>;
}

export const EMBED_DIM = 1024;

/** ---------- OpenAI 兼容实现（硅基流动 / DeepSeek / 通义 / 智谱 / vLLM 通用） ---------- */
class OpenAICompatibleClient implements LLMClient {
  readonly name: string;
  private base: string;
  private key: string;
  private model: string;
  private embedModel: string;
  private timeoutMs: number;

  constructor() {
    this.base = (process.env.LLM_BASE_URL ?? '').replace(/\/+$/, '');
    this.key = process.env.LLM_API_KEY ?? '';
    this.model = process.env.LLM_MODEL ?? DEFAULT_MODEL;
    this.embedModel = process.env.EMBED_MODEL ?? 'BAAI/bge-m3';
    this.timeoutMs = Number(process.env.LLM_TIMEOUT_MS ?? 60_000);
    this.name = `openai-compatible:${this.model}`;
    if (!this.base || !this.key) throw new Error('LLM_BASE_URL / LLM_API_KEY 未配置');
  }

  private headers(): Record<string, string> {
    return {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${this.key}`,
    };
  }

  /** 把外部 AbortSignal 与内部超时合并，避免请求挂死拖垮 SSE */
  private withTimeout(signal?: AbortSignal): { signal: AbortSignal; done: () => void } {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(new Error(`LLM 请求超时（${this.timeoutMs}ms）`)), this.timeoutMs);
    const onAbort = () => ctrl.abort(signal?.reason);
    if (signal) {
      if (signal.aborted) onAbort();
      else signal.addEventListener('abort', onAbort, { once: true });
    }
    return {
      signal: ctrl.signal,
      done: () => {
        clearTimeout(timer);
        signal?.removeEventListener('abort', onAbort);
      },
    };
  }

  async chat(messages: ChatMessage[], opts: ChatOptions = {}): Promise<string> {
    const body: Record<string, unknown> = {
      model: this.model,
      messages,
      temperature: opts.temperature ?? 0.7,
      max_tokens: opts.maxTokens ?? 4000,
      /**
       * 一律关闭思考模式。
       * DeepSeek V4 系列默认带 thinking，实测同一 prompt 下
       * reasoning_tokens 3285、耗时 50.7s；关掉后 reasoning_tokens 0、耗时 10.0s，
       * 而 faq / scenes 的结构完整度与文案质量一致。
       * 我们只用模型写文案和打合规分，不需要链式推理。
       * 非推理模型会忽略这个字段，因此无条件发送是安全的。
       */
      // The provider-specific thinking switch is assigned below.
    };
    // DeepSeek 官方 API 使用 thinking；硅基流动使用 enable_thinking。
    // 避免给官方接口发送第三方专属字段。
    if (this.base === 'https://api.deepseek.com' || this.base === 'https://api.deepseek.com/v1') {
      body.thinking = { type: 'disabled' };
    } else {
      body.enable_thinking = false;
    }
    if (opts.jsonMode) body.response_format = { type: 'json_object' };

    const { signal, done } = this.withTimeout(opts.signal);
    recordLLMCall();
    try {
      const res = await fetch(`${this.base}/chat/completions`, {
        method: 'POST',
        headers: this.headers(),
        body: JSON.stringify(body),
        signal,
      });
      if (!res.ok) {
        // 硅基流动失败时返回 { code, message, data }，把 message 打出来才好排查
        throw new Error(`LLM 调用失败 ${res.status}: ${(await res.text()).slice(0, 300)}`);
      }
      const data = (await res.json()) as {
        choices?: Array<{ message?: { content?: string | null; reasoning_content?: string } }>;
      };
      recordLLMUsage((data as typeof data & { usage?: unknown }).usage);
      const msg = data.choices?.[0]?.message;
      // 个别推理模型只回 reasoning_content，正文为空时兜底
      return msg?.content?.trim() || msg?.reasoning_content?.trim() || '';
    } catch (e) {
      recordLLMFailure();
      throw e;
    } finally {
      done();
    }
  }

  async embed(texts: string[]): Promise<number[][]> {
    const { signal, done } = this.withTimeout();
    try {
      const res = await fetch(`${this.base}/embeddings`, {
        method: 'POST',
        headers: this.headers(),
        // 硅基流动 bge-m3 / bge-large-zh 都走标准 OpenAI 字段
        body: JSON.stringify({
          model: this.embedModel,
          input: texts,
          encoding_format: 'float',
        }),
        signal,
      });
      if (!res.ok) {
        throw new Error(`Embedding 调用失败 ${res.status}: ${(await res.text()).slice(0, 200)}`);
      }
      const data = (await res.json()) as { data?: Array<{ embedding: number[] }> };
      return (data.data ?? []).map((d) => d.embedding);
    } finally {
      done();
    }
  }
}

/** ---------- 离线确定性实现 ---------- */
/**
 * 词袋哈希向量：同样的文本永远得到同样的向量，足够做本地语义检索演示。
 * 上线接真实 embedding 后，重新跑一次 db:seed 即可。
 */
function hashEmbed(text: string): number[] {
  const v = new Array<number>(EMBED_DIM).fill(0);
  const tokens = text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .split(' ')
    .filter((t) => t.length > 1);
  for (const t of tokens) {
    let h = 2166136261;
    for (let i = 0; i < t.length; i++) {
      h ^= t.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    const idx = Math.abs(h) % EMBED_DIM;
    v[idx] += 1;
    // 双哈希降低碰撞
    const idx2 = Math.abs(Math.imul(h, 31)) % EMBED_DIM;
    v[idx2] += 0.5;
  }
  const norm = Math.sqrt(v.reduce((s, x) => s + x * x, 0)) || 1;
  return v.map((x) => x / norm);
}

const STUB_FIXTURES: Record<string, string> = {
  'outdoor-lighting:US': 'outdoor solar security lighting',
  'outdoor-lighting:DE': 'Solar-Sicherheitsbeleuchtung',
  'outdoor-lighting:ES': 'iluminación solar de seguridad',
};

class StubClient implements LLMClient {
  readonly name = 'stub:deterministic';

  async chat(messages: ChatMessage[]): Promise<string> {
    const last = messages[messages.length - 1]?.content ?? '';
    // 供阶段引擎识别意图的极简 stub —— 真实部署请接 LLM
    if (/品类|category/i.test(last)) {
      const m = /(US|DE|ES|EU)/.exec(last);
      const key = `outdoor-lighting:${m?.[1] ?? 'US'}`;
      return STUB_FIXTURES[key] ?? 'outdoor lighting';
    }
    return '(stub)';
  }

  async embed(texts: string[]): Promise<number[][]> {
    return texts.map(hashEmbed);
  }
}

let _client: LLMClient | null = null;

/**
 * 运行时开关：null 表示跟随环境变量 LLM_ENABLED。
 * 顶栏按钮切换后写这里，不影响 process.env。
 */
let _runtimeOn: boolean | null = null;

/** 当前是否走真实模型 */
export function llmRuntimeOn(): boolean {
  if (_runtimeOn !== null) return _runtimeOn;
  return (process.env.LLM_ENABLED ?? 'false').toLowerCase() === 'true';
}

/** 是否具备切到在线的前提（base + key） */
export function llmConfigured(): boolean {
  return Boolean(process.env.LLM_BASE_URL && process.env.LLM_API_KEY);
}

/**
 * 运行时切换。切到在线前先检查凭据是否齐备，
 * 缺 key 就明确拒绝，而不是让人等到跑到一半才报错。
 */
export function setLlmRuntime(on: boolean): { ok: boolean; message?: string } {
  if (on && !llmConfigured()) {
    return { ok: false, message: '未配置 LLM_API_KEY，无法切到在线' };
  }
  _runtimeOn = on;
  _client = null; // 丢掉缓存的客户端，下次调用按新模式重建
  return { ok: true };
}

export function llmModel(): string {
  return process.env.LLM_MODEL ?? DEFAULT_MODEL;
}

export function getLLM(): LLMClient {
  if (_client) return _client;
  if (llmRuntimeOn()) {
    try {
      _client = new OpenAICompatibleClient();
    } catch (e) {
      console.warn('[llm] 配置不完整，回退到 stub：', (e as Error).message);
      _client = new StubClient();
    }
  } else {
    _client = new StubClient();
  }
  return _client;
}

export function llmMode(): 'live' | 'stub' {
  return getLLM().name.startsWith('stub') ? 'stub' : 'live';
}