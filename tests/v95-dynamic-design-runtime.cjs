/** V9.5 autonomous design planning regression: fully offline, no provider costs. */
const {test}=require('node:test');
const assert=require('node:assert/strict');
require('./ts-runtime-hook.cjs');
const {normalizeDesignPlan,fallbackDesignPlan,adaptiveDesignCss}=require('../src/lib/design-planner-v95.ts');
const {renderSparseV9}=require('../src/lib/render-v9.ts');
const {buildProductProfile}=require('../src/lib/product-profile-v9.ts');
const {inspectFinalPage}=require('../src/lib/claim-engine-v9.ts');
const prompt='我们销售智能宠物喂食器，支持定时喂食和手机 App 控制，主要面向德国市场。';
const facts=buildProductProfile(prompt,[]);
const spec={market:'DE',locales:['de'],category:'general-product',topic:'智能宠物喂食器',intent:'landing-page',brandName:'Lumenvia',domain:'lumenvia.com',site:'de',slug:'smart-pet-feeder',title:'',metaDesc:'',userRequest:prompt};
const make=(plan)=>renderSparseV9({...spec,locale:'de',facts,modules:['hero','scenarios','specs','faq','lead-form'],designPlan:plan});
const standard={palette:{ink:'#183A32',accent:'#216A54',background:'#F8F7F1',surface:'#FFFFFF',muted:'#53675E'}};
test('two designer decisions produce different compositions for exactly the same verified product facts',()=>{
 const a=normalizeDesignPlan({...standard,hero:'centered',visual:'typographic',scenarios:'timeline',faq:'stacked',typography:'editorial',corners:'square'},'llm');
 const b=normalizeDesignPlan({...standard,hero:'poster',visual:'geometric',scenarios:'feature-first',facts:'table',faq:'columns',typography:'modern',corners:'rounded'},'llm');
 const ra=make(a),rb=make(b);
 assert.match(ra.html,/hero-v95--centered/);
 assert.match(ra.html,/visual-v95--typographic/);
 assert.match(ra.html,/scenarios-v95--timeline/);
 assert.match(rb.html,/hero-v95--poster/);
 assert.match(rb.html,/visual-v95--geometric/);
 assert.match(rb.html,/scenarios-v95--feature-first/);
 assert.match(rb.html,/facts-v95--table/);
 assert.notEqual(ra.html,rb.html);
 for(const r of [ra,rb]){
  assert.match(r.html,/Zeitgesteuerte Fütterung; Steuerung per App/);
  assert.equal(inspectFinalPage(r.html,facts,'de').length,0);
  assert.equal((r.html.match(/<script type="application\/ld\+json">/g)||[]).length,2);
 }
});
test('malicious model-supplied CSS, markup, JS and invalid enum values cannot enter output',()=>{
 const bad=normalizeDesignPlan({...standard,hero:'<script>alert(1)</script>',visual:'geometric',palette:{...standard.palette,accent:'red;}</style><script>alert(1)</script>'},extra:'<script>alert(1)</script>'},'llm');
 assert.equal(bad.hero,'split');
 assert.equal(bad.palette.accent,'#236B53');
 const html=make(bad).html;
 assert(!html.includes('alert(1)'));
 assert(!html.includes('red;}</style>'));
});
test('offline designers are deterministic, category independent, and still vary among product inputs',()=>{
 const a=fallbackDesignPlan('DE:智能宠物喂食器');
 const b=fallbackDesignPlan('DE:便携咖啡机');
 assert.deepEqual(a,fallbackDesignPlan('DE:智能宠物喂食器'));
 assert.notDeepEqual(a,b);
 assert.equal(a.source,'fallback');
 assert(adaptiveDesignCss(a).includes('color-mix'));
});
test('invalid bright accent is darkened and the design has responsive variants',()=>{
 const d=normalizeDesignPlan({...standard,hero:'reverse',palette:{...standard.palette,accent:'#FFE000'}},'llm');
 assert.notEqual(d.palette.accent,'#FFE000');
 assert.match(adaptiveDesignCss(d),/max-width:760px/);
 assert.match(make(d).html,/hero-v95--reverse/);
});
