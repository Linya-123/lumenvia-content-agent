/** Fix for leaked English canonical facts in German/Spanish exported pages. No API calls. */
const {test}=require('node:test');
const assert=require('node:assert/strict');
require('./ts-runtime-hook.cjs');
const {buildProductProfile}=require('../src/lib/product-profile-v9.ts');
const {renderSparseV9}=require('../src/lib/render-v9.ts');
const {localizeFactValue}=require('../src/lib/fact-localization-v92.ts');
const {resolveTaskLocales}=require('../src/lib/task-intake-v92.ts');
const prompt='我们销售智能宠物喂食器，支持定时喂食和手机 App 控制，主要面向德国市场。请生成产品营销网页。';
const facts=buildProductProfile(prompt,[]);
const spec={market:'DE',locales:['de'],category:'general-product',topic:'智能宠物喂食器',intent:'landing-page',brandName:'Lumenvia',domain:'lumenvia.com',site:'de',slug:'smart-pet-feeder',title:'',metaDesc:'',userRequest:prompt};
const render=(locale)=>renderSparseV9({...spec,locales:[locale],locale,facts,copy:{},modules:['hero','specs','scenarios','faq','lead-form']});

test('automatic DE market uses German unless user explicitly requests another language',()=>{
 assert.deepEqual(resolveTaskLocales('DE',prompt),['de']);
 assert.deepEqual(resolveTaskLocales('DE',prompt+'请使用英语'),['en']);
});
test('German feature field and fallback badge are fully localized, while facts remain canonical',()=>{
 const original=JSON.stringify(facts);
 const result=render('de');
 const html=result.html;
 assert.match(html,/<html lang="de">/);
 assert.match(html,/Zeitgesteuerte Fütterung; Steuerung per App/);
 assert.match(html,/Entdecken Sie den intelligenten Futterautomaten/);
 assert.doesNotMatch(html,/scheduled feeding|App control|Entdecken Sie Intelligenter Futterautomat/i);
 assert.equal(JSON.stringify(facts),original,'source product facts mutated');
 const feature=facts.find(x=>x.field==='feature');
 assert.equal(feature.value,'scheduled feeding; App control');
 const record=result.claims.find(x=>x.fieldPath==='productFacts.feature');
 assert.equal(record.original,feature.value);
 assert.equal(record.final,'Zeitgesteuerte Fütterung; Steuerung per App');
 assert.equal(record.factIds[0],feature.id);
});
test('German JSON-LD product features have localized display values',()=>{
 const html=render('de').html;
 const script=/<script type="application\/ld\+json">([\s\S]*?)<\/script>/.exec(html);
 assert(script);
 const schema=JSON.parse(script[1]);
 const item=schema.additionalProperty.find(x=>x.name==='Merkmal');
 assert(item);
 assert.equal(item.value,'Zeitgesteuerte Fütterung; Steuerung per App');
});
test('English page keeps English and correct locale behavior',()=>{
 const html=render('en').html;
 assert.match(html,/<html lang="en">/);
 assert.match(html,/scheduled feeding; App control/);
 assert.match(html,/Explore Smart Pet Feeder/);
});
test('Spanish page translates feature field and corrects headline',()=>{
 const html=render('es').html;
 assert.match(html,/<html lang="es">/);
 assert.match(html,/Alimentación programada; Control mediante aplicación/);
 assert.match(html,/Descubra el comedero inteligente para mascotas/);
 assert.doesNotMatch(html,/scheduled feeding|App control/);
});
test('source values: known lighting terms localized; unknown custom terms preserved, never guessed',()=>{
 assert.equal(localizeFactValue({field:'power_source',value:'solar powered'},'de').value,'Solarbetrieb');
 assert.equal(localizeFactValue({field:'scenario',value:'garage entrance, garden / yard'},'es').value,'Entrada del garaje, Jardín / patio');
 assert.deepEqual(localizeFactValue({field:'feature',value:'scheduled feeding; custom patent function'},'de'),{
   value:'Zeitgesteuerte Fütterung; custom patent function',fullyLocalized:false,
 });
 assert.equal(localizeFactValue({field:'battery',value:'5200mAh'},'de').value,'5200mAh');
});
test('real offline streaming DE request contains localized German product facts',async()=>{
 const {POST}=require('../src/app/api/run/route.ts');
 const raw={market:'DE',category:'outdoor-lighting',topic:'outdoor solar security lighting',prompt};
 const response=await POST(new Request('http://localhost/api/run',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(raw)}));
 assert.equal(response.status,200);
 const events=(await response.text()).split('\n').filter(x=>x.startsWith('data: ')).map(x=>JSON.parse(x.slice(6)));
 const done=events.find(x=>x.kind==='done');
 assert(done,'no page: '+JSON.stringify(events.filter(x=>x.kind==='error')));
 assert.equal(done.pages.length,1);
 assert.match(done.pages[0].html,/<html lang="de">/);
 assert.match(done.pages[0].html,/Zeitgesteuerte Fütterung; Steuerung per App/);
 assert.doesNotMatch(done.pages[0].html,/scheduled feeding|App control/i);
});
