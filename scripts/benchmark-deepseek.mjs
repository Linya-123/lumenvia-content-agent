/**
 * LumenVia vs plain DeepSeek: 5 matched-input pilot experiments.
 * Run locally, and only when the user explicitly invokes --pilot or --all.
 * No API keys printed, serialized, or sent to any host other than DeepSeek official.
 * Node >= 20, no extra dependencies.
 */
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join } from 'node:path';
import { randomUUID } from 'node:crypto';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const DEFAULT_MODEL = 'deepseek-v4-flash';
const FIXTURE = resolve(ROOT, 'tests/real_model_cases.json');
const OUT_DIR = resolve(ROOT, 'benchmark-results');
const FACTS = [
  'Demo product: Lumenvia LumenGuard S20 (fictional, no independently verified certificates).',
  'SKU LMN-LGS-20; IP65 is a demo specification, not independently validated.',
  'Battery: 5200 mAh LiFePO4; luminous flux: 1100 lm; colour temperature: 4000 K.',
  'Detection range: up to 12 m at 120 degrees, measured at 2 m mounting height.',
  'Operating temperature: -20 to 55 °C; autonomy: 4–5 nights at about 8 activations/night.',
  'Installation: approximately 20 min; package includes fixture, solar panel, 3 m cable, bracket, drilling template and quick-start guide.',
  'Illustrative demo price (not a real offer): US 79.00; DE/ES 74.00. All values are unverified prototype data.',
  'No verified CE / FCC / RoHS certificate, test report, third-party endorsement, or verified shipping/return promise is supplied.',
];

function assert(cond, message) { if (!cond) throw new Error(message); }
function isoNow() { return new Date().toISOString(); }
function safeText(s) { return typeof s === 'string' ? s : ''; }
function endpoint(raw) {
  const url = new URL(raw || 'http://localhost:3100');
  assert(['localhost', '127.0.0.1', '[::1]'].includes(url.hostname),
    '为保护本地信息，实验仅允许连接 localhost/127.0.0.1');
  assert(url.protocol === 'http:', '本地测试地址应为 http://localhost:3100');
  return url.origin;
}
function deepseekHost(raw) {
  const url = new URL(raw || 'https://api.deepseek.com');
  assert(url.protocol === 'https:' && url.hostname === 'api.deepseek.com',
    '此实验仅允许将 API Key 发往 DeepSeek 官方 https://api.deepseek.com');
  return url.origin + (url.pathname.replace(/\/+$/, '') || '');
}
function friendlyError(e) {
  const raw = safeText(e?.message || String(e));
  return raw.replace(/sk-[A-Za-z0-9_-]{8,}/g, '[REDACTED_API_KEY]');
}
function usageOf(raw) {
  const obj = raw && typeof raw === 'object' ? raw : {};
  const n = x => Number.isInteger(x) && x >= 0 ? x : null;
  const p = n(obj.prompt_tokens), c = n(obj.completion_tokens);
  if (p === null || c === null) return null;
  return {
    promptTokens: p, completionTokens: c,
    totalTokens: n(obj.total_tokens) ?? p+c,
    cachedPromptTokens: n(obj.prompt_cache_hit_tokens) ?? n(obj.prompt_tokens_details?.cached_tokens) ?? 0,
  };
}
function stripHtml(html) {
  return safeText(html)
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&').replace(/\s+/g,' ').trim();
}
function riskSignals(text) {
  // Independent screening hints, NOT a legal finding or factual correctness score.
  const rules = {
    'affirmative-certification': /\b(?:CE|FCC|RoHS)[\s-]*(?:certified|approved|verified)\b|\b(?:CE|FCC)\s*zertifiziert\b|\b(?:certificación|certificado|marcado)\s+CE\b/gi,
    'unfounded-guarantee': /\b100\s*%\s*guaranteed\b|\bbest\s+(?:ever|on\s+the\s+market)\b|\bel\s+mejor\b/gi,
    'wrong-eu-regulation': /2023\/1670/g,
  };
  return Object.fromEntries(Object.entries(rules)
    .map(([key,re]) => [key, (text.match(re)||[]).length]));
}
function baselineMessages(item) {
  const target = {en:'English',de:'Deutsch',es:'Español'}[item.locale];
  return [
    {role:'system',content:`You are a general-purpose marketing copywriter. Write a useful landing page in ${target}, including hero, product facts, use cases, FAQ and CTA. Output a standalone HTML document. Use the supplied facts only, do not invent measurable values, certifications, shipping terms, test evidence or customer reviews. Keep the copy suitable for a fictional demonstration product. No external tools, no compliance checker, no auto-repair.`},
    {role:'user',content:`Marketing request:\n${item.prompt}\nMarket: ${item.market}. Topic: ${item.topic}.\nProduct information provided to BOTH systems:\n${FACTS.join('\n')}`}];
}
function parseSse(text) {
  const events = [];
  for(const chunk of text.replace(/\r\n/g,'\n').split('\n\n')) {
    const lines = chunk.split('\n').filter(s=>s.startsWith('data:'));
    if(!lines.length) continue;
    try {events.push(JSON.parse(lines.map(s=>s.slice(5).trimStart()).join('\n')));}catch { /* ignore malformed chunk */ }
  }
  return events;
}
async function directDeepSeek(item, config, fetchFn=fetch) {
  const start = performance.now();
  const body = {
    model:config.model,
    messages: baselineMessages(item),
    thinking:{type:'disabled'},
    temperature:0.3,
    // Increase ceiling; an unfinished baseline is INVALID, not a losing result.
    max_tokens:7000,
    stream:false,
  };
  const res = await fetchFn(config.base+'/chat/completions', {
    method:'POST', headers:{'content-type':'application/json',authorization:'Bearer '+config.key},
    body:JSON.stringify(body), signal:AbortSignal.timeout(90000),
  });
  if(!res.ok) throw new Error(`DeepSeek 对照组请求失败 HTTP ${res.status}: ${(await res.text()).slice(0,250)}`);
  const data = await res.json();
  const output = safeText(data.choices?.[0]?.message?.content);
  assert(output.trim().length>0,'DeepSeek 对照组返回空内容');
  const finishReason=data.choices?.[0]?.finish_reason || null;
  const completeHtml=/<html\b/i.test(output) && /<\/html\s*>/i.test(output) &&
    /<body\b/i.test(output) && /<\/body\s*>/i.test(output);
  const valid=finishReason==='stop' && completeHtml;
  return {source:'llm',status:valid?'success':'invalid',model:data.model || config.model,
    latencyMs:Math.round(performance.now()-start),usage:usageOf(data.usage),finishReason,
    completeHtml, output, signals:riskSignals(stripHtml(output)),
    ...(!valid?{error:`基线输出无效（finish_reason=${finishReason}，完整HTML=${completeHtml}）；本次不评价质量，也不继续付费调用Agent`}:{})};
}
async function agentRun(item, config, fetchFn=fetch) {
  const start = performance.now();
  const input = {
    market:item.market,locales:[item.locale],category:'outdoor-lighting',topic:item.topic,
    intent:'landing-page',prompt:item.prompt, evidenceDocs:[],
    productFacts:[
      {field:'model',value:'LumenGuard S20'},
      {field:'sku',value:'LMN-LGS-20'},
      {field:'ip',value:'IP65'},
      {field:'battery',value:'5200 mAh LiFePO4'},
      {field:'lumen',value:'1100 lm, 4000 K'},
      {field:'range',value:'Up to 12 m at 120°, measured at 2 m mounting height'},
      {field:'temp',value:'-20 to 55 °C'},
      {field:'runtime',value:'4–5 nights at about 8 activations/night'},
      {field:'install',value:'approximately 20 min'},
      {field:'cable_length',value:'3 m cable'},
    ],
  };
  const res=await fetchFn(config.server+'/api/run',{
    method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(input),
    signal:AbortSignal.timeout(180000),
  });
  if(!res.ok) throw new Error(`LumenVia /api/run HTTP ${res.status}: ${(await res.text()).slice(0,250)}`);
  const events=parseSse(await res.text());
  const done=events.findLast(x=>x.kind==='done');
  const error=events.findLast(x=>x.kind==='error');
  const stages=events.filter(x=>x.kind==='stage');
  const stage3=stages.filter(x=>x.stage===3).at(-1);
  const stage4=stages.filter(x=>x.stage===4).at(-1);
  const stage6=stages.filter(x=>x.stage===6).at(-1);
  const usage=done?.tokenUsage || error?.tokenUsage || null;
  const page=done?.pages?.find(p=>p.locale===item.locale) || null;
  // A V6 server can generate successfully but has no per-request usage metrics.
  // Treat that as incompatible with this V7 cost-comparison experiment.
  const metered=usage?.complete===true && Number.isInteger(usage.calls) && usage.calls>=2 &&
    Number.isInteger(usage.totalTokens) && usage.totalTokens>0;
  const isLive=!!done && done.mode==='live' && done.outlineSource==='llm' &&
    done.copySources?.length>0 && done.copySources.every(s=>s.source==='llm') && !!page?.html && metered && !!done.reviewStatus;
  return {
    source:isLive?'llm':'not-confirmed',model:config.model,
    latencyMs:Math.round(performance.now()-start),usage,
    status:isLive?'success':error?'failed':'fallback',
    error:error?.message || (!isLive?(metered?'S3/S4 未全部确认为真实模型生成或未返回V8审查状态':'缺少完整逐任务Token用量：请确认3100端口启动的是V8'):null),
    stages:{s3:stage3?.summary,s4:stage4?.summary,s6:stage6?.summary,judge:stage6?.detail?.judge},
    output:page?.html || '',signals:riskSignals(stripHtml(page?.html)),
    reviewStatus:done?.reviewStatus || null,
    readiness:done?.readiness || null,
    semanticScore:done?.semanticScore ?? null,
    jobId:done?.jobId || null,
  };
}
async function verifyAgent(config, fetchFn=fetch) {
  const resp=await fetchFn(config.server+'/api/llm',{signal:AbortSignal.timeout(8000)});
  assert(resp.ok,'无法读取本地 /api/llm：确认 npm run dev 已启动并且无需额外登录');
  const info=await resp.json();
  assert(info.enabled && info.configured && info.mode==='live',
    'LumenVia 仍未处于真实在线模式：请先在网页顶部启用 LLM 在线，再执行实验');
  assert(info.model===config.model,
    `模型不一致：本地LumenVia=${info.model}，基线=${config.model}；先统一 .env.local 模型`);
}
function csvValue(v) {
  const s = v===null||v===undefined?'':String(v);
  return /[",\r\n]/.test(s)?'"'+s.replace(/"/g,'""')+'"':s;
}
function toCsv(rows) {
  const keys=['caseId','group','status','model','latencyMs','calls','promptTokens','completionTokens','totalTokens','cachedPromptTokens','finishReason','completeHtml','publicationReady','withheldMetricClaims','riskSignalCount','s3','s4','s6','judge','notes'];
  return keys.join(',')+'\n'+rows.map(row=>keys.map(k=>csvValue(row[k])).join(',')).join('\n')+'\n';
}
function resultsRows(runs) {
  return runs.flatMap(x=>['baseline','lumenvia'].filter(k=>x[k]).map(group=>{
    const r=x[group];const u=r.usage||{};
    return {caseId:x.id,group,status:r.status||r.source,model:r.model,
      latencyMs:r.latencyMs,calls:u.calls??(group==='baseline'?1:null),
      promptTokens:u.promptTokens,completionTokens:u.completionTokens,
      totalTokens:u.totalTokens,cachedPromptTokens:u.cachedPromptTokens,
      finishReason:r.finishReason,completeHtml:r.completeHtml,
      publicationReady:r.reviewStatus?.publicationReady,
      withheldMetricClaims:r.reviewStatus?.factGuard?.length,
      riskSignalCount:Object.values(r.signals||{}).reduce((a,b)=>a+b,0),
      s3:r.stages?.s3,s4:r.stages?.s4,s6:r.stages?.s6,judge:r.stages?.judge,
      notes:r.error||'',};}));
}
function reviewTemplate(runs){
  const lines=['caseId,group,unsupportedClaimCount,factErrors,languagePass,readability1to5,evidenceNotes,reviewer'];
  for(const r of runs)for(const group of ['baseline','lumenvia'])if(r[group]){
    lines.push([r.id,group,'','','','','',''].join(','));
  }
  return lines.join('\n')+'\n';
}
function parseArgs(argv) {
  const flags=new Set(argv);
  const active=['--pilot','--remaining','--all','--dry-run'].filter(s=>flags.has(s));
  assert(active.length===1,'必须指定且只能指定 --dry-run、--pilot、--remaining 或 --all 之一');
  return {mode:active[0]};
}
async function runExperiment({ mode, env=process.env, fetchFn=fetch,
  outDir=OUT_DIR, fixture=FIXTURE, logger=console.log } = {}) {
  const cases=JSON.parse(await readFile(fixture,'utf8'));
  assert(Array.isArray(cases)&&cases.length===5,'实验配置应恰好包含5个任务');
  if(mode==='--dry-run'){
    logger('仅展示测试任务，不调用API，不产生费用：');
    for(const c of cases)logger(` ${c.id} ${c.market}/${c.locale}: ${c.topic}`);
    return {dryRun:true,count:cases.length};
  }
  assert(['--pilot','--remaining','--all'].includes(mode),'需要明确选择 --pilot、--remaining 或 --all');
  const key=env.LLM_API_KEY;
  assert(key && key.trim().length>8,'未读到LLM_API_KEY；请用 Node --env-file=.env.local 运行');
  const config={base:deepseekHost(env.LLM_BASE_URL),key,
    model:env.LLM_MODEL||DEFAULT_MODEL,
    server:endpoint(env.LUMENVIA_TEST_URL||'http://localhost:3100')};
  assert(config.model===DEFAULT_MODEL,
    '为保证同模型可比较，目前只支持 deepseek-v4-flash；请先检查 LLM_MODEL');
  await verifyAgent(config,fetchFn); // no paid call yet
  const selected=mode==='--pilot'?cases.slice(0,1):mode==='--remaining'?cases.slice(1):cases;
  const runs=[];
  const outputRoot=join(outDir,new Date().toISOString().replace(/[:.]/g,'-')+'-'+randomUUID().slice(0,6));
  await mkdir(outputRoot,{recursive:true});
  for (let i=0;i<selected.length;i++){
    const item=selected[i];
    logger(`[${i+1}/${selected.length}] ${item.id} 开始（首先调用普通DeepSeek，然后调用LumenVia）`);
    const run={id:item.id,market:item.market,locale:item.locale,topic:item.topic,prompt:item.prompt};
    try { run.baseline=await directDeepSeek(item,config,fetchFn); }
    catch(e) {run.baseline={status:'failed',error:friendlyError(e)};}
    if(run.baseline.status==='success') {
      try { run.lumenvia=await agentRun(item,config,fetchFn); }
      catch(e) {run.lumenvia={status:'failed',error:friendlyError(e)};}
    }
    runs.push(run);
    // Save after EACH case: no results lost if a later request fails.
    await writeFile(join(outputRoot,'results.json'),JSON.stringify({created:isoNow(),model:config.model,
      sample:'synthetic fictional product',disclaimer:'待人工核查；自动规则信号不等于真实准确率',runs},null,2),'utf8');
    await writeFile(join(outputRoot,'metrics.csv'),toCsv(resultsRows(runs)),'utf8');
    await writeFile(join(outputRoot,'manual_review.csv'),reviewTemplate(runs),'utf8');
    if(run.baseline.status!=='success') {
      logger('普通DeepSeek输出未完整完成，已记录本次无效实验并停止，未调用LumenVia以节省API费用。原因：'+(run.baseline.error||'未知'));
      break;
    }
    if(run.lumenvia.status!=='success'){
      logger('本组 LumenVia 不是完整真实模型结果，停止后续付费测试。原因：'+(run.lumenvia.error||'未知'));
      break;
    }
    logger(`完成 ${item.id}：基线 ${run.baseline.latencyMs}ms，LumenVia ${run.lumenvia.latencyMs}ms；完整日志保存在本地`);
  }
  logger(`输出目录: ${outputRoot}`);
  logger('提示：请人工审核 manual_review.csv；脚本不会凭敏感词数量宣布胜负或计算虚构成本。');
  return {dryRun:false,runs,outputRoot};
}

export {parseArgs,usageOf,parseSse,directDeepSeek,agentRun,verifyAgent,riskSignals,resultsRows,toCsv,runExperiment};

if(process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  runExperiment(parseArgs(process.argv.slice(2))).catch(e=>{
    console.error('实验停止：'+friendlyError(e));
    process.exitCode=1;
  });
}
