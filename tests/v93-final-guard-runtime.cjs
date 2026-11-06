/** Regression: apply final localization & claim gate to model-like DE content. */
const {test}=require('node:test');
const assert=require('node:assert/strict');
require('./ts-runtime-hook.cjs');
const {buildProductProfile}=require('../src/lib/product-profile-v9.ts');
const {renderSparseV9}=require('../src/lib/render-v9.ts');
const {inspectFinalPage,reviewMarketingCopy}=require('../src/lib/claim-engine-v9.ts');
const userPrompt='我们销售智能宠物喂食器，支持定时喂食和手机 App 控制，主要面向德国市场。';
const facts=buildProductProfile(userPrompt,[]);
const spec={market:'DE',locales:['de'],category:'general-product',topic:'智能宠物喂食器',intent:'landing-page',brandName:'Lumenvia',domain:'lumenvia.com',site:'de',slug:'smart-pet-feeder',title:'',metaDesc:'',userRequest:userPrompt};
const llmCopy={
 eyebrow:'定时喂食 · App-Steuerung',
 h1:'Fütterung nach Plan – auch wenn Sie unterwegs sind',
 sub:'Lumenvia verbindet zeitgesteuerte Mahlzeiten mit App-Kontrolle. So bleibt der Tagesablauf Ihres Tieres stabil.',
 seoTitle:'Lumenvia smarter Katzenfutterautomat mit App',
 seoDesc:'Lumenvia: zeitgesteuerte Fütterung und App-Kontrolle für Katzen und kleine Hunde. Ideal für Berufstätige und Wochenendausflüge.',
 scenes:[
  {h:'Morgenroutine vor der Arbeit',p:'Stellen Sie die erste Mahlzeit auf die übliche Weckzeit ein.'},
  {h:'Langer Bürotag',p:'Über die App können Sie eine zusätzliche Fütterung auslösen, wenn sich die Rückkehr verzögert.'},
  {h:'Wochenendausflug',p:'Planen Sie mehrere Mahlzeiten im Voraus und prüfen Sie den Status per App. Die Fütterung läuft weiter, ohne dass jemand zu Hause sein muss.'},
 ],
 faq:[
  {q:'Wie funktioniert die zeitgesteuerte Fütterung?',a:'Sie legen in der App oder am Gerät fest, zu welchen Uhrzeiten Mahlzeiten ausgegeben werden sollen.'},
  {q:'Kann ich die Fütterung auch von unterwegs auslösen?',a:'Ja, über die App können Sie eine zusätzliche Portion ausgeben, auch wenn Sie nicht zu Hause sind.'},
  {q:'Ist die App-Steuerung für mehrere Personen im Haushalt geeignet?',a:'Die App kann auf mehreren Smartphones installiert werden, sodass alle Haushaltsmitglieder die Fütterung verwalten können.'},
  {q:'Was passiert bei einem Stromausfall?',a:'Bei einem Ausfall werden geplante Mahlzeiten nicht ausgegeben. Prüfen Sie daher die Stromversorgung.'},
 ],
};
const render=(copy=llmCopy,other={})=>renderSparseV9({...spec,locale:'de',facts,copy,modules:['hero','specs','scenarios','faq','lead-form'],...other});

test('DE model-like output: all customer-visible CJK, cat-only title, unverified remote portion/status/multi-user claims are repaired',()=>{
 const before=JSON.stringify(facts);
 const result=render(); const html=result.html;
 assert.equal(JSON.stringify(facts),before);
 assert.match(html,/<html lang="de">/);
 assert.match(html,/Zeitgesteuerte Fütterung; Steuerung per App/);
 assert.doesNotMatch(html,/定时喂食|Katzenfutterautomat|kleine Hunde|zusätzliche (?:Fütterung|Portion)|mehreren Smartphones|Status per App|Stromausfall|ohne dass jemand zu Hause sein muss/iu);
 assert.equal(inspectFinalPage(html,facts,'de').length,0,JSON.stringify(inspectFinalPage(html,facts,'de')));
 const fixed=result.claims.filter(c=>c.action==='safe_rewrite');
 const withheld=result.claims.filter(c=>c.action==='withheld');
 assert(fixed.some(c=>c.fieldPath==='badge'));
 assert(fixed.some(c=>c.fieldPath==='seoDesc'));
 assert(fixed.some(c=>c.fieldPath==='seoTitle'));
 assert(fixed.some(c=>c.fieldPath==='scenes[1].p'));
 assert(withheld.some(c=>c.fieldPath==='faq[2].a'));
 assert(result.editorial.some(x=>x.action==='excluded_from_public_page'));
 const scripts=[...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map(m=>JSON.parse(m[1]));
 assert(scripts.length===2);
 assert(!scripts.some(x=>JSON.stringify(x).includes('mehreren Smartphones')));
 assert(scripts[1].mainEntity.length>0);
});
test('final-page audit detects unsafe live HTML if rendering gate is skipped',()=>{
 const raw='<html lang="de"><head><title>智能宠物喂食器</title><meta name="description" content="Für Katzen und kleine Hunde"></head><body><main>定时喂食 · App-Steuerung<p>Über die App können Sie eine zusätzliche Portion ausgeben.</p></main></body></html>';
 const issues=inspectFinalPage(raw,facts,'de');
 assert(issues.some(x=>x.includes('输出语言不一致')));
 assert(issues.some(x=>x.includes('远程追加喂食')));
});
test('explicit extra-serving product fact is preserved, but App control alone is not evidence',()=>{
 const unsupported=reviewMarketingCopy({sub:'Über die App können Sie eine zusätzliche Portion ausgeben.'},'de',facts,'general-product');
 assert(unsupported.claims.some(x=>x.action==='safe_rewrite'));
 const known=[...facts,{id:'F099',field:'feature',value:'zusätzliche Portion über App',sourceId:'user:fact:feature',sourceType:'user_entry',verification:'unreviewed'}];
 const supported=reviewMarketingCopy({sub:'Über die App können Sie eine zusätzliche Portion ausgeben.'},'de',known,'general-product');
 assert.equal(supported.copy.sub,'Über die App können Sie eine zusätzliche Portion ausgeben.');
});
test('non-feeder general products do not inherit pet-specific guard',()=>{
 const other=buildProductProfile('便携咖啡机，支持手机 App 控制',[]);
 const result=reviewMarketingCopy({sub:'Check status via the app.'},'en',other,'general-product');
 assert.equal(result.copy.sub,'Check status via the app.');
});
test('German and Spanish outputs reject Han script in model-generated user-visible fields',()=>{
 for(const locale of ['de','es']){
  const r=renderSparseV9({...spec,locale,locales:[locale],facts,copy:{eyebrow:'定时喂食',h1:'智能喂食器',sub:'用手机控制',seoTitle:'智能喂食器',seoDesc:'方便使用',scenes:[{h:'在家里',p:'可以使用'}],faq:[{q:'怎么用？',a:'没有信息'}]}});
  assert(!/[\u3400-\u9fff\u3040-\u30ff]/u.test(r.html));
  assert(!inspectFinalPage(r.html,facts,locale).length);
 }
});
