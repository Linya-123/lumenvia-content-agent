/** V9 local deterministic regression tests. No API key, no npm download. */
const {test}=require('node:test');
const assert=require('node:assert/strict');
require('./ts-runtime-hook.cjs');
const {buildProductProfile,validateSubmittedFacts,missingProductInfo}=require('../src/lib/product-profile-v9.ts');
const {reviewMarketingCopy,inspectFinalPage}=require('../src/lib/claim-engine-v9.ts');
const {renderSparseV9}=require('../src/lib/render-v9.ts');
const {validateRunRequest}=require('../src/lib/request-validation.ts');
const base={market:'US',locales:['en'],category:'outdoor-lighting',topic:'solar motion lighting for garage',intent:'landing-page',brandName:'Lumenvia',domain:'lumenvia.com',site:'en',slug:'product',title:'',metaDesc:''};

test('V9 accepts a sparse task and never silently loads synthetic demo metrics',()=>{
  const f=buildProductProfile('请做一款美国车库太阳能感应灯的营销页',[]);
  assert(f.length>=2);
  assert(!f.some(x=>/5200|1100|IP65|LumenGuard/.test(x.value)));
  const out=renderSparseV9({...base,locale:'en',facts:f});
  assert.match(out.html,/<!DOCTYPE html>/);
  for(const x of ['IP65','5200 mAh','1100 lm','1500 cycles','5 W'])assert.doesNotMatch(out.html,new RegExp(x,'i'));
  assert(out.claims.every(c=>c.independentVerification===false));
});

test('V9 field-level repair preserves safe sentences before and after unsupported numbers',()=>{
  const f=buildProductProfile('solar lighting for garage',[]);
  const {copy,claims}=reviewMarketingCopy({sub:'Solar lighting for your home. The panel generates 5 W each day. Consider it for outdoor entrances.'},'en',f);
  assert.match(copy.sub,/Solar lighting for your home/);
  assert.match(copy.sub,/Consider it for outdoor entrances/);
  assert.doesNotMatch(copy.sub,/5 W/);
  assert(claims.some(c=>c.action==='safe_rewrite'&&c.original.includes('5 W')));
});

test('V9 detects matching number used in wrong semantic field',()=>{
  const f=buildProductProfile('solar lighting', [{field:'range',value:'12 m detection distance'}]);
  const {copy,claims}=reviewMarketingCopy({h1:'The power cable is 12 m long.'},'en',f);
  assert.doesNotMatch(copy.h1,/12 m/);
  assert(claims.some(c=>c.action==='safe_rewrite'));
});

test('V9 supports direct user evidence linkage but does not call it independently verified',()=>{
  const f=buildProductProfile('motion sensor lighting',[{field:'battery',value:'5200 mAh LiFePO4'}, {field:'ip',value:'IP65'}]);
  const result=renderSparseV9({...base,locale:'en',facts:f,copy:{h1:'An IP65 outdoor light',faq:[{q:'Battery?',a:'5200 mAh LiFePO4 battery.'}]}});
  assert.match(result.html,/5200 mAh/);assert.match(result.html,/IP65/);
  assert(result.claims.some(c=>c.sourceIds.includes('user:fact:battery')));
  assert(!result.claims.some(c=>c.independentVerification));
});

test('V9 has locale-aware repairs for German and Spanish',()=>{
  for(const locale of ['de','es']){
    const f=buildProductProfile('solar motion sensor',[]);
    const {html}=renderSparseV9({...base,site:locale,locale, facts:f,copy:{h1:'5 W solar panel',faq:[{q:'Battery?',a:'1500 cycles.'}]}});
    assert.doesNotMatch(html,/>5 W solar panel</);
    assert.doesNotMatch(html,/1500 cycles/);
    assert.match(html,new RegExp(`<html lang="${locale}"`));
  }
});

test('V9 rejects injected fields, forged verification and oversized product facts',()=>{
  assert.throws(()=>validateSubmittedFacts([{field:'certification_verified',value:'true'}]));
  assert.throws(()=>validateSubmittedFacts([{field:'battery',value:'a'},{field:'battery',value:'b'}]));
  assert.throws(()=>validateSubmittedFacts(Array.from({length:26},()=>({field:'model',value:'x'}))));
  const valid=validateRunRequest({market:'US',productFacts:[{field:'ip',value:'IP65',verified:true}]});
  assert.deepEqual(valid.productFacts,[{field:'ip',value:'IP65'}]);
});

test('Missing documentation remains separate from the rendered page',()=>{
  const f=buildProductProfile('solar light',[{field:'ip',value:'IP65'}]);
  assert(missingProductInfo(f).some(x=>x.field==='cert'));
  const page=renderSparseV9({...base,locale:'en',facts:f});
  assert.doesNotMatch(page.html,/产品亮度|认证\/合规文件/);
});

test('HTML escapes user content, including JSON-LD script injection',()=>{
  const f=buildProductProfile('solar light',[{field:'model',value:'<script>alert(1)</script>'}]);
  const {html}=renderSparseV9({...base,locale:'en',facts:f});
  assert(!html.includes('<script>alert(1)</script>'));
  assert(html.includes('&lt;script&gt;'));
  assert(html.includes('\\u003cscript'));
});

// API-level SSE test with fully offline LLM (stub)
const {POST}=require('../src/app/api/run/route.ts');
async function execute(data){
 const res=await POST(new Request('http://localhost/api/run',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(data)}));
 const response=await res.text();
 return {res,events:response.split('\n').filter(x=>x.startsWith('data: ')).map(x=>JSON.parse(x.slice(6)))};
}
test('End-to-end V9 sparse request emits profile, missing info and review status with no invented values',async()=>{
 const {res,events}=await execute({...base, prompt:'请帮我为美国车库生成太阳能感应灯营销网页',productFacts:[]});
 assert.equal(res.status,200);
 const done=events.find(e=>e.kind==='done');
 assert(done,'SSE done event missing: '+JSON.stringify(events.filter(e=>e.kind==='error')));
 assert(done.reviewStatus?.profile?.length>0);
 assert(done.reviewStatus?.missingInfo?.length>0);
 assert.equal(done.reviewStatus.publicationReady,false);
 assert(!/5200 mAh|1100 lm|IP65|LumenGuard S20/i.test(done.pages?.[0]?.html??''));
});

test('V9 tracks qualitative solar and motion claims to exact request facts',()=>{
  const f=buildProductProfile('太阳能人体感应灯',[]);
  const {claims,copy}=reviewMarketingCopy({sub:'Solar-powered motion sensor lighting.'},'en',f);
  assert.equal(copy.sub,'Solar-powered motion sensor lighting.');
  assert.equal(claims[0].action,'retained');
  assert(claims[0].sourceIds.includes('user:prompt'));
  const missing=buildProductProfile('户外照明',[]);
  const result=reviewMarketingCopy({sub:'Solar-powered motion sensor lighting.'},'en',missing);
  assert.doesNotMatch(result.copy.sub,/Solar-powered motion sensor/i);
  assert.equal(result.claims[0].action,'safe_rewrite');
});
