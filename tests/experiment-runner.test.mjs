import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  parseSse, usageOf, riskSignals, directDeepSeek, agentRun, verifyAgent,
  runExperiment, resultsRows,
} from '../scripts/benchmark-deepseek.mjs';

const configuration = {base:'https://api.deepseek.com',key:'sk-TEST_ONLY_FAKE_KEY',
  model:'deepseek-v4-flash',server:'http://localhost:3100'};
const sample={id:'US-GARAGE',market:'US',locale:'en',topic:'solar driveway',prompt:'Test driveway landing page'};
const goodState = {enabled:true,configured:true,mode:'live',model:'deepseek-v4-flash'};
const usage = {prompt_tokens:30,completion_tokens:20,total_tokens:50,prompt_cache_hit_tokens:10};
const successfulAgent = {kind:'done',jobId:'fake-1',mode:'live',outlineSource:'llm',
  copySources:[{locale:'en',source:'llm'}],pages:[{locale:'en',html:'<html><body>Demo light features</body></html>'}],
  reviewStatus:{publicationReady:false,factGuard:[{locale:'en',field:'techItems[0].p',unsupported:['5 W'],action:'withheld'}]},
  tokenUsage:{calls:3,promptTokens:300,completionTokens:500,totalTokens:800,cachedPromptTokens:50,complete:true}};
function jsonResponse(obj,status=200){return new Response(JSON.stringify(obj),{status,headers:{'content-type':'application/json'}})}
function sseResponse(events){return new Response(events.map(x=>'data: '+JSON.stringify(x)+'\n\n').join(''),
  {headers:{'content-type':'text/event-stream'}})}
function makeMock({fallback=false,failAgent=false}={}){
  const calls=[];
  const fakeFetch=async (url,init={})=>{
    calls.push({url,init});
    if(url.endsWith('/api/llm'))return jsonResponse(goodState);
    if(url.endsWith('/chat/completions'))return jsonResponse({model:'deepseek-v4-flash',
      choices:[{message:{content:'<!DOCTYPE html><html><body><p>A demo solar light.</p></body></html>'},finish_reason:'stop'}],usage});
    if(url.endsWith('/api/run')){
      if(failAgent)return sseResponse([{kind:'error',message:'model blocked'}]);
      if(fallback)return sseResponse([{kind:'done',...successfulAgent,mode:'template',outlineSource:'template',copySources:[{locale:'en',source:'template'}]}]);
      return sseResponse([{kind:'stage',stage:3,summary:'模型生成'},
        {kind:'stage',stage:4,summary:'1语种 · 模型1'},
        {kind:'stage',stage:6,summary:'88分',detail:{judge:'openai-compatible:deepseek-v4-flash'}},successfulAgent]);
    }
    throw Error('Unexpected request '+url);
  };
  return {fakeFetch,calls};
}

test('Parse SSE and token counts from official response',()=>{
  assert.deepEqual(usageOf(usage),{promptTokens:30,completionTokens:20,totalTokens:50,cachedPromptTokens:10});
  assert.equal(parseSse('data: {"kind":"done"}\n\n')[0].kind,'done');
});
test('Red flags are screening hints, not adjudications',()=>{
  assert.equal(riskSignals('CE certified')['affirmative-certification'],1);
  assert.equal(riskSignals('2023/1670')['wrong-eu-regulation'],1);
});
test('Baseline sends key ONLY to official DeepSeek host and records actual tokens',async()=>{
  const {fakeFetch,calls}=makeMock();
  const res=await directDeepSeek(sample,configuration,fakeFetch);
  assert.equal(res.usage.totalTokens,50);
  assert.equal(res.completeHtml,true);
  assert.equal(res.status,'success');
  assert.equal(calls.length,1);
  assert.equal(calls[0].url,'https://api.deepseek.com/chat/completions');
  assert.equal(calls[0].init.headers.authorization,'Bearer '+configuration.key);
  assert.equal(JSON.parse(calls[0].init.body).thinking.type,'disabled');
});
test('Agent result only counts as live if S3 and S4 are both llm',async()=>{
  let {fakeFetch}=makeMock();
  assert.equal((await agentRun(sample,configuration,fakeFetch)).status,'success');
  ({fakeFetch}=makeMock({fallback:true}));
  assert.equal((await agentRun(sample,configuration,fakeFetch)).status,'fallback');
  // An old V6 service can return real model copy but has no per-request usage telemetry.
  const oldServer=async (url,init) => {
    const r=await makeMock().fakeFetch(url,init);
    if(url.endsWith('/api/run')) {
      const cloned=structuredClone(successfulAgent);
      delete cloned.tokenUsage;
      return sseResponse([cloned]);
    }
    return r;
  };
  const outdated=await agentRun(sample,configuration,oldServer);
  assert.equal(outdated.status,'fallback');
  assert.match(outdated.error,/V8/);
});
test('Agent connection gate refuses disabled or different model',async()=>{
  const deny=async()=>jsonResponse({...goodState,mode:'stub'});
  await assert.rejects(()=>verifyAgent(configuration,deny),/在线模式/);
  const mismatch=async()=>jsonResponse({...goodState,model:'deepseek-v4-pro'});
  await assert.rejects(()=>verifyAgent(configuration,mismatch),/模型不一致/);
});
test('Dry run has zero API calls or paid effects',async()=>{
  const r=await runExperiment({mode:'--dry-run',logger:()=>{},fetchFn:()=>{throw Error('No calls allowed')}});
  assert.equal(r.count,5);
});
test('Pilot writes CSV, manual review sheet, and no secret',async()=>{
  const tmp=await mkdtemp(join(tmpdir(),'lumen-bench-'));
  const {fakeFetch,calls}=makeMock();
  const output=await runExperiment({mode:'--pilot',outDir:tmp,fetchFn:fakeFetch,
    env:{LLM_API_KEY:configuration.key,LLM_BASE_URL:configuration.base,LLM_MODEL:configuration.model},logger:()=>{}});
  assert.equal(output.runs.length,1);
  assert.equal(calls.length,3); // status, baseline and agent
  const report=await readFile(join(output.outputRoot,'results.json'),'utf8');
  const metrics=await readFile(join(output.outputRoot,'metrics.csv'),'utf8');
  const sheet=await readFile(join(output.outputRoot,'manual_review.csv'),'utf8');
  assert.ok(!report.includes(configuration.key));
  assert.ok(!metrics.includes(configuration.key));
  assert.match(sheet,/unsupportedClaimCount/);
  assert.equal(resultsRows(output.runs).length,2);
});
test('Pilot aborts further chargeable cases on agent fallback',async()=>{
  const tmp=await mkdtemp(join(tmpdir(),'lumen-bench-fail-'));
  const {fakeFetch,calls}=makeMock({fallback:true});
  const output=await runExperiment({mode:'--all',outDir:tmp,fetchFn:fakeFetch,
    env:{LLM_API_KEY:configuration.key,LLM_BASE_URL:configuration.base,LLM_MODEL:configuration.model},logger:()=>{}});
  assert.equal(output.runs.length,1);
  assert.equal(calls.length,3);
});

test('Truncated baseline is rejected before any paid Agent call',async()=>{
  const tmp=await mkdtemp(join(tmpdir(),'lumen-bench-truncated-'));
  let paidAgentCalls=0;
  const fakeFetch=async (url,init={})=>{
    if(url.endsWith('/api/llm')) return jsonResponse(goodState);
    if(url.endsWith('/chat/completions'))return jsonResponse({model:'deepseek-v4-flash',
      choices:[{message:{content:'<!DOCTYPE html><html><body><h1>Incomplete'},finish_reason:'length'}],usage});
    if(url.endsWith('/api/run')){paidAgentCalls++;throw Error('Should not reach Agent');}
    throw Error('Unexpected URL');
  };
  const out=await runExperiment({mode:'--pilot',outDir:tmp,fetchFn:fakeFetch,
    env:{LLM_API_KEY:configuration.key,LLM_BASE_URL:configuration.base,LLM_MODEL:configuration.model},logger:()=>{}});
  assert.equal(out.runs[0].baseline.status,'invalid');
  assert.equal(paidAgentCalls,0);
  assert.equal(out.runs[0].lumenvia,undefined);
  assert.match(await readFile(join(out.outputRoot,'metrics.csv'),'utf8'),/invalid/);
});

test('Baseline natural finish without closing HTML is invalid',async()=>{
  const res=await directDeepSeek(sample,configuration,async()=>jsonResponse({
    choices:[{message:{content:'<html><body>Missing closing tags'},finish_reason:'stop'}],usage}));
  assert.equal(res.status,'invalid');
  assert.equal(res.completeHtml,false);
});
