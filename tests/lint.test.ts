/**
 * 合规校验单元测试
 * 运行：npx tsx --test tests/lint.test.ts
 */
import { test } from 'node:test';
import assert from 'node:assert';
import { lintPage, extractText } from '../src/lib/lint';

const HTML = (body: string) =>
  `<html><head><title>Solar Security Lighting for Yard</title>
   <meta name="description" content="${'x'.repeat(60)}"></head>
   <body><h1>Title</h1>${body}
   <p>Demo product: supporting certification evidence is not verified.</p></body></html>`;

test('德语环境宣称最高级形式应被捕获', () => {
  const html = HTML('<p>Unsere umweltfreundlichste Außenleuchte.</p>');
  const v = lintPage({ locale: 'de', market: 'EU', bodyText: extractText(html), html });
  const hit = v.find((x) => x.ruleId === 'DE-UWG-5');
  assert.ok(hit, '未捕获 umweltfreundlichste，实际：' + JSON.stringify(v));
  assert.strictEqual(hit!.matched, 'umweltfreundlichste');
});

test('单纯声称 Prüfbericht 不构成已核验证据', () => {
  const html = HTML('<p>Unsere umweltfreundlichste Leuchte gemäß TÜV Prüfbericht.</p>');
  const v = lintPage({ locale: 'de', market: 'EU', bodyText: extractText(html), html });
  assert.ok(v.find((x) => x.ruleId === 'DE-UWG-5'));
});

test('英文最高级表述应被捕获', () => {
  const html = HTML('<p>This is the best light on the market.</p>');
  const v = lintPage({ locale: 'en', market: 'US', bodyText: extractText(html), html });
  assert.ok(v.find((x) => x.ruleId === 'FTC-SUPERLATIVE'));
});

test('西语绝对化表述应被捕获', () => {
  const html = HTML('<p>Calidad garantizado al 100%.</p>');
  const v = lintPage({ locale: 'es', market: 'ES', bodyText: extractText(html), html });
  assert.ok(v.find((x) => x.ruleId === 'ES-LEY3-1991'));
});

test('EU applies German rules only to German pages and Spanish rules only to Spanish pages', () => {
  const html = HTML('<p>umweltfreundlich und garantizado</p>');
  const de = lintPage({ locale: 'de', market: 'EU', bodyText: extractText(html), html });
  const es = lintPage({ locale: 'es', market: 'EU', bodyText: extractText(html), html });
  assert.ok(de.find((x) => x.ruleId === 'DE-UWG-5'));
  assert.equal(de.find((x) => x.ruleId === 'ES-LEY3-1991'), undefined);
  assert.ok(es.find((x) => x.ruleId === 'ES-LEY3-1991'));
  assert.equal(es.find((x) => x.ruleId === 'DE-UWG-5'), undefined);
});

test('不要求演示产品必须声称 CE 已认证', () => {
  const html = '<html><body><h1>X</h1><p>no cert here</p></body></html>';
  const v = lintPage({ locale: 'de', market: 'DE', bodyText: extractText(html), html });
  assert.equal(v.find((x) => x.ruleId === 'CE-DECLARATION'), undefined);
});

test('extractText 不应把行内标签切成段落', () => {
  const t = extractText('<p>Unsere <strong>umweltfreundlichste</strong> Leuchte</p>');
  assert.ok(t.includes('Unsere umweltfreundlichste Leuchte'), '实际：' + JSON.stringify(t));
});

test('豁免词不能被「nachhaltig」里的 nach 误触发', () => {
  const html = HTML('<p>Unsere umweltfreundlichste Außenleuchte – nachhaltig und klimaneutral.</p>');
  const v = lintPage({ locale: 'de', market: 'EU', bodyText: extractText(html), html });
  assert.ok(v.find((x) => x.ruleId === 'DE-UWG-5'), '被 nachhaltig 误豁免了');
});

test('真实渲染页面中的德语环境宣称应被捕获', () => {
  // 用真实渲染器生成的完整页面（含 style 块）验证，而不是手写片段
  const { renderPage } = require('../src/lib/render');
  const { getBrandConfig, getProductFacts } = require('../src/lib/brand');
  const b = getBrandConfig();
  const before = process.env.DEMO_INJECT_VIOLATION;
  process.env.DEMO_INJECT_VIOLATION = 'true';
  const html = renderPage({
    market: 'EU', locales: ['de'], category: 'outdoor-lighting', topic: 'x', intent: '',
    brandName: b.name, domain: b.domain, site: 'de', slug: 'x',
    title: 't', metaDesc: 'd', locale: 'de', facts: getProductFacts('de', b),
  });
  const v = lintPage({ locale: 'de', market: 'EU', bodyText: extractText(html), html });
  assert.ok(v.find((x) => x.ruleId === 'DE-UWG-5'), '真实页面未捕获，实际：' + v.map(x=>x.ruleId).join(','));
  if (before === undefined) delete process.env.DEMO_INJECT_VIOLATION;
  else process.env.DEMO_INJECT_VIOLATION = before;
});

test('不能把 2023/1670 当作照明能效法规引用', () => {
  const html = HTML('<p>Lighting label: Regulation EU 2023/1670</p>');
  const found = lintPage({locale:'en',market:'EU',bodyText:extractText(html),html});
  assert.ok(found.some(x => x.ruleId === 'INVALID-EU-LIGHTING-REG'));
});

test('没有认证证据的 CE certified 声明应拦截', () => {
  const html = HTML('<p>This model is CE certified.</p>');
  const found = lintPage({locale:'en',market:'EU',bodyText:extractText(html),html});
  assert.ok(found.some(x => x.ruleId === 'UNVERIFIED-CERT-CLAIM'));
});

test('百分数绝对化宣称应拦截', () => {
  const html = HTML('<p>100% guaranteed satisfaction.</p>');
  const found = lintPage({locale:'en',market:'US',bodyText:extractText(html),html});
  assert.ok(found.some(x => x.ruleId === 'FTC-SUPERLATIVE'));
});

test('普通德语演示页不包含错误法规及假定已认证声明', () => {
  const { renderPage } = require('../src/lib/render');
  const { getBrandConfig, getProductFacts } = require('../src/lib/brand');
  const before = process.env.DEMO_INJECT_VIOLATION;
  process.env.DEMO_INJECT_VIOLATION = 'false';
  try {
    const brand = getBrandConfig();
    const html = renderPage({
      market:'EU',locales:['de'],category:'outdoor-lighting',topic:'demo',intent:'',
      brandName:brand.name,domain:brand.domain,site:'de',slug:'demo',
      title:'Demo',metaDesc:'Demo',locale:'de',facts:getProductFacts('de',brand),
    });
    assert.ok(!html.includes('2023/1670'), '不应引用非照明类法规');
    assert.ok(!html.includes('liegen jedem Gerät bei'), '不应宣称随货附带未知证书');
    assert.ok(html.includes('Zertifizierung nicht verifiziert (Demo)'));
    const v = lintPage({locale:'de',market:'EU',bodyText:extractText(html),html});
    assert.equal(v.find(x=>x.ruleId==='INVALID-EU-LIGHTING-REG'),undefined);
  } finally {
    if (before === undefined) delete process.env.DEMO_INJECT_VIOLATION;
    else process.env.DEMO_INJECT_VIOLATION = before;
  }
});


test('FTC best must not spuriously match German text in EU pages', () => {
  const html = HTML('<p>Bitte bestätigen Sie die Auswahl.</p>');
  const violations = lintPage({ locale: 'de', market: 'EU', bodyText: extractText(html), html });
  assert.equal(violations.some(v => v.ruleId === 'FTC-SUPERLATIVE'), false);
});
