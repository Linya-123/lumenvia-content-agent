/** V9.1 deterministic tests: no DeepSeek calls, no secret, no npm dependency. */
const {test}=require('node:test');
const assert=require('node:assert/strict');
require('./ts-runtime-hook.cjs');
const {buildProductProfile,missingProductInfo}=require('../src/lib/product-profile-v9.ts');
const {choosePublicFAQ}=require('../src/lib/content-select-v91.ts');
const {renderSparseV9}=require('../src/lib/render-v9.ts');
const {POST}=require('../src/app/api/run/route.ts');
const base={market:'US',locales:['en'],category:'outdoor-lighting',topic:'solar motion sensor light for a garage entrance',intent:'landing-page',brandName:'Lumenvia',domain:'lumenvia.com',site:'en',slug:'product',title:'',metaDesc:''};
const f=()=>buildProductProfile('太阳能人体感应灯，用于车库入口',[]);
const inputFAQ=[
  {q:'Where should I mount it for a garage entrance?',a:'Consider the approach path and the mounting instructions for the chosen light.'},
  {q:'How much light does it actually give off?',a:'Light output in lm is not listed in the product facts provided here, so ask the supplier.'},
  {q:'How long does it run on a full charge?',a:'Battery and runtime figures are not confirmed here. Request the information from the supplier.'},
  {q:'Is it rated for rain and cold?',a:'The IP rating and temperature range are not provided.'},
];
test('V9.1 filters unanswered specification questions, preserving useful creative FAQ',()=>{
  const out=choosePublicFAQ({locale:'en',facts:f(),generated:inputFAQ});
  assert.equal(out.faq.length,4);
  assert.equal(out.faq[0].q,inputFAQ[0].q);
  assert.equal(out.decisions.filter(x=>x.action==='excluded_from_public_page').length,3);
  assert.equal(out.decisions.filter(x=>x.action==='added_grounded_faq').length,3);
  assert(!out.faq.some(x=>/how much light|how long does|rated for rain/i.test(x.q)));
});

test('V9.1 renders real V9 FAQ scenario without missing-info content on public HTML',()=>{
  const facts=f();
  const {html,editorial}=renderSparseV9({...base,locale:'en',facts,copy:{
    h1:'Light the garage entrance before you reach the door',
    sub:'Solar-powered motion sensing for garage entrances.',
    faq:inputFAQ,
    scenes:[{h:'Garage entrance',p:'Plan lighting for a garage entrance.'}],
  }});
  assert.match(html,/<html lang="en">/);
  assert.match(html,/Light the garage entrance/);
  assert.match(html,/Where should I mount/);
  for(const fragment of ['How much light does it actually give off?', 'How long does it run on a full charge?', 'Is it rated for rain and cold?', 'not listed in the product facts'])assert(!html.includes(fragment),fragment);
  assert.match(html,/<meta name="robots" content="noindex,nofollow">/);
  assert.match(html,/<section class="section" id="faq">/);
  assert.match(html,/href="#details"/);
  assert.match(html,/id="scenarios"/);
  assert.equal(editorial.filter(x=>x.action==='excluded_from_public_page').length,3);
  assert(missingProductInfo(facts).some(x=>x.field==='lumen'));
  assert.doesNotMatch(html,/5200 mAh|IP65|1100 lm/);
});

test('V9.1 supports very sparse prompts with working navigation and no empty spec block',()=>{
  const {html}=renderSparseV9({...base,locale:'en',facts:[],copy:{h1:'Lighting options for outdoor entrances'}});
  assert.doesNotMatch(html,/<dl class="specs">/);
  assert.match(html,/href="#scenarios"/);
  assert.match(html,/href="#faq"/);
  assert.doesNotMatch(html, /Only product details provided|Additional specifications can be supplied later/i);
});

test('V9.1 retains supported specification FAQ when explicit user fact exists',()=>{
  const facts=buildProductProfile('太阳能感应灯', [{field:'lumen',value:'1100 lm at 4000 K'}]);
  const answer='The light output is 1100 lm at 4000 K.';
  const {html,editorial}=renderSparseV9({...base,locale:'en',facts,copy:{faq:[{q:'How bright is it?',a:answer}]}});
  assert(html.includes('How bright is it?'));
  assert(html.includes('1100 lm'));
  assert(!editorial.some(x=>x.action==='excluded_from_public_page' && x.question==='How bright is it?'));
});

test('V9.1 creates natural localized fallback FAQs for DE and ES',()=>{
  for(const locale of ['de','es']){
    const {html,editorial}=renderSparseV9({...base,locale,facts:f(),copy:{faq:[{
      q:locale==='de'?'Welche Helligkeit?':'¿Cuál es el brillo?',
      a:locale==='de'?'Nicht angegeben.':'No se ha confirmado.',
    }]}});
    assert(html.includes(`<html lang="${locale}"`));
    assert(editorial.some(x=>x.action==='excluded_from_public_page'));
    assert(!/Nicht angegeben|No se ha confirmado/.test(html));
    assert(!/5 W|5200 mAh|IP65/.test(html));
  }
});

test('V9.1 does not render fake working contact forms or claims of sending requests',()=>{
  const {html}=renderSparseV9({...base,locale:'en',facts:f(),copy:{}});
  assert(!html.includes('<form'));
  assert(!/request.*sent|we will send/i.test(html));
  assert(!html.includes('Demo form only'));
});

const eventsFrom=async(data)=>{
 const res=await POST(new Request('http://localhost/api/run',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(data)}));
 return (await res.text()).split('\n').filter(x=>x.startsWith('data: ')).map(x=>JSON.parse(x.slice(6)));
};
test('V9.1 offline end-to-end exposes editorial trace and synced SEO description',async()=>{
 const events=await eventsFrom({...base,prompt:'为车库入口生成太阳能人体感应灯网页'});
 const done=events.find(x=>x.kind==='done');
 assert(done,JSON.stringify(events.filter(x=>x.kind==='error')));
 assert(Array.isArray(done.reviewStatus.editorial));
 assert(done.reviewStatus.editorial.length>=1);
 const page=done.pages[0];
 const title=/<meta name="description" content="([^"]*)"/.exec(page.html);
 assert(title);
 assert.equal(page.metaDesc,title[1]);
 assert.equal(done.reviewStatus.publicationReady,false);
 assert(!page.html.includes('Demo form only'));
});
