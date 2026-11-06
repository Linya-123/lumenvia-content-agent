/** Local, offline checks for V9.1 marketing copy refinement. */
const {test}=require('node:test');
const assert=require('node:assert/strict');
require('./ts-runtime-hook.cjs');
const {buildProductProfile}=require('../src/lib/product-profile-v9.ts');
const {renderSparseV9}=require('../src/lib/render-v9.ts');
const {inspectFinalPage}=require('../src/lib/claim-engine-v9.ts');
const {groundedEditorial}=require('../src/lib/grounded-marketing-v91.ts');
const base={market:'US',locales:['en'],category:'outdoor-lighting',topic:'solar motion sensor light for garage entrance',intent:'landing-page',brandName:'Lumenvia',domain:'lumenvia.com',site:'en',slug:'solar',title:'',metaDesc:''};
const facts=()=>buildProductProfile('请为车库入口的太阳能人体感应灯写英文落地页',[]);
function getTitle(html){return /<h1>([^<]*)<\/h1>/.exec(html)?.[1]??'';}
function getDesc(html){return /<meta name="description" content="([^"]*)"/.exec(html)?.[1]??'';}

// Zero-token fallback should still use user-supplied features rather than a generic category label.
test('sparse-input template produces product-specific hero, SEO, and 3 useful scenes',()=>{
  const f=facts();
  const {html,editorial}=renderSparseV9({...base,locale:'en',facts:f,copy:{}});
  assert.match(getTitle(html),/Solar motion lighting for your garage entrance/);
  assert.match(getDesc(html),/solar motion lighting/);
  assert.match(html,/<div class="kicker">Solar-powered · Motion sensing · Garage entrance<\/div>/);
  assert.equal((html.match(/<article class="use">/g)||[]).length,3);
  assert.match(html,/Positioning for daylight/);
  assert.match(html,/Planning for movement/);
  assert(!html.includes('5200 mAh'));
  assert(!html.includes('IP65'));
  assert.deepEqual(inspectFinalPage(html,f),[]);
  assert(editorial.some(e=>e.action==='added_grounded_scene'));
});

test('creative model headline and scene stay intact when not making extra claims',()=>{
  const f=facts();
  const creative={h1:'Make the approach to your garage feel more considered',sub:'Explore solar-powered motion sensing near your garage entrance.',
    scenes:[{h:'A smarter route home',p:'Think about the path between the driveway and the door.'},
            {h:'Plan the placement',p:'Consider how the entrance is used after dusk.'},
            {h:'Choose the position',p:'Review installation instructions for the actual fixture.'}],
    seoTitle:'Ideas for solar motion lighting at the garage',seoDesc:'Discover solar-powered motion sensing for garage entrances.'};
  const {html}=renderSparseV9({...base,locale:'en',facts:f,copy:creative});
  assert.equal(getTitle(html),creative.h1);
  assert(html.includes('A smarter route home'));
  assert.equal((html.match(/<article class="use">/g)||[]).length,3);
  assert.deepEqual(inspectFinalPage(html,f),[]);
});

test('generic V9.1 headline, SEO, and one generic scene are upgraded without extra facts',()=>{
  const f=facts();
  const {html,editorial}=renderSparseV9({...base,locale:'en',facts:f,copy:{
    h1:'Lighting for the spaces around your home',sub:'Explore outdoor lighting for entrances, paths and the everyday moments that matter.',
    eyebrow:'Outdoor lighting', seoTitle:'Lighting for the spaces around your home',
    seoDesc:'Explore outdoor lighting for entrances, paths and the everyday moments that matter.',
    scenes:[{h:'Outdoor entrances',p:'Explore outdoor lighting for entrances, paths and the everyday moments that matter.'}],
  }});
  assert.match(getTitle(html),/Solar motion lighting for your garage entrance/);
  assert.equal((html.match(/<article class="use">/g)||[]).length,3);
  assert(!html.includes('Lighting for the spaces around your home'));
  assert(editorial.some(e=>e.action==='grounded_fallback_copy'));
  assert.deepEqual(inspectFinalPage(html,f),[]);
});

test('unsafe 5W product claim is removed but page remains useful',()=>{
  const f=facts();
  const {html,claims}=renderSparseV9({...base,locale:'en',facts:f,copy:{
    h1:'Our 5 W solar panel provides guaranteed illumination',
    scenes:[{h:'Garage entrance',p:'A 5 W panel guarantees all-night lighting for a garage entrance.'}],
  }});
  assert(!/5\s*W|guaranteed|all-night lighting/i.test(html));
  assert.match(getTitle(html),/Solar motion lighting/);
  assert.equal((html.match(/<article class="use">/g)||[]).length,3);
  assert(claims.some(x=>x.action==='safe_rewrite'));
  assert.deepEqual(inspectFinalPage(html,f),[]);
});

test('unsupported solar/motion are not invented from category or title',()=>{
  const f=buildProductProfile('室外照明，用于入口',[]);
  const fallback=groundedEditorial('en',f);
  assert(!/solar|motion/i.test(fallback.title));
  const {html}=renderSparseV9({...base,locale:'en',facts:f,copy:{}});
  assert(!/solar-powered|motion sensing/i.test(html));
  assert.deepEqual(inspectFinalPage(html,f),[]);
});

test('DE/ES fallbacks use localized grounded headlines without unprovided numbers',()=>{
  for(const locale of ['de','es']){
    const f=facts();
    const {html}=renderSparseV9({...base,locale,facts:f,copy:{}});
    assert.equal((html.match(/<article class="use">/g)||[]).length,3);
    assert(!/5200\s*mAh|1100\s*lm|IP65|5\s*W/.test(html));
    assert(!/Lighting for the spaces around your home/.test(html));
    assert.deepEqual(inspectFinalPage(html,f),[]);
  }
});
