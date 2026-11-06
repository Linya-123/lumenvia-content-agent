// No real API calls. Integration test of request-scoped provider usage and SSE response.
const assert = require('node:assert/strict');
require('./ts-runtime-hook.cjs');
process.env.LLM_ENABLED='true';
process.env.LLM_BASE_URL='https://api.deepseek.com';
process.env.LLM_MODEL='deepseek-v4-flash';
process.env.LLM_API_KEY='sk-FAKE_INTEGRATION_TEST';
let calls=0;
const { Response, Request }=global;
global.fetch=async (url,options)=>{
  assert.equal(url,'https://api.deepseek.com/chat/completions');
  assert.equal(options.headers.Authorization,'Bearer sk-FAKE_INTEGRATION_TEST');
  const payload=JSON.parse(options.body);
  assert.deepEqual(payload.thinking,{type:'disabled'});
  assert.equal(payload.enable_thinking,undefined);
  calls++;
  let message;
  if(calls===1) message=JSON.stringify({modules:['hero','specs','compliance','scenarios','faq','lead-form'],rationale:['Test'],caseHints:[]});
  else if(calls===2) message=JSON.stringify({h1:'Outdoor Solar Security Lighting',sub:'A fictional solar light with motion detection.',
    seoTitle:'Solar Security Light for Driveways',seoDesc:'Outdoor solar light prototype with movement detection and no verified certification.',
    faq:[{q:'Where to mount?',a:'Mount at 2 m.'},{q:'Battery?',a:'5200 mAh LiFePO4.'},{q:'Coverage?',a:'Up to 12 m at 120 degrees.'},{q:'Certification?',a:'Not independently verified.'}],
    scenes:[{h:'Driveway',p:'Install near entry points.'},{h:'Garden',p:'Install with sunlight access.'},{h:'Gate',p:'Adjust sensor angle.'}]});
  else message=JSON.stringify({score:86,issues:[]});
  return Response.json({choices:[{message:{content:message},finish_reason:'stop'}],
    usage:{prompt_tokens:20,completion_tokens:10,total_tokens:30,prompt_cache_hit_tokens:3}});
};
(async()=>{
  const {POST}=require('../src/app/api/run/route.ts');
  const req=new Request('http://localhost:3100/api/run',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({
    market:'US',locales:['en'],category:'outdoor-lighting',topic:'driveway solar lighting',
    prompt:'Generate a new solar driveway lighting landing page, not a preset example.',
  })});
  const res=await POST(req);
  assert.equal(res.status,200);
  const str=await res.text();
  const events=str.split('\n').filter(l=>l.startsWith('data: ')).map(l=>JSON.parse(l.slice(6)));
  const fail=events.find(e=>e.kind==='error');
  assert.equal(fail,undefined,JSON.stringify(fail));
  const done=events.find(e=>e.kind==='done');
  assert(done, 'Expected done event');
  assert.equal(done.mode,'live');
  assert.equal(done.reviewStatus?.publicationReady,false);
  assert.ok(done.reviewStatus?.factGuard?.some(x => x.unsupported.includes('5 W')),
    'Expected hardcoded unverified panel wattage to be withheld');
  assert.ok(done.reviewStatus?.factTrace?.every(x => x.independentlyVerified === false),
    'A built-in demo specification must not be presented as independent evidence');
  assert.doesNotMatch(done.pages[0].html,/1,500 cycles|5 W monocrystalline/i);
  assert.equal(done.outlineSource,'llm');
  assert.equal(done.copySources?.[0]?.source,'llm');
  assert.equal(calls,3);
  assert.deepEqual(done.tokenUsage,{
    calls:3,failedCalls:0,callsWithoutUsage:0,promptTokens:60,completionTokens:30,
    totalTokens:90,cachedPromptTokens:9,complete:true,
  });
  console.log('PASS live pipeline usage collection',done.tokenUsage);
})().catch(e=>{console.error(e.stack);process.exitCode=1});
