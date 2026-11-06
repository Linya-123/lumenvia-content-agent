/** Offline illustration of V9.5 design composition: NO API calls, NO claim of live model output. */
const fs=require('node:fs');
const path=require('node:path');
require('../tests/ts-runtime-hook.cjs');
const {normalizeDesignPlan}=require('../src/lib/design-planner-v95.ts');
const {renderSparseV9}=require('../src/lib/render-v9.ts');
const {buildProductProfile}=require('../src/lib/product-profile-v9.ts');
const output=process.argv[2]||path.join(__dirname,'../docs');
fs.mkdirSync(output,{recursive:true});
const prompt='我们销售智能宠物喂食器，支持定时喂食和手机 App 控制，主要面向德国市场。';
const facts=buildProductProfile(prompt,[]);
const spec={market:'DE',locales:['de'],category:'general-product',topic:'智能宠物喂食器',intent:'landing-page',brandName:'Lumenvia',domain:'lumenvia.com',site:'de',slug:'smart-pet-feeder',title:'',metaDesc:'',userRequest:prompt};
const options=[
  {label:'暖色杂志式',value:{concept:'让宠物主人的生活方式和情绪体验成为首页焦点',hero:'centered',visual:'typographic',scenarios:'timeline',facts:'compact',faq:'stacked',navigation:'minimal',typography:'editorial',spacing:'airy',corners:'soft',palette:{ink:'#3A312C',accent:'#89513A',background:'#FBF6ED',surface:'#FFFFFF',muted:'#695D55'}}},
  {label:'清爽科技式',value:{concept:'突出智能控制与简洁易用的科技形象',hero:'poster',visual:'geometric',scenarios:'feature-first',facts:'table',faq:'columns',navigation:'solid',typography:'modern',spacing:'balanced',corners:'rounded',palette:{ink:'#163248',accent:'#1B6B83',background:'#F2F7FA',surface:'#FFFFFF',muted:'#496476'}}},
];
for(let i=0;i<options.length;i++){
  const plan=normalizeDesignPlan(options[i].value,'llm');
  const page=renderSparseV9({...spec,locale:'de',facts,modules:['hero','scenarios','specs','faq','lead-form'],designPlan:plan}).html;
  const pathOut=path.join(output,`V9.5_设计组合预览_${i+1}.html`);
  fs.writeFileSync(pathOut,page);
  console.log(options[i].label,pathOut);
}
