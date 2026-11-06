/** V9.4 S8 visual delivery and narrowly scoped language leak regression. No network/API. */
const {test}=require('node:test');
const assert=require('node:assert/strict');
require('./ts-runtime-hook.cjs');
const {buildProductProfile}=require('../src/lib/product-profile-v9.ts');
const {renderSparseV9}=require('../src/lib/render-v9.ts');
const {inspectFinalPage}=require('../src/lib/claim-engine-v9.ts');
const prompt='我们销售智能宠物喂食器，支持定时喂食和手机 App 控制，主要面向德国市场。';
const facts=buildProductProfile(prompt,[]);
const spec={market:'DE',locales:['de'],category:'general-product',topic:'智能宠物喂食器',intent:'landing-page',brandName:'Lumenvia',domain:'lumenvia.com',site:'de',slug:'smart-pet-feeder',title:'',metaDesc:'',userRequest:prompt};
function render(extra={}) {return renderSparseV9({...spec,locale:'de',facts,modules:['hero','scenarios','specs','faq','lead-form'],...extra});}

test('S8 pet page has responsive illustrated hero, real FAQ toggle and navigation, while retaining schema',()=>{
 const {html}=render();
 assert.match(html,/<section class="hero" id="hero">/);
 assert.match(html,/<div class="hero-art hero-art--pet"/);
 assert.match(html,/<svg viewBox="0 0 520 405"/);
 assert.match(html,/<nav class="nav"/);
 assert.match(html,/<details class="faq-item"><summary>/);
 assert.match(html,/@media\(max-width:760px\)/);
 assert.match(html,/prefers-reduced-motion:reduce/);
 assert.match(html,/aria-label=/);
 assert.match(html,/<dl class="specs">/);
 assert.equal([...html.matchAll(/<script type="application\/ld\+json">/g)].length,2);
 assert.equal(inspectFinalPage(html,facts,'de').length,0);
});

test('S3 ordering remains authoritative; not every module is inserted by visual template',()=>{
 const {html}=render({modules:['hero','faq','scenarios']});
 assert(html.indexOf('<section class="section" id="faq">')<html.indexOf('<section class="section" id="scenarios">'));
 assert(!html.includes('id="details"'));
 assert(!html.includes('id="contact"'));
 assert(!html.includes('href="#details"'));
});

test('German/Spanish/English get localized chrome and theme; no invented functional claims',()=>{
 for(const locale of ['en','de','es']){
  const html=renderSparseV9({...spec,locale,locales:[locale],facts,copy:{}}).html;
  assert(html.includes(`<html lang="${locale}"`));
  assert(!/well suited foreht|Katzenfutterautomat|multi-user|IP65/i.test(html));
  assert(html.includes('Schematische Illustration')=== (locale==='de'));
  assert(html.includes('Conceptual illustration')=== (locale==='en'));
  assert(html.includes('Ilustración conceptual')=== (locale==='es'));
  assert.equal(inspectFinalPage(html,facts,locale).length,0);
 }
 const other=buildProductProfile('便携咖啡机，支持手机 App 控制',[]);
 const generic=renderSparseV9({...spec,locale:'de',facts:other,category:'general-product',topic:'便携咖啡机'}).html;
 assert.match(generic,/theme-general/);
 assert.doesNotMatch(generic,/hero-art--pet/);
});

test('captured model-like corruption in live DE FAQ is withheld, including schema; audit remains available',()=>{
 const copy={
  h1:'Mit Lumenvia den Fütterungsalltag entspannter gestalten',
  sub:'Die intelligente Futterstation lässt sich per App steuern.',
  faq:[
   {q:'Wie funktioniert die zeitgesteuerte Fütterung?',a:'Die Fütterung kann im Voraus zeitlich festgelegt werden.'},
   {q:'Kann ich die Fütterung auch unterwegs steuern?',a:'Ja, über die App lässt sich die Fütterung bequem vom Smartphone aus steuern, solange eine Verbindung well suited foreht.'},
  ],
 };
 const {html,claims,editorial}=render({copy});
 assert.doesNotMatch(html,/well suited|foreht/iu);
 assert(claims.some(x=>x.original.includes('well suited foreht')&&x.action==='withheld'));
 assert(editorial.some(x=>x.action==='excluded_from_public_page'));
 assert.equal(inspectFinalPage(html,facts,'de').length,0);
 const ld=[...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map(m=>JSON.parse(m[1]));
 assert(!JSON.stringify(ld).includes('foreht'));
});

test('German does not incorrectly reject accepted product loanwords App and Smartphone',()=>{
 const {html}=render({copy:{h1:'Fütterung nach Plan',sub:'App-Steuerung per Smartphone für den Alltag mit Ihrem Haustier.'}});
 assert.match(html,/App-Steuerung per Smartphone/);
 assert.equal(inspectFinalPage(html,facts,'de').length,0);
});
