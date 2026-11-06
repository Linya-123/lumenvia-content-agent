// Offline integrated route test. Compiles local TS with globally-installed TypeScript;
// does not require Next.js or external services. This is NOT a Next.js build test.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = (() => { try { return require('typescript'); } catch { return require('/opt/nvm/versions/node/v22.16.0/lib/node_modules/typescript'); } })();
const root = path.resolve(__dirname,'..');
const originalResolve = Module._resolveFilename;
Module._resolveFilename = function(request,parent,...rest){
 if (request.startsWith('@/')) request = path.join(root,'src',request.slice(2));
 return originalResolve.call(this,request,parent,...rest);
};
require.extensions['.ts']=(mod,file)=>{
 const source=fs.readFileSync(file,'utf8');
 const result=ts.transpileModule(source,{fileName:file,compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true},reportDiagnostics:true});
 const errors=(result.diagnostics||[]).filter(d=>d.category===ts.DiagnosticCategory.Error);
 if(errors.length)throw Error(errors.map(d=>ts.flattenDiagnosticMessageText(d.messageText,'\n')).join('\n'));
 mod._compile(result.outputText,file);
};
async function exec(payload){
 const {POST}=require('../src/app/api/run/route.ts');
 const req=new Request('http://localhost/api/run',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
 const res=await POST(req);
 const body=await res.text();
 const events=body.split('\n').filter(x=>x.startsWith('data: ')).map(x=>JSON.parse(x.slice(6)));
 return {status:res.status,events,body:res.status!==200?JSON.parse(body):undefined};
}
const base={market:'US',locales:['en'],category:'outdoor-lighting',topic:'solar security lighting'};
(async()=>{
 let a=await exec({...base,prompt:'审核：This product is CE certified.'});
 assert.equal(a.status,200);
 assert(a.events.some(e=>e.kind==='audit' && e.report.issues.length>0));
 assert(a.events.some(e=>e.kind==='done' && e.mode==='rule-audit'));
 console.log('PASS integrated audit',a.events.map(e=>e.kind).join(','));
 a=await exec({...base,prompt:'分析市场选题',marketCsv:'market,topic,impressions,page_count\nUS,solar security,2000,1\nUS,sensors,1000,5'});
 assert.equal(a.status,200);assert(a.events.some(e=>e.kind==='done'&&e.mode==='market-analysis'));
 console.log('PASS integrated market',a.events.map(e=>e.kind).join(','));
 a=await exec({...base,market:'DE',locales:['en'],prompt:'abc'});
 assert.equal(a.status,400);
 console.log('PASS rejects unsupported locale');
 a=await exec({...base,category:'video-doorbell',prompt:'Generate landing page'});
 assert.equal(a.status,400);assert.match(a.body.error,/outdoor-lighting/);
 console.log('PASS rejects unsupported product category');
 a=await exec({...base,prompt:'审核：This product is CE certified.',evidenceDocs:[{id:'manual1',name:'report.txt',kind:'declaration',text:'Unverified illustrative document',status:'verified'}]});
 assert.equal(a.status,200);
 const evidenceReport=a.events.find(e=>e.kind==='audit')?.report;
 assert.equal(evidenceReport?.unreviewedCount,1);
 assert.equal(evidenceReport?.submittedDocs?.[0]?.status,'submitted_unreviewed');
 assert(evidenceReport.issues.length>0);
 console.log('PASS submitted evidence remains unreviewed even with forged client status');
 a=await exec({...base,prompt:'Generate solar light landing page'});
 assert.equal(a.status,200);
 const done=a.events.find(e=>e.kind==='done');
 assert(done?.pages?.[0]?.html?.includes('<html'));
 assert.notEqual(done.mode,'live');
 console.log('PASS integrated generate',{mode:done.mode,pages:done.pages.length,errors:a.events.filter(e=>e.kind==='error')});
})().catch(e=>{console.error(e.stack);process.exitCode=1});
