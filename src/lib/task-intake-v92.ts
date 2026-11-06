/** V9.2: separate target market from requested output language, and extract a short product topic. */
export type OutputLanguagePreference = 'auto'|'en'|'de'|'es'|'all';
export type SupportedMarket = 'US'|'DE'|'ES'|'EU';
export type OutputLocale = 'en'|'de'|'es';

const DEFAULT_LOCALES:Record<SupportedMarket,OutputLocale[]> = {
  US:['en'],DE:['de'],ES:['es'],EU:['en','de','es'],
};
/** Market and language are deliberately separate: 'in German market' is not a German-language request. */
const LANGUAGE_HINTS:Record<OutputLocale,RegExp>={
  en:/英文|英语|英語|\benglish\b|englisch|ingl[eé]s/iu,
  de:/德语|德文|德語|deutsch|\bin\s+german\b(?!\s+(?:markets?|regions?|audiences?|customers?|consumers?|stores?|countries|territories|speaking))|\bgerman[- ](?:language|version|copy|page|landing|text)s?\b|\bin alem[aá]n\b/iu,
  es:/西班牙语|西班牙文|西語|espa[nñ]ol|\bin\s+spanish\b(?!\s+(?:markets?|regions?|audiences?|customers?|consumers?|stores?|countries|territories|speaking))|\bspanish[- ](?:language|version|copy|page|landing|text)s?\b/iu,
};
export type LocaleSelectionSource = 'manual'|'user_request'|'market_default';
export type LocaleSelection = {locales:OutputLocale[];source:LocaleSelectionSource};

/** A request for the German MARKET is not a request for GERMAN-language content.
 * Explicit language selection in the task form wins over language in the prompt.
 */
export function resolveLocaleSelection(market:SupportedMarket,prompt='',preference:OutputLanguagePreference='auto'):LocaleSelection {
  if(preference==='all')return {locales:['en','de','es'],source:'manual'};
  if(preference!=='auto')return {locales:[preference],source:'manual'};
  const text=prompt.trim();
  if(/三语种|三种语言|三语|three languages|trilingual/iu.test(text))return {locales:['en','de','es'],source:'user_request'};
  const mentioned=(Object.keys(LANGUAGE_HINTS) as OutputLocale[]).filter(lang=>LANGUAGE_HINTS[lang].test(text));
  if(mentioned.length)return {locales:mentioned,source:'user_request'};
  return {locales:[...DEFAULT_LOCALES[market]],source:'market_default'};
}

export function resolveTaskLocales(market:SupportedMarket,prompt='',preference:OutputLanguagePreference='auto'):OutputLocale[] {
  return resolveLocaleSelection(market,prompt,preference).locales;
}

const sourceLead = /^(?:请(?:你)?|帮我|帮忙|我们(?:在|目前)?|我(?:们)?)(?:销售|主营|提供|生产|经营|卖|做)?/u;
const productStart = /^(?:(?:我们|我)(?:正在|目前)?(?:销售|主营|提供|生产|经营|卖)|这(?:是|款)|(?:产品(?:名称|名字|名)?)(?:是|为|[:：])|一(?:款|个|种))\s*/u;
const stopClause = /[，,。；;！!？?\n]|(?=支持|具有|适合|面向|主要|能够|提供|用于|请(?:为|帮|生成|制作)|重点)/u;
const chineseProductNames = [
  /(?:智能)?宠物(?:自动)?喂食器/u,
  /(?:便携式?|手持式?|迷你)?咖啡机/u,
  /(?:人体工学|办公)?椅/u,
  /(?:太阳能)?(?:人体)?感应灯/u,
  /(?:太阳能)?安防灯/u,
];

function cleanCandidate(candidate:string):string {
  let v=candidate.normalize('NFKC').replace(/[<>"'`]/g,' ').trim();
  for(let i=0;i<3;i++){
    const before=v;
    v=v.replace(sourceLead,'').replace(productStart,'').replace(/^(?:的|一款|一个|一种|一台|一件|用于|针对)\s*/u,'').trim();
    if(v===before)break;
  }
  v=v.split(stopClause)[0].trim();
  v=v.replace(/(?:英文|英语|德语|德文|西班牙语)?(?:营销|落地|产品)?(?:网页|页面|页|介绍|文案)$/u,'').trim();
  if(v.length<2||v.length>48||/^(?:生成|设计|制作|为|市场|英文|德语|西班牙语|营销|页面|请)/u.test(v))return '';
  if(/(?:生成|帮我|请你|重点突出|市场|网页|页面|如何)/u.test(v))return '';
  return v;
}

/** Returns a concise product name, never the entire user instruction. */
export function extractProductTopic(prompt:string):string|null {
  const p=prompt.trim();
  if(!p)return null;
  const explicit=/(?:产品(?:名称|名字|名)|product\s*name)\s*[:：]\s*([^，,。；;\n]{2,60})/iu.exec(p);
  if(explicit){const name=cleanCandidate(explicit[1]);if(name)return name;}
  const sold=/(?:我们|我)(?:正在|目前)?(?:销售|主营|提供|生产|经营|卖)|这(?:是|款)|一(?:款|个|种)/u.exec(p);
  if(sold){const name=cleanCandidate(p.slice(sold.index,sold.index+85));if(name)return name;}
  // "请为德国市场生成智能宠物喂食器英文营销网页" is a common form.
  const output=/(?:生成|制作|设计|创建|撰写)\s*(?:一(?:张|个|份))?\s*([^，,。；;\n]{2,55}?)(?:英文|英语|德语|德文|西班牙语)?(?:营销|落地|产品)?(?:网页|页面|页|文案)/u.exec(p);
  if(output){const name=cleanCandidate(output[1]);if(name)return name;}
  for(const pattern of chineseProductNames){const m=pattern.exec(p);if(m)return m[0];}
  const english=/(?:we\s+(?:sell|make|offer)|our\s+product\s+is|product\s*:\s*)\s*(?:an?\s+)?([a-z][a-z\d\s-]{2,55}?)(?=\s+(?:with|that|for|supports?|features?)\b|[,.;]|$)/iu.exec(p);
  if(english){const name=cleanCandidate(english[1]);if(name)return name;}
  return null;
}

/** A safe, localized offline label. Online copy can still use model-generated product copy. */
export function localizedProductName(topic:string,locale:OutputLocale):string {
  const name=topic.trim();
  const names: Array<{pattern:RegExp;label:Record<OutputLocale,string>}>= [
    {pattern:/宠物(?:自动)?喂食器/u,label:{en:'Smart Pet Feeder',de:'Intelligenter Futterautomat',es:'Comedero inteligente para mascotas'}},
    {pattern:/咖啡机/u,label:{en:'Portable Coffee Maker',de:'Tragbare Kaffeemaschine',es:'Cafetera portátil'}},
    {pattern:/人体工学椅/u,label:{en:'Ergonomic Office Chair',de:'Ergonomischer Bürostuhl',es:'Silla de oficina ergonómica'}},
    {pattern:/太阳能.*(?:感应灯|安防灯)|感应灯/u,label:{en:'Solar Motion Light',de:'Solar-Bewegungsleuchte',es:'Luz solar con sensor de movimiento'}},
  ];
  for(const item of names)if(item.pattern.test(name))return item.label[locale];
  // Do not put an un-translated Chinese sentence in an English/German/Spanish headline.
  if(/[\p{Script=Han}]/u.test(name))return {en:'This Product',de:'Dieses Produkt',es:'Este producto'}[locale];
  return (name.replace(/[<>]/g,'').slice(0,75)||{en:'This Product',de:'Dieses Produkt',es:'Este producto'}[locale]);
}
