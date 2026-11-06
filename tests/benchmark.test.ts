import test from 'node:test';
import assert from 'node:assert/strict';
import cases from './benchmark_cases.json';
import { auditGeneratedPages } from '../src/lib/claim-audit';


test('30 synthetic risk cases: report confusion matrix (not an LLM performance claim)', () => {
  let tp = 0, tn = 0, fp = 0, fn = 0;
  const mistakes = [];
  for (const item of cases) {
    const observed = auditGeneratedPages([{locale:item.locale,html:item.html}]).issues.length>0;
    if (observed && item.highRisk) tp++;
    else if (!observed && !item.highRisk) tn++;
    else if (observed) { fp++; mistakes.push('FP '+item.id); }
    else { fn++; mistakes.push('FN '+item.id); }
  }
  const precision = tp/(tp+fp || 1), recall=tp/(tp+fn || 1);
  console.log(JSON.stringify({total:cases.length,tp,tn,fp,fn,precision,recall,mistakes}));
  assert.equal(cases.length,30);
  assert.equal(fp+fn,0,'人工合成的30个基础测试场景必须通过，失败: '+mistakes.join(', '));
});
