/** Offline V8 validation: no npm dependencies, no API keys, no network. */
const {test}=require('node:test');
const assert=require('node:assert/strict');
require('./ts-runtime-hook.cjs');
const {getProductFacts,getBrandConfig}=require('../src/lib/brand.ts');
const {renderPage}=require('../src/lib/render.ts');
const {extractMeasurableClaims,unsupportedMetrics,auditRenderedMetrics,traceRenderedMetrics}=require('../src/lib/fact-guard.ts');
function fixture(locale, copy={}) {
  const facts=getProductFacts(locale,getBrandConfig());const issues=[];
  const html=renderPage({locale,market:locale==='en'?'US':locale==='de'?'DE':'ES',
    brandName:'Lumenvia',domain:'lumenvia.com',topic:'solar light',category:'outdoor-lighting',
    site:locale,slug:'solar-light',facts,copy,factGuardLog:issues});
  return {facts,issues,html};
}
for(const locale of ['en','de','es']) {
  test(`${locale}: unsupported template performance facts are removed from page AND FAQ JSONLD`,()=>{
    const {facts,issues,html}=fixture(locale);
    assert.ok(issues.length>=3,`${locale} should remove known template claims`);
    assert.deepEqual(auditRenderedMetrics(html,facts),[]);
    for(const unexpected of [/1[.,]500\s+(?:cycles|Zyklen|ciclos)/i, /\b5\s*[- ]?\s*W\b/i, /\b(?:19|20)\s*Wh\b/i])
      assert.doesNotMatch(html,unexpected);
    assert.match(html,/<\/html>$/);
    assert.match(html,/<script type="application\/ld\+json">/);
    assert.equal(traceRenderedMetrics(html,facts).some(x=>x.independentlyVerified),false);
    assert.equal(traceRenderedMetrics(html,facts).every(x=>x.factLabels.length>0),true);
  });
}
test('LLM numeric fabrication is withheld before page/FAQ JSON-LD rendering',()=>{
  const {facts,issues,html}=fixture('en',{
    h1:'A panel delivering 5 W power and 1,500 charging cycles',
    faq:[{q:'How much power?',a:'The panel outputs 20 Wh every day.'}],
    seoDesc:'A 5 W solar light',
  });
  assert.ok(issues.some(x=>x.field==='h1'));
  assert.ok(issues.some(x=>x.field==='faq[0].a'));
  assert.doesNotMatch(html,/20 Wh/);
  assert.deepEqual(auditRenderedMetrics(html,facts),[]);
});
test('Authorized product metrics remain in English and locale-specific forms',()=>{
  for(const [locale,phrase] of [['en','12 m'],['de','12 m'],['es','12 m']]){
    const {html}=fixture(locale);
    assert.ok(html.includes(phrase));
  }
  const facts=getProductFacts('en',getBrandConfig());
  assert.deepEqual(unsupportedMetrics('1100 lm, 5200 mAh, IP65, 4–5 nights',facts),[]);
});
test('Unit variations, hyphenation and ranges are normalized',()=>{
  const facts=getProductFacts('de',getBrandConfig());
  assert.deepEqual(unsupportedMetrics('120 Grad at 2 meters, 4 bis 5 Nächte',facts),[]);
  assert.deepEqual(unsupportedMetrics('5-W panel, 60–70 %, 1.500 Zyklen',facts),['5-W','60–70 %','1.500 Zyklen']);
  assert.ok(extractMeasurableClaims('5-W solar panel').some(x=>x.key==='5:w'));
});
