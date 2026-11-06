/** V9.2: offline end-to-end checks for dynamic S2, S3→HTML, arbitrary products, fact capture. */
const {test}=require('node:test');
const assert=require('node:assert/strict');
require('./ts-runtime-hook.cjs');
const {buildProductProfile,missingProductInfo}=require('../src/lib/product-profile-v9.ts');
const {validateRunRequest}=require('../src/lib/request-validation.ts');
const {stage2Topic,stage3Outline}=require('../src/lib/pipeline.ts');
const {renderSparseV9}=require('../src/lib/render-v9.ts');
const spec=(topic,category='general-product')=>({market:'US',locales:['en'],category,topic,intent:'landing-page',brandName:'Lumenvia',domain:'lumenvia.com',site:'en',slug:'product',title:'',metaDesc:'',userRequest:topic});
test('text facts: IP, brightness, battery are captured and marked unverified',()=>{
 const p=buildProductProfile('太阳能感应灯 IP65，亮度1000lm，电池5200mAh，用于车库',[]);
 for(const field of ['ip','lumen','battery','power_source','motion_sensor'])assert(p.some(f=>f.field===field),field);
 assert(p.every(f=>f.sourceType==='prompt_explicit'&&f.verification==='unreviewed'));
 assert(!missingProductInfo(p).some(x=>['ip','lumen','battery'].includes(x.field)));
});
test('product description entry supports other categories and avoids lighting-only missing fields',()=>{
 const validated=validateRunRequest({market:'DE',category:'pet-feeder',topic:'智能宠物喂食器',prompt:'支持定时喂食'});
 assert.equal(validated.category,'pet-feeder');
 const facts=buildProductProfile('支持定时喂食',[]);
 const missing=missingProductInfo(facts,'pet-feeder');
 assert(!missing.some(x=>['lumen','ip','range','runtime'].includes(x.field)));
});
test('S2 no CSV creates topic-specific analysis rather than solar demand numbers',async()=>{
 const d=await stage2Topic(spec('portable coffee maker'),undefined,[]);
 assert.equal(d.decision.topic,'portable coffee maker');
 assert.equal(d.decision.source,'offline_heuristic');
 assert(!/21%|曝光占比|缺口比/.test(JSON.stringify(d.decision)));
 assert(d.decision.focusAreas.some(x=>x.includes('portable coffee maker')));
});
test('S2 ignores unrelated CSV row rather than substituting its topic',async()=>{
 const rows=[{market:'US',topic:'solar security lights',impressions:90,pageCount:1},{market:'US',topic:'garden bulbs',impressions:10,pageCount:20}];
 const d=await stage2Topic(spec('pet feeder'),rows,[]);
 assert.equal(d.decision.topic,'pet feeder');
 assert.equal(d.decision.source,'offline_heuristic');
 assert(!/21%|90%/.test(d.decision.reason));
});
test('S2 matching uploaded CSV can compute actual topic priority',async()=>{
 const rows=[{market:'US',topic:'pet feeder',impressions:90,pageCount:1},{market:'US',topic:'dog beds',impressions:10,pageCount:20}];
 const d=await stage2Topic(spec('pet feeder'),rows,[]);
 assert.equal(d.decision.source,'uploaded_csv');
 assert.equal(d.decision.priority,'P0');
 assert(d.decision.evidence.some(x=>x.value==='90.0%'));
});
test('S3 fallback modules vary with provided data and feed renderer order',async()=>{
 const s=spec('smart pet feeder');
 const empty=await stage3Outline(s,[],undefined,undefined,0);
 const detailed=await stage3Outline(s,[],undefined,undefined,2);
 assert(!empty.outline.modules.includes('specs'));
 assert(detailed.outline.modules.includes('specs'));
 const facts=buildProductProfile('支持定时喂食',[]);
 const out=renderSparseV9({...s,locale:'en',facts,copy:{},modules:['hero','faq','scenarios']});
 assert(out.html.indexOf('id="faq"') < out.html.indexOf('id="scenarios"'));
 assert(!out.html.includes('id="details"'));
 const other=renderSparseV9({...s,locale:'en',facts,copy:{},modules:['hero','scenarios','faq']});
 assert(other.html.indexOf('id="faq"') > other.html.indexOf('id="scenarios"'));
});
test('pet feeder and coffee maker fallback must never render lighting-specific sections/FAQ',()=>{
 for(const topic of ['smart pet feeder','portable coffee machine']) {
  const s=spec(topic);const facts=buildProductProfile('产品特点请以提供资料为准',[]);
  const {html}=renderSparseV9({...s,locale:'en',facts,copy:{},modules:['hero','scenarios','faq','lead-form']});
  assert(html.includes(topic));
  assert(!/What makes a good location for a solar light|Outdoor lighting|IP65|5200 mAh|Solar motion lighting|garage door/iu.test(html),topic);
 }
});
test('other product: dynamic S2→S3→HTML offline pipeline completes without demo lighting data',async()=>{
 const {POST}=require('../src/app/api/run/route.ts');
 const data={market:'DE',locales:['de'],category:'smart-pet-feeder',topic:'智能宠物喂食器',prompt:'智能宠物喂食器支持定时喂食，请为德国市场生成营销网页'};
 const response=await POST(new Request('http://localhost/api/run',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(data)}));
 assert.equal(response.status,200);
 const events=(await response.text()).split('\n').filter(x=>x.startsWith('data: ')).map(x=>JSON.parse(x.slice(6)));
 const d=events.find(x=>x.kind==='done');
 assert(d,'error: '+JSON.stringify(events.filter(x=>x.kind==='error')));
 assert.equal(d.pages.length,1);assert.equal(d.mode,'template');
 assert(!/solar|IP65|5200 mAh|Garage entrance|outdoor lighting/i.test(d.pages[0].html));
 assert.equal(d.reviewStatus?.publicationReady,false);
 assert(events.some(x=>x.kind==='stage'&&x.stage===2&&x.summary.includes('动态内容规划')));
 assert(events.some(x=>x.kind==='stage'&&x.stage===5&&x.summary==='一次通过'));
});
test('default lighting form values are not inherited when user chats about unrelated product',async()=>{
 const {POST}=require('../src/app/api/run/route.ts');
 const d={market:'US',locales:['en'],category:'outdoor-lighting',topic:'outdoor solar security lighting',prompt:'请帮我为美国市场生成智能宠物喂食器英文营销页，支持定时喂食和手机App控制'};
 const res=await POST(new Request('http://localhost/api/run',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(d)}));
 const events=(await res.text()).split('\n').filter(s=>s.startsWith('data: ')).map(s=>JSON.parse(s.slice(6)));
 const done=events.find(x=>x.kind==='done');assert(done,'no final page '+JSON.stringify(events.filter(x=>x.kind==='error')));
 assert(!/Solar Security Lighting|Outdoor lighting|garage entrance|solar motion|IP65/i.test(done.pages[0].html));
 const s0=events.find(x=>x.kind==='stage'&&x.stage===0&&x.status==='ok');
 assert.equal(s0.detail.category,'general-product');
 assert.equal(s0.detail.topic,'智能宠物喂食器');
 assert(done.reviewStatus.profile.some(f=>f.field==='feature'));
});
test('unfounded waterproof claim is safely rewritten for arbitrary categories',()=>{
 const {reviewMarketingCopy}=require('../src/lib/claim-engine-v9.ts');
 const facts=buildProductProfile('智能宠物喂食器',[]);
 const {copy,claims}=reviewMarketingCopy({sub:'Completely waterproof and safe in any weather.'},'en',facts,'general-product');
 assert(!/waterproof/i.test(copy.sub));
 assert(claims.some(c=>c.action==='safe_rewrite'));
});
