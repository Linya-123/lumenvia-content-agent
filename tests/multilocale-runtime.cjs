require('./ts-runtime-hook.cjs');
const assert=require('node:assert/strict');
const {POST}=require('../src/app/api/run/route.ts');
(async()=>{
 const body={market:'EU',locales:['en','de','es'],category:'outdoor-lighting',topic:'solar outdoor lighting',prompt:'Generate a three language landing page'};
 const resp=await POST(new Request('http://local/api/run',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)}));
 const events=(await resp.text()).split('\n').filter(s=>s.startsWith('data: ')).map(s=>JSON.parse(s.slice(6)));
 const finished=events.find(x=>x.kind==='done');
 const failed=events.find(x=>x.kind==='error');
 console.log('result',JSON.stringify({status:resp.status,stages:events.filter(x=>x.kind==='stage').map(x=>[x.stage,x.status]),failed:failed?.message,done:finished&&{mode:finished.mode,locales:finished.pages?.map(x=>x.locale)}}));
 assert.equal(resp.status,200);assert.equal(failed,undefined);assert.equal(finished.pages.length,3);
 for(const loc of ['en','de','es']){
 const html=finished.pages.find(x=>x.locale===loc).html;
 const blocks=[...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/gi)].map(x=>JSON.parse(x[1]));
 const product=blocks.find(x=>x['@type']==='Product');
 assert(product);
 assert(!('offers' in product));
 assert(!html.includes('2023/1670'));
 assert(!/Free shipping on orders|30-day returns|Kostenloser Versand ab|Envío gratuito en pedidos/.test(html));
 if(loc==='es')assert(html.includes('Certificación no verificada (demo)') && html.includes('4–5 noches'));
 if(loc==='de')assert(html.includes('Zertifizierung nicht verifiziert (Demo)') && html.includes('4–5 Nächte'));
 console.log('PASS',loc,'HTML bytes',html.length,'jsonld',blocks.length);
 }
})().catch(e=>{console.error(e);process.exitCode=1});
