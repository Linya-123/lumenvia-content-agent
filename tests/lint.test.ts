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
   <p>CE Konformitätserklärung · EU 2023/1670 Energieeffizienzklasse · FCC</p></body></html>`;

test('德语环境宣称最高级形式应被捕获', () => {
  const html = HTML('<p>Unsere umweltfreundlichste Außenleuchte.</p>');
  const v = lintPage({ locale: 'de', market: 'EU', bodyText: extractText(html), html });
  const hit = v.find((x) => x.ruleId === 'DE-UWG-5');
  assert.ok(hit, '未捕获 umweltfreundlichste，实际：' + JSON.stringify(v));
  assert.strictEqual(hit!.matched, 'umweltfreundlichste');
});

test('德语同段有依据时豁免', () => {
  const html = HTML('<p>Unsere umweltfreundlichste Leuchte gemäß TÜV Prüfbericht.</p>');
  const v = lintPage({ locale: 'de', market: 'EU', bodyText: extractText(html), html });
  assert.strictEqual(v.find((x) => x.ruleId === 'DE-UWG-5'), undefined);
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

test('EU 市场应同时加载德国与西班牙规则（超集）', () => {
  const html = HTML('<p>umweltfreundlich und garantizado</p>');
  const v = lintPage({ locale: 'de', market: 'EU', bodyText: extractText(html), html });
  assert.ok(v.find((x) => x.ruleId === 'DE-UWG-5'), 'EU 未包含德国规则');
  assert.ok(v.find((x) => x.ruleId === 'ES-LEY3-1991'), 'EU 未包含西语规则');
});

test('缺失 CE 声明应被报出', () => {
  const html = '<html><body><h1>X</h1><p>no cert here</p></body></html>';
  const v = lintPage({ locale: 'de', market: 'DE', bodyText: extractText(html), html });
  assert.ok(v.find((x) => x.ruleId === 'CE-DECLARATION'));
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
  const html = renderPage({
    market: 'EU', locales: ['de'], category: 'outdoor-lighting', topic: 'x', intent: '',
    brandName: b.name, domain: b.domain, site: 'de', slug: 'x',
    title: 't', metaDesc: 'd', locale: 'de', facts: getProductFacts('de', b),
  });
  const v = lintPage({ locale: 'de', market: 'EU', bodyText: extractText(html), html });
  assert.ok(v.find((x) => x.ruleId === 'DE-UWG-5'), '真实页面未捕获，实际：' + v.map(x=>x.ruleId).join(','));
});
