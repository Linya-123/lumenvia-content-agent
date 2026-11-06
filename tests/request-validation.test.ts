import test from 'node:test';
import assert from 'node:assert/strict';
import { readLimitedRequestJson, validateRunRequest } from '../src/lib/request-validation';

test('accepts known market and corresponding locales',()=>{
  const data=validateRunRequest({market:'DE',locales:['de'],category:'outdoor-lighting',topic:'Solar lamp',prompt:'请帮我生成网页'});
  assert.deepEqual(data.locales,['de']); assert.equal(data.market,'DE');
});
test('accepts market/language combinations independently, rejects unsupported or duplicate locales',()=>{
  assert.deepEqual(validateRunRequest({market:'DE',locales:['en']}).locales,['en']);
  assert.deepEqual(validateRunRequest({market:'US',locales:['de']}).locales,['de']);
  assert.throws(()=>validateRunRequest({market:'US',locales:['fr']}));
  assert.throws(()=>validateRunRequest({market:'EU',locales:['en','en']}));
  assert.throws(()=>validateRunRequest({market:'CN',locales:['zh']}));
});
test('rejects oversized prompt and unsupported document fanout',()=>{
  assert.throws(()=>validateRunRequest({market:'US',prompt:'a'.repeat(5001)}));
  assert.throws(()=>validateRunRequest({market:'US',evidenceDocs:[{},{},{},{}]}));
});
test('readLimitedRequestJson parses a small valid body',async()=>{
  const req=new Request('http://localhost/api/run',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({market:'US'})});
  const json=await readLimitedRequestJson(req);
  assert.deepEqual(json,{market:'US'});
});
test('readLimitedRequestJson rejects non-JSON content type',async()=>{
  const req=new Request('http://localhost/api/run',{method:'POST',headers:{'content-type':'text/plain'},body:'hello'});
  await assert.rejects(()=>readLimitedRequestJson(req));
});
test('readLimitedRequestJson rejects oversized transfer before JSON parse',async()=>{
  const req=new Request('http://localhost/api/run',{method:'POST',headers:{'content-type':'application/json'},body:'x'.repeat(520000)});
  await assert.rejects(()=>readLimitedRequestJson(req),/512 KB/);
});


test('accepts unrelated products for generic rendering', () => {
  const r=validateRunRequest({market:'US',locales:['en'],category:'video-doorbell',topic:'smart entry security'});
  assert.equal(r.category,'video-doorbell');
});
