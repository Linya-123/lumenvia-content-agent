import test from 'node:test';
import assert from 'node:assert/strict';
import {detectTaskIntent,extractAuditCopy} from '../src/lib/task-router';
test('generate a landing page',()=>assert.equal(detectTaskIntent('帮我生成一个德国太阳能灯页面',false),'generate_page'));
test('check copy explicitly',()=>assert.equal(detectTaskIntent('审核：CE certified',false),'audit_copy'));
test('plain audit intent without copy is still a review task',()=>assert.equal(detectTaskIntent('请检查这段广告',false),'audit_copy'));
test('market analysis intent',()=>assert.equal(detectTaskIntent('市场分析：找出值得写的主题',false),'analyze_market'));
test('revision always wins',()=>assert.equal(detectTaskIntent('审核：上一版再修改',true),'revise_page'));
test('a generation request that mentions audit still means generate',()=>assert.equal(detectTaskIntent('生成网页并且检查合规',false),'generate_page'));
test('audit copy must follow explicit colon',()=>{
  assert.equal(extractAuditCopy('审核：This is CE certified'), 'This is CE certified');
  assert.equal(extractAuditCopy('请检查内容'), '');
});
