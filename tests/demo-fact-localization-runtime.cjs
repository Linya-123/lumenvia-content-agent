/** Presentation-only localization for the existing fictional demo specification. */
const {test}=require('node:test');
const assert=require('node:assert/strict');
require('./ts-runtime-hook.cjs');
const {localizeFactValue}=require('../src/lib/fact-localization-v92.ts');
const {renderSparseV9}=require('../src/lib/render-v9.ts');
const spec={market:'DE',locales:['de'],category:'outdoor-lighting',topic:'LumenGuard S20',intent:'landing-page',brandName:'Lumenvia',domain:'lumenvia.com',site:'de',slug:'lumenguard-s20',title:'',metaDesc:'',userRequest:'太阳能感应灯'};
const src=[
 ['model','Lumenvia LumenGuard S20 (fictional demonstration product)'],
 ['ip','IP65 (unverified demo specification; no test report supplied)'],
 ['battery','5200 mAh LiFePO4 (unverified demo specification)'],
 ['lumen','1100 lm, 4000 K (unverified demo specification)'],
 ['range','up to 12 m at 120 degrees, measured at 2 m mounting height (unverified demo specification)'],
 ['runtime','4–5 nights at about 8 activations/night (unverified demo specification)'],
 ['temp','-20 to 55 °C (unverified demo specification)'],
 ['install','approximately 20 min (unverified demo estimate)'],
 ['included','fixture, solar panel, 3 m cable, bracket, drilling template, quick-start guide (demo contents)'],
];
const facts=src.map(([field,value],i)=>({id:`F${i+1}`,field,value,sourceId:`user:fact:${field}`,sourceType:'user_entry',verification:'unreviewed'}));
test('DE renders known demo qualifiers and values consistently while retaining source facts',()=>{
 const before=JSON.stringify(facts);
 const {html,claims}=renderSparseV9({...spec,locale:'de',facts,copy:{},modules:['hero','specs','scenarios','faq']});
 assert.equal(JSON.stringify(facts),before);
 for(const phrase of ['fiktives Demonstrationsprodukt','ungeprüfte Demo-Angabe','bis zu 12 m bei 120°','4–5 Nächte bei ca. 8 Aktivierungen/Nacht','ca. 20 Min.','Leuchte, Solarpanel']) assert(html.includes(phrase),phrase);
 for(const phrase of ['unverified demo specification','fictional demonstration product','nights at about','approximately 20 min','fixture, solar panel']) assert(!html.includes(phrase),phrase);
 const ld=JSON.parse(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/.exec(html)[1]);
 assert(ld.additionalProperty.some(x=>x.name==='Akku' && x.value.includes('ungeprüfte Demo-Angabe')));
 assert.equal(ld.name,'Lumenvia LumenGuard S20 (fiktives Demonstrationsprodukt)');
 const audit=claims.find(x=>x.fieldPath==='productFacts.ip');
 assert(audit.original.includes('unverified demo specification'));
 assert(audit.final.includes('ungeprüfte Demo-Angabe'));
});
test('ES renders known demonstration qualifiers; unknown custom specifications remain unchanged',()=>{
 const known=localizeFactValue({field:'range',value:src[4][1]},'es');
 assert(known.fullyLocalized); assert(known.value.includes('hasta 12 m a 120°'));
 const other=localizeFactValue({field:'battery',value:'New proprietary HyperCharge X (not independently tested)'},'de');
 assert.equal(other.value,'New proprietary HyperCharge X (not independently tested)');
});
