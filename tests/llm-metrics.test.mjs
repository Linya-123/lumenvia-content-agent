import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createUsageLedger,runWithUsageLedger,recordLLMCall,recordLLMFailure,recordLLMUsage,usageSnapshot}
  from '../src/lib/llm-metrics.ts';

test('usage scoped to each asynchronous job even when concurrent',async()=>{
  const a=createUsageLedger(),b=createUsageLedger();
  await Promise.all([
    runWithUsageLedger(a,async()=>{recordLLMCall();await Promise.resolve();recordLLMUsage({prompt_tokens:4,completion_tokens:6,total_tokens:10,prompt_cache_hit_tokens:1})}),
    runWithUsageLedger(b,async()=>{recordLLMCall();await Promise.resolve();recordLLMUsage({prompt_tokens:20,completion_tokens:30,total_tokens:50})}),
  ]);
  assert.equal(usageSnapshot(a).totalTokens,10);
  assert.equal(usageSnapshot(b).totalTokens,50);
  assert.equal(usageSnapshot(a).cachedPromptTokens,1);
  assert.equal(usageSnapshot(a).complete,true);
});
test('usage missing or provider errors are not misreported as complete',()=>{
  const ledger=createUsageLedger();
  runWithUsageLedger(ledger,()=>{recordLLMCall();recordLLMUsage(null);recordLLMCall();recordLLMFailure();});
  assert.equal(usageSnapshot(ledger).complete,false);
  assert.equal(usageSnapshot(ledger).calls,2);
});
test('collect metrics never includes request content or API secrets',()=>{
  const result=usageSnapshot(createUsageLedger());
  assert.deepEqual(Object.keys(result).sort(),[
    'cachedPromptTokens','calls','callsWithoutUsage','complete','completionTokens','failedCalls','promptTokens','totalTokens'
  ]);
});
