const fs=require('fs');
const path=require('path');
const root=path.resolve(__dirname,'..');
require(path.join(root,'tests/ts-runtime-hook.cjs'));
const {buildProductProfile}=require(path.join(root,'src/lib/product-profile-v9.ts'));
const {renderSparseV9}=require(path.join(root,'src/lib/render-v9.ts'));
const {inspectFinalPage}=require(path.join(root,'src/lib/claim-engine-v9.ts'));
const prompt='我们销售智能宠物喂食器，支持定时喂食和手机 App 控制，主要面向德国市场。请生成产品营销网页。';
const facts=buildProductProfile(prompt,[]);
const input={market:'DE',locales:['de'],locale:'de',category:'general-product',topic:'智能宠物喂食器',intent:'landing-page',brandName:'Lumenvia',domain:'lumenvia.com',site:'de',slug:'smart-pet-feeder',title:'',metaDesc:'',userRequest:prompt,facts,modules:['hero','scenarios','specs','faq','lead-form'],copy:{
  eyebrow:'Zeitgesteuerte Fütterung; Steuerung per App',
  h1:'Mit Lumenvia den Fütterungsalltag entspannter gestalten',
  sub:'Die intelligente Futterstation von Lumenvia erinnert an regelmäßige Mahlzeiten und lässt sich bequem per App steuern – für mehr Routine im Alltag von Mensch und Tier.',
  seoTitle:'Lumenvia intelligenter Futterautomat mit App',
  seoDesc:'Intelligenter Futterautomat von Lumenvia: zeitgesteuerte Fütterung und App-Steuerung für den Alltag. Jetzt informieren.',
  scenes:[
    {h:'Morgens im Büro',p:'Wenn der Arbeitstag früh beginnt, kann die zeitgesteuerte Fütterung dabei helfen, die gewohnte Morgenmahlzeit des Tieres auch ohne Anwesenheit zu ermöglichen.'},
    {h:'Abends unterwegs',p:'Bei spontanen Terminen oder einem späten Feierabend lässt sich die Fütterung per App aus der Ferne anpassen oder auslösen.'},
    {h:'Wochenendausflug',p:'Für einen Tagesausflug kann die Fütterung im Voraus zeitlich geplant werden, sodass die gewohnte Routine auch ohne ständige Anwesenheit weiterläuft.'},
  ],
  faq:[
    {q:'Wie funktioniert die zeitgesteuerte Fütterung?',a:'Die Fütterung kann im Voraus zeitlich festgelegt werden. So erhalten Tiere ihre Mahlzeiten zu den gewohnten Zeiten, auch wenn niemand zu Hause ist.'},
    {q:'Kann ich die Fütterung auch unterwegs steuern?',a:'Ja, über die App lässt sich die Fütterung bequem vom Smartphone aus steuern, solange eine Verbindung well suited foreht.'},
    {q:'Für welche Tiere eignet sich der Automat?',a:'Der Automat ist für die regelmäßige Fütterung von Haustieren konzipiert, die feste Mahlzeiten erhalten. Die genaue Eignung hängt von Größe und Fressverhalten des Tieres ab.'},
    {q:'Welche Merkmale sollte ich vergleichen?',a:'Vergleichen Sie die vom Anbieter dokumentierten Merkmale, die für Ihren Einsatz relevant sind.'},
  ],
}};
const result=renderSparseV9(input);
fs.writeFileSync(path.join(root,'docs','V9.4_宠物喂食器_升级版网页_离线复核.html'),result.html);
fs.writeFileSync(path.join(root,'docs','V9.4_宠物喂食器_语言事实审核记录.json'),JSON.stringify({notice:'Re-render of previously shared model copy, no DeepSeek API calls',modelCopySource:'smart-pet-feeder-de (6).html',issues:inspectFinalPage(result.html,facts,'de'),claims:result.claims,editorial:result.editorial},null,2));
// No network calls: re-renders an archived model copy through the current local gate.
console.log(JSON.stringify({htmlBytes:Buffer.byteLength(result.html),claims:result.claims.length,rejected:result.claims.filter(x=>x.action==='withheld').length,issues:inspectFinalPage(result.html,facts,'de'),faqCount:(result.html.match(/<details class="faq-item">/g)||[]).length},null,2));
