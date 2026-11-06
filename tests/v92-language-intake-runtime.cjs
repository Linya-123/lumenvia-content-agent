/** Targeted regression for user-discovered market/language/product bugs. */
const {test}=require('node:test');
const assert=require('node:assert/strict');
require('./ts-runtime-hook.cjs');
const {resolveTaskLocales,extractProductTopic,localizedProductName}=require('../src/lib/task-intake-v92.ts');
const {validateRunRequest}=require('../src/lib/request-validation.ts');
const {buildProductProfile}=require('../src/lib/product-profile-v9.ts');
const {renderSparseV9}=require('../src/lib/render-v9.ts');
const pet='我们销售智能宠物喂食器，支持定时喂食和手机 App 控制，主要面向德国市场。请生成英文营销网页，重点突出日常喂食和远程控制。';

test('DE market + explicit English request selects en, not de',()=>{
 assert.deepEqual(resolveTaskLocales('DE',pet),['en']);
 assert.deepEqual(validateRunRequest({market:'DE',prompt:pet,category:'general-product',topic:'智能宠物喂食器'}).locales,['en']);
});
test('explicit UI language overrides prompt and market, EU keeps trilingual default',()=>{
 assert.deepEqual(resolveTaskLocales('DE',pet,'de'),['de']);
 assert.deepEqual(resolveTaskLocales('US','请生成德语网页'),['de']);
 assert.deepEqual(resolveTaskLocales('ES','Quiero una página en English'),['en']);
 assert.deepEqual(resolveTaskLocales('DE','Create an English landing page for the German market'),['en']);
 assert.deepEqual(resolveTaskLocales('ES','Create an English landing page for the Spanish market'),['en']);
 assert.deepEqual(resolveTaskLocales('EU','新产品页面'),['en','de','es']);
 assert.deepEqual(resolveTaskLocales('US','英文德语西班牙语三个版本'),['en','de','es']);
});
test('product extractor does not pass full Chinese instruction into the public title',()=>{
 assert.equal(extractProductTopic(pet),'智能宠物喂食器');
 assert.equal(extractProductTopic('我们销售便携式咖啡机，适合旅行和办公室使用，支持快速冲泡。'),'便携式咖啡机');
 assert.equal(extractProductTopic('请帮我为美国市场生成智能宠物喂食器英文营销页，支持定时喂食和手机App控制'),'智能宠物喂食器');
 assert.equal(extractProductTopic('我们销售智慧农业温室控制器，支持温湿度监测，请为德国市场生成英文营销网页'),'智慧农业温室控制器');
 assert.equal(localizedProductName('智能宠物喂食器','en'),'Smart Pet Feeder');
});
test('mixed Chinese and Latin-space App control is captured alongside scheduled feeding',()=>{
 const facts=buildProductProfile(pet,[]);
 const feature=facts.find(f=>f.field==='feature');
 assert(feature);
 assert(feature.value.includes('scheduled feeding'));
 assert(feature.value.includes('App control'));
 assert.equal(feature.sourceId,'user:prompt');
});
test('offline final HTML for German market in English preserves both features and localized short name',()=>{
 const facts=buildProductProfile(pet,[]);
 const spec={market:'DE',locales:['en'],category:'general-product',topic:extractProductTopic(pet),intent:'landing-page',brandName:'Lumenvia',domain:'lumenvia.com',site:'en',slug:'smart-pet-feeder',title:'',metaDesc:'',userRequest:pet};
 const page=renderSparseV9({...spec,locale:'en',facts,copy:{},modules:['hero','specs','scenarios','faq','lead-form']});
 assert.match(page.html,/<html lang="en">/);
 assert.match(page.html,/Smart Pet Feeder/);
 assert.match(page.html,/scheduled feeding; App control/);
 assert(!page.html.includes(pet));
 assert(!page.html.includes('Entdecken Sie 我们'));
 assert(!/Solar Motion Light|garage entrance|5200mAh|IP65|solar panel/i.test(page.html));
});
test('real request API responds en page to DE-market English chat without changing facts',async()=>{
 const {POST}=require('../src/app/api/run/route.ts');
 const raw={market:'DE',locales:['en'],category:'outdoor-lighting',topic:'outdoor solar security lighting',prompt:pet};
 const response=await POST(new Request('http://localhost/api/run',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(raw)}));
 assert.equal(response.status,200);
 const events=(await response.text()).split('\n').filter(l=>l.startsWith('data: ')).map(l=>JSON.parse(l.slice(6)));
 const done=events.find(e=>e.kind==='done');
 assert(done,'pipeline error '+JSON.stringify(events.filter(e=>e.kind==='error')));
 const s0=events.find(e=>e.kind==='stage'&&e.stage===0&&e.status==='ok');
 assert.equal(s0.detail.market,'DE');
 assert.deepEqual(s0.detail.locales,['en']);
 assert.equal(s0.detail.category,'general-product');
 assert.equal(s0.detail.topic,'智能宠物喂食器');
 const html=done.pages[0].html;
 assert.match(html,/<html lang="en">/);
 assert.match(html,/Smart Pet Feeder/);
 assert.match(html,/scheduled feeding; App control/);
 assert(!html.includes(pet));
 assert(!/outdoor solar security lighting|LumenGuard|5200mAh|IP65/i.test(html));
});
