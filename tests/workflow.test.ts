import test from 'node:test';
import assert from 'node:assert/strict';
import {detectTaskIntent,extractAuditCopy} from '../src/lib/task-router';
import {normalizeEvidenceDocs} from '../src/lib/evidence';
import {auditGeneratedPages,redactUnsubstantiatedCopy} from '../src/lib/claim-audit';
import {parseMarketCsv,marketTopicDecision} from '../src/lib/market-data';

test('audit task flags unsupported claim from request content',()=>{
  const prompt='审核：This solar light is CE certified.';
  assert.equal(detectTaskIntent(prompt,false),'audit_copy');
  const doc=normalizeEvidenceDocs([{id:'proof1',name:'declaration.txt',kind:'declaration',text:'Company states that CE is granted'}]);
  const result=auditGeneratedPages([{locale:'en',html:`<p>${extractAuditCopy(prompt)}</p>`}],doc);
  assert.equal(result.issues[0].ruleId,'CERTIFICATION-ASSERTION');
  assert.equal(result.issues[0].candidateEvidenceIds[0],'proof1');
  assert.equal(result.publicationReady,false);
});
test('generation path can conservatively repair a high-risk LLM statement',()=>{
  assert.equal(detectTaskIntent('生成英国网站',false),'generate_page');
  const original={sub:'CE certified and weather resistant.',faq:[{q:'Is it tested?',a:'Testing details pending.'}]};
  const patched=redactUnsubstantiatedCopy(original,'en');
  assert.ok(patched.redactions>=1);
  const report=auditGeneratedPages([{locale:'en',html:`<p>${patched.copy.sub}</p>`}]);
  assert.equal(report.issues.length,0);
  assert.notEqual(original.sub,patched.copy.sub);
});
test('market analysis path ranks actual uploaded data, not hardcoded market snapshot',()=>{
  assert.equal(detectTaskIntent('市场分析：美国太阳能灯',false),'analyze_market');
  const data='market,topic,impressions,page_count\nUS,solar,80,2\nUS,camera,20,8';
  const d=marketTopicDecision(parseMarketCsv(data),'US');
  assert.equal(d.topic,'solar');
  assert.equal(d.priority,'P0');
  assert.match(d.reason,/上传/);
});
test('revision intent takes priority over analysis',()=>{
  assert.equal(detectTaskIntent('检查已生成页面',true),'revise_page');
});
