/**
 * LLM 联通性自检（硅基流动 SiliconFlow 或任意 OpenAI 兼容服务）
 * ------------------------------------------------------------
 * 用法：
 *   npx tsx --env-file=.env.local scripts/check-llm.ts
 *
 * 会依次验证：
 *   1. curl /v1/models 能否拿到模型列表（验证 key + base_url）
 *   2. chat 能否正常返回
 *   3. embeddings 能否返回向量，以及维度是否等于 EMBED_DIM
 */
import { getLLM, llmMode, EMBED_DIM } from '../src/lib/llm';

async function main() {
  const base = (process.env.LLM_BASE_URL ?? '').replace(/\/+$/, '');
  const key = process.env.LLM_API_KEY ?? '';
  const model = process.env.LLM_MODEL ?? '';
  const embedModel = process.env.EMBED_MODEL ?? '';

  console.log(`LLM_ENABLED=${process.env.LLM_ENABLED}`);
  console.log(`base_url   = ${base || '(未配置)'}`);
  console.log(`model      = ${model || '(未配置)'}`);
  console.log(`embed_model= ${embedModel || '(未配置)'}`);
  console.log(`key        = ${key ? `${key.slice(0, 6)}…${key.slice(-4)}（长度 ${key.length}）` : '(未配置)'}`);
  console.log('');

  if (llmMode() === 'stub') {
    console.log('⚠️  当前是 stub 模式，不会发起真实请求。把 LLM_ENABLED=true 再跑一次。');
    return;
  }

  // 1) 模型列表：最便宜的鉴权验证
  try {
    const res = await fetch(`${base}/models`, { headers: { Authorization: `Bearer ${key}` } });
    if (res.ok) {
      const data = (await res.json()) as { data?: Array<{ id: string }> };
      const ids = (data.data ?? []).map((d) => d.id);
      console.log(`✅ /models 正常，可见 ${ids.length} 个模型`);
      if (model && !ids.includes(model)) {
        console.log(`   ⚠️  模型 ${model} 不在列表中，可能是别名或需要开通，继续实测 chat`);
      }
    } else {
      console.log(`❌ /models 返回 ${res.status}：${(await res.text()).slice(0, 300)}`);
    }
  } catch (e) {
    console.log(`❌ /models 请求异常：${(e as Error).message}`);
  }

  const llm = getLLM();

  // 2) chat
  try {
    const t0 = Date.now();
    const out = await llm.chat([
      { role: 'system', content: '你只回答一个字，不要解释。' },
      { role: 'user', content: '说“通”' },
    ], { maxTokens: 20, temperature: 0 });
    console.log(`✅ chat 正常（${Date.now() - t0}ms）：${JSON.stringify(out.slice(0, 80))}`);
  } catch (e) {
    console.log(`❌ chat 失败：${(e as Error).message}`);
  }

  // 3) JSON 模式（semanticJudge 依赖）
  try {
    const out = await llm.chat([
      { role: 'system', content: '你只输出 JSON，不要任何解释。' },
      { role: 'user', content: '输出 {"score": 90, "issues": []}' },
    ], { jsonMode: true, maxTokens: 100, temperature: 0 });
    JSON.parse(out);
    console.log('✅ jsonMode 正常，返回可被 JSON.parse');
  } catch (e) {
    console.log(`❌ jsonMode 失败（判官会走 fallback）：${(e as Error).message}`);
  }

  // 4) embeddings
  try {
    const [vec] = await llm.embed(['outdoor solar security lighting']);
    if (!vec) {
      console.log('❌ embed 返回空数组');
    } else {
      const ok = vec.length === EMBED_DIM;
      console.log(`${ok ? '✅' : '⚠️ '} embed 维度 ${vec.length}（EMBED_DIM=${EMBED_DIM}）${ok ? '' : ' —— 不一致时请改 EMBED_DIM 或换模型'}`);
    }
  } catch (e) {
    console.log(`❌ embed 失败：${(e as Error).message}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});