/** Market language defaults, explicit requests, and manual overrides. Offline, no API usage. */
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
require('./ts-runtime-hook.cjs');
const {resolveLocaleSelection,resolveTaskLocales}=require('../src/lib/task-intake-v92.ts');
const {validateRunRequest}=require('../src/lib/request-validation.ts');

test('market provides the default local language, not a universal English page',()=>{
  for(const [market,lang] of [['US','en'],['DE','de'],['ES','es']]){
    const result=resolveLocaleSelection(market,'请制作产品落地页');
    assert.deepEqual(result,{locales:[lang],source:'market_default'});
  }
});
test('an explicitly requested English page in Germany overrides market default',()=>{
  const p='请为德国市场生成英文网页';
  assert.deepEqual(resolveLocaleSelection('DE',p),{locales:['en'],source:'user_request'});
  assert.deepEqual(validateRunRequest({market:'DE',prompt:p}).locales,['en']);
});
test('English descriptions of the German/Spanish market never imply German/Spanish content',()=>{
  assert.deepEqual(resolveTaskLocales('DE','Create an English landing page in German market'),['en']);
  assert.deepEqual(resolveTaskLocales('ES','Create an English landing page in Spanish market'),['en']);
  assert.deepEqual(resolveTaskLocales('US','Create an English page for customers in German market'),['en']);
  assert.deepEqual(resolveTaskLocales('US','Generate a product page in German'),['de']);
  assert.deepEqual(resolveTaskLocales('US','Generate a Spanish-language page'),['es']);
});
test('manual language choice beats both market and text; trilingual remains opt-in',()=>{
  assert.deepEqual(resolveLocaleSelection('DE','生成英文网页','de'),{locales:['de'],source:'manual'});
  assert.deepEqual(resolveLocaleSelection('ES','生成德语网页','en'),{locales:['en'],source:'manual'});
  assert.deepEqual(resolveTaskLocales('DE','生成英语和德语两个版本'),['en','de']);
  assert.deepEqual(resolveTaskLocales('DE','生成三个语言版本','all'),['en','de','es']);
});
test('task UI shows effective languages and source without adding new screens',()=>{
  const page=fs.readFileSync(path.join(__dirname,'../src/app/page.tsx'),'utf8');
  assert.match(page,/resolveLocaleSelection/);
  assert.match(page,/自动匹配目标市场/);
  assert.match(page,/目标市场推荐/);
  assert.match(page,/市场决定内容方向与审核背景/);
});
