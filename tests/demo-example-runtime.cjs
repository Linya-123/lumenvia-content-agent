require('./ts-runtime-hook.cjs');
const assert=require('node:assert/strict');
const {POST}=require('../src/app/api/run/route.ts');
(async()=>{
for(const [market,locales,exampleId] of [['US',['en'],'us-solar-light'],['DE',['de'],'de-solar-light'],['EU',['en','de','es'],'eu-three-locale']]){
 const body={market,locales,category:'outdoor-lighting',topic:'outdoor solar security lighting',prompt:'run example',exampleId};
 const res=await POST(new Request('http://localhost/api/run',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}));
 const events=(await res.text()).split('\n').filter(s=>s.startsWith('data: ')).map(x=>JSON.parse(x.slice(6)));
 const done=events.find(x=>x.kind==='done');const err=events.find(x=>x.kind==='error');
 console.log(exampleId,JSON.stringify({status:res.status,mode:done?.mode,pages:done?.pages?.length,error:err?.message,violations:err?.violations}));
 assert(!err && done?.pages?.length===locales.length);
}
})().catch(e=>{console.error(e);process.exitCode=1});
