import type { JobSpec } from './types';
import type { LocaleCopy } from './examples';
import type { ProductFactV9 } from './product-profile-v9';
import { reviewMarketingCopy, type ClaimRecordV9 } from './claim-engine-v9';
import { choosePublicFAQ, type EditorialDecisionV91 } from './content-select-v91';
import { groundedEditorial } from './grounded-marketing-v91';
import { genericEditorial } from './generic-editorial-v92';
import {localizedProductName} from './task-intake-v92';
import {localizeFactValue} from './fact-localization-v92';
import {designCss, renderConceptIllustration, uiIcon, visualKind, visualLabels} from './landing-design-v94';
import {adaptiveDesignCss,adaptiveArtMarkup,type PageDesignPlan} from './design-planner-v95';

type Lang='en'|'de'|'es';
const T:Record<Lang,{
  badge:string;title:string;subtitle:string;cta:string;secondary:string;facts:string;lead:string;
  scenes:string;faq:string;form:string;formLead:string;button:string;disclaimer:string;
  safeScene:string; safeFAQ:string;safeAnswer:string; model:string;source:string; missing:string;
}>= {
  en: {badge:'Outdoor lighting',title:'Lighting for the spaces around your home',subtitle:'Explore outdoor lighting for entrances, paths and the everyday moments that matter.',cta:'Request product details',secondary:'Explore options',facts:'Product features',lead:'Explore the product features at a glance.',scenes:'Where it fits',faq:'Questions before choosing',form:'Find the right lighting for your space',formLead:'Consider your entrance layout and explore the product details before choosing a lighting solution.',button:'Explore features',disclaimer:'Product overview · Draft for review.',safeScene:'Outdoor entrances',safeFAQ:'How can I check product specifications?',safeAnswer:'Ask the seller for the technical datasheet and any relevant test documentation before purchase.',model:'Product',source:'Source',missing:'Additional specifications can be supplied later.'},
  de: {badge:'Außenbeleuchtung',title:'Beleuchtung für Ihren Außenbereich',subtitle:'Entdecken Sie Beleuchtungsoptionen für Eingänge, Wege und den Alltag.',cta:'Produktinformationen anfragen',secondary:'Details ansehen',facts:'Produktangaben',lead:'Entdecken Sie die Merkmale dieses Produkts auf einen Blick.',scenes:'Einsatzbereiche',faq:'Häufige Fragen',form:'Beleuchtung passend zum Eingangsbereich',formLead:'Berücksichtigen Sie den Zugangsweg und entdecken Sie die Produkteigenschaften vor Ihrer Auswahl.',button:'Merkmale ansehen',disclaimer:'Produktübersicht · Entwurf zur Prüfung.',safeScene:'Eingangsbereiche',safeFAQ:'Wo finde ich technische Angaben?',safeAnswer:'Bitten Sie den Anbieter vor dem Kauf um ein Datenblatt und gegebenenfalls Prüfunterlagen.',model:'Produkt',source:'Quelle',missing:'Weitere technische Angaben können später ergänzt werden.'},
  es: {badge:'Iluminación exterior',title:'Iluminación para sus espacios exteriores',subtitle:'Descubra opciones de iluminación para entradas y zonas de paso.',cta:'Solicitar información',secondary:'Ver detalles',facts:'Datos del producto',lead:'Descubra las características de este producto de un vistazo.',scenes:'Dónde utilizarlo',faq:'Preguntas frecuentes',form:'Iluminación para el espacio que necesita',formLead:'Piense en el acceso y explore las características del producto antes de elegir una solución.',button:'Ver características',disclaimer:'Presentación del producto · Borrador para revisión.',safeScene:'Entradas exteriores',safeFAQ:'¿Dónde puedo verificar los datos técnicos?',safeAnswer:'Solicite al proveedor una ficha técnica y la documentación de ensayo pertinente.',model:'Producto',source:'Fuente',missing:'Se pueden aportar más datos técnicos posteriormente.'},
};
const esc=(v:string)=>v.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
const safeJson=(v:unknown)=>JSON.stringify(v).replace(/</g,'\\u003c').replace(/>/g,'\\u003e').replace(/&/g,'\\u0026');
const clamp=(v:unknown,len=600)=>typeof v==='string'?v.slice(0,len):'';

const LABELS: Record<string,Record<Lang,string>>={
  model:{en:'Model',de:'Modell',es:'Modelo'},sku:{en:'SKU',de:'Artikelnummer',es:'SKU'},ip:{en:'IP rating',de:'Schutzart',es:'Protección IP'},
  battery:{en:'Battery',de:'Akku',es:'Batería'},runtime:{en:'Runtime',de:'Laufzeit',es:'Autonomía'},
  range:{en:'Detection range',de:'Erfassungsbereich',es:'Alcance de detección'},lumen:{en:'Light output',de:'Lichtstrom',es:'Flujo luminoso'},
  temp:{en:'Operating temperature',de:'Betriebstemperatur',es:'Temperatura de trabajo'},install:{en:'Installation',de:'Installation',es:'Instalación'},
  panel_power:{en:'Solar panel',de:'Solarmodul',es:'Panel solar'},power_source:{en:'Power source',de:'Stromversorgung',es:'Alimentación'},
  motion_sensor:{en:'Sensor',de:'Sensor',es:'Sensor'},no_mains:{en:'Mains connection',de:'Netzanschluss',es:'Conexión a la red'},
  scenario:{en:'Intended uses',de:'Anwendungsbereiche',es:'Aplicaciones'},feature:{en:'Feature',de:'Merkmal',es:'Característica'},
  included:{en:'Included',de:'Lieferumfang',es:'Incluido'},
};
const PUBLIC_FIELDS = new Set(Object.keys(LABELS)); // Exclude cert/price/warranty until independently checked.

export function renderSparseV9(input:JobSpec & {locale:string;facts:ProductFactV9[];copy?:LocaleCopy;modules?:string[];focusAreas?:string[];designPlan?:PageDesignPlan}): {
  html:string;claims:ClaimRecordV9[];editorial:EditorialDecisionV91[];
} {
  const locale=(['en','de','es'].includes(input.locale)?input.locale:'en') as Lang;
  const t=T[locale];
  const isLighting=input.category==='outdoor-lighting';
  const grounded=isLighting?groundedEditorial(locale,input.facts):genericEditorial(locale,input.topic,input.facts);
  // Model-produced copy is checked BEFORE rendering, including SEO and FAQ schema.
  const candidates={
    badge:clamp(input.copy?.eyebrow)||grounded.badge,
    title:clamp(input.copy?.h1)||grounded.title,
    subtitle:clamp(input.copy?.sub)||grounded.subtitle,
    cta:clamp(input.copy?.ctaPrimary,100)||t.cta,
    secondary:clamp(input.copy?.ctaSecondary,100)||t.secondary,
    seoTitle:clamp(input.copy?.seoTitle,140)||grounded.seoTitle,
    seoDesc:clamp(input.copy?.seoDesc,320)||grounded.seoDesc,
    scenes:(input.copy?.scenes??[]).slice(0,4).map(s=>({h:clamp(s.h,180),p:clamp(s.p)})).filter(s=>s.h&&s.p),
    faq:(input.copy?.faq??[]).slice(0,5).map(s=>({q:clamp(s.q,250),a:clamp(s.a,700)})).filter(s=>s.q&&s.a),
  };
  // Sparse prompts deserve useful scenario advice, not a duplicated generic card.
  const filledScenesFromFacts = !candidates.scenes.length;
  if(filledScenesFromFacts)candidates.scenes=grounded.scenes;
  // If no model FAQ exists, the customer-facing FAQ selector supplies grounded topics.
  // Do not inject a disclaimer about missing datasheets into the public page.
  const selected=choosePublicFAQ({locale,facts:input.facts,generated:candidates.faq,category:input.category});
  candidates.faq=selected.faq;
  const {copy:c,claims}=reviewMarketingCopy(candidates,locale,input.facts,input.category);
  const editorial:EditorialDecisionV91[]=[...selected.decisions];
  // A rewritten FAQ is not necessarily safe to publish: the question may still
  // imply a capability and a generic answer may be misleading. Withhold the
  // entire item and fill the public FAQ with documented, conservative topics.
  const rejectedFaq=new Set<number>();
  for(const claim of claims){
    const m=/^faq\[(\d+)\]\./.exec(claim.fieldPath);
    if(m && claim.action==='safe_rewrite')rejectedFaq.add(Number(m[1]));
  }
  if(rejectedFaq.size){
    for(const i of rejectedFaq){
      const item=c.faq[i];
      if(item)editorial.push({locale,section:'faq',action:'excluded_from_public_page',question:item.q,
        reason:'模型内容包含缺乏产品事实支持的能力或目标语残留，已整条移出消费者页面'});
      for(const claim of claims)if(claim.fieldPath.startsWith(`faq[${i}].`) && claim.action==='safe_rewrite'){
        claim.action='withheld'; claim.final='';
      }
    }
    c.faq=choosePublicFAQ({locale,facts:input.facts,generated:c.faq.filter((_,i)=>!rejectedFaq.has(i)),category:input.category}).faq;
  }
  if(filledScenesFromFacts)for(const scene of grounded.scenes)editorial.push({locale,section:'scenes',action:'added_grounded_scene',question:scene.h,reason:'模型未提供场景文案，依据本次产品用途补充非性能性选址建议'});
  // Protect genuine model creativity: only replace missing/generic fallback fields,
  // or entire sentences which the evidence gate already rewrote to a generic line.
  const genericRewrites = [
    'Explore lighting options for outdoor spaces.',
    'Explore solar-powered lighting for outdoor spaces.',
    'Explore solar-powered lighting for garage entrances and outdoor spaces.',
    'Entdecken Sie Beleuchtung für den vorgesehenen Außenbereich.',
    'Entdecken Sie solarbetriebene Beleuchtung für den Außenbereich.',
    'Descubra opciones de iluminación para los espacios exteriores.',
    'Descubra soluciones de iluminación solar para exteriores.',
  ];
  const replacements:{field:keyof typeof grounded;path:string;value:string}[]=[
    {field:'badge',path:'badge',value:grounded.badge},
    {field:'title',path:'title',value:grounded.title},
    {field:'subtitle',path:'subtitle',value:grounded.subtitle},
    {field:'seoTitle',path:'seoTitle',value:grounded.seoTitle},
    {field:'seoDesc',path:'seoDesc',value:grounded.seoDesc},
  ];
  for(const x of replacements) {
    const previous=c[x.field] as string;
    const rejected=claims.some(claim=>claim.fieldPath===x.path && claim.action==='safe_rewrite');
    if(rejected || previous===T[locale].title || previous===T[locale].subtitle || previous===T[locale].badge || genericRewrites.includes(previous)) {
      (c as Record<string,unknown>)[x.field]=x.value;
      editorial.push({locale,section:'hero',action:'grounded_fallback_copy',question:x.path,reason:'通用兜底或审核后的笼统文案已替换为本次产品事实支持的表达'});
      for(const claim of claims)if(claim.fieldPath===x.path && claim.action==='safe_rewrite')claim.final=x.value;
    }
  }
  // Keep creative generated scenes; supplement only when the model supplies too few.
  // A scene with a rejected claim is replaced with a grounded placement idea.
  const normalizedScenes:typeof c.scenes=[];
  for(let i=0;i<c.scenes.length;i++) {
    const scene=c.scenes[i];
    const rejected=claims.some(claim=>claim.action==='safe_rewrite' && claim.fieldPath.startsWith(`scenes[${i}].`));
    if(rejected || genericRewrites.includes(scene.p) || scene.p===T[locale].subtitle || scene.h===T[locale].safeScene) {
      const safe=grounded.scenes[Math.min(i,grounded.scenes.length-1)];
      normalizedScenes.push(safe);
      editorial.push({locale,section:'scenes',action:'grounded_fallback_copy',question:scene.h,reason:'场景中的无依据声明已经改为基于已知用途的安装规划建议'});
      for(const claim of claims)if(claim.fieldPath===`scenes[${i}].p` && claim.action==='safe_rewrite')claim.final=safe.p;
      for(const claim of claims)if(claim.fieldPath===`scenes[${i}].h` && claim.action==='safe_rewrite')claim.final=safe.h;
    } else normalizedScenes.push(scene);
  }
  for(const safe of grounded.scenes){
    if(normalizedScenes.length>=3)break;
    if(normalizedScenes.some(scene=>scene.h.toLowerCase()===safe.h.toLowerCase() || scene.p===safe.p))continue;
    normalizedScenes.push(safe);
    editorial.push({locale,section:'scenes',action:'added_grounded_scene',question:safe.h,reason:'信息较少时，根据本次已知场景补充选址建议；不添加产品性能或认证事实'});
  }
  c.scenes=normalizedScenes;
  // Ensure final, localized meta-description matches the same grounded product framing.
  const facts=input.facts.filter(f=>PUBLIC_FIELDS.has(f.field));
  const displayedFacts=facts.map(f=>({source:f,display:localizeFactValue(f,locale)}));
  for(const {source:f,display} of displayedFacts) claims.push({
    id:`F-claim-${f.id}`,locale,fieldPath:`productFacts.${f.field}`,original:f.value,final:display.value,
    action:'retained',reason:display.value===f.value?'本次用户资料（未经独立核验）':'仅将本次用户提供的事实本地化展示；源数据不变，未经独立核验',
    factIds:[f.id],sourceIds:[f.sourceId],independentVerification:false,
  });
  const factHtml=displayedFacts.length?displayedFacts.map(({source:f,display})=>`<div class="spec"><dt>${esc(LABELS[f.field]?.[locale]??f.field)}</dt><dd>${esc(display.value)}</dd></div>`).join(''):`<p class="muted">${esc(t.missing)}</p>`;
  const sceneIcons=['clock','phone','leaf','spark'] as const;
  const sceneHtml=c.scenes.map((s,i)=>`<article class="use"><span class="use-icon">${uiIcon(sceneIcons[i%sceneIcons.length])}</span><h3>${esc(s.h)}</h3><p>${esc(s.p)}</p></article>`).join('');
  const faqHtml=c.faq.map(s=>`<details class="faq-item"><summary>${esc(s.q)}</summary><p>${esc(s.a)}</p></details>`).join('');
  // Product name is also a claim-bearing surface; sanitize it before JSON-LD.
  const modelFact=displayedFacts.find(({source:f})=>f.field==='model');
  const productName=isLighting?(modelFact?.display.value||input.topic||t.model):localizedProductName(input.topic,locale);
  const safeName = reviewMarketingCopy({name:productName},locale,input.facts,input.category);
  claims.push(...safeName.claims);
  // No invented prices, certifications, support policies, or product specs in structured data.
  const productLd={ '@context':'https://schema.org','@type':'Product',name:safeName.copy.name,
    description:c.seoDesc,brand:{'@type':'Brand',name:input.brandName},
    ...(facts.find(f=>f.field==='sku')?{sku:facts.find(f=>f.field==='sku')!.value}:{}),
    additionalProperty:displayedFacts.map(({source:f,display})=>({'@type':'PropertyValue',name:LABELS[f.field]?.[locale]??f.field,value:display.value})),
  };
  const faqLd={ '@context':'https://schema.org','@type':'FAQPage', mainEntity:c.faq.map(s=>({'@type':'Question',name:s.q,acceptedAnswer:{'@type':'Answer',text:s.a}}))};
  // S3 module selection/order actually controls the exported page, not just the S4 prompt.
  const planned=(input.modules?.length?input.modules:['hero','specs','scenarios','faq','lead-form']);
  const visible=[...new Set(['hero',...planned])].filter(x=>['hero','specs','scenarios','faq','lead-form'].includes(x));
  const has=(x:string)=>visible.includes(x);
  const featureTarget=has('specs')&&facts.length?'#details':has('scenarios')?'#scenarios':has('faq')?'#faq':'#hero';
  const design=visualKind(input.category,input.topic,facts.map(f=>f.value).join(' '));
  const ui=visualLabels(locale);
  const illustration=input.designPlan?adaptiveArtMarkup(input.designPlan,renderConceptIllustration(design,locale),String(safeName.copy.name??input.topic),locale):renderConceptIllustration(design,locale);
  const styleCss=designCss(design)+(input.designPlan?'\n'+adaptiveDesignCss(input.designPlan):'');
  const heroClass=input.designPlan?` hero-v95--${input.designPlan.hero}`:'';
  const scenesClass=input.designPlan?` scenarios-v95--${input.designPlan.scenarios}`:'';
  const factClass=input.designPlan?` facts-v95--${input.designPlan.facts}`:'';
  const faqClass=input.designPlan?` faq-v95--${input.designPlan.faq}`:'';
  const navClass=input.designPlan?` nav-v95--${input.designPlan.navigation}`:'';
  const featureLink=featureTarget;
  // Navigation links only to S3-selected modules; their ordering is preserved in main.
  const navItems=[
    ...(has('specs')&&facts.length?[{href:'#details',label:ui.navFeatures}]:[]),
    ...(has('scenarios')?[{href:'#scenarios',label:ui.navScenes}]:[]),
    ...(has('faq')?[{href:'#faq',label:ui.navFaq}]:[]),
  ];
  const navHtml=navItems.map(x=>`<a href="${x.href}">${esc(x.label)}</a>`).join('');
  const sections:Record<string,string>={
    'hero':`<section class="hero${heroClass}" id="hero"><div class="hero-copy"><div class="kicker">${esc(c.badge)}</div><h1>${esc(c.title)}</h1><p class="sub">${esc(c.subtitle)}</p><div class="actions"><a class="btn" href="${featureLink}">${esc(facts.length?t.button:ui.site)}${uiIcon('arrow')}</a>${has('faq')?`<a class="btn alt" href="#faq">${esc(t.faq)}</a>`:''}</div><div class="hero-proof">${uiIcon('shield')}<span>${esc(ui.proof)}</span></div></div>${illustration}</section>`,
    'specs':facts.length?`<section class="section${factClass}" id="details"><div class="section-wrap"><div class="section-head"><div class="section-intro"><div class="section-label">01 / ${esc(ui.benefits)}</div><h2>${esc(t.facts)}</h2><p class="section-lead">${esc(t.lead)}</p></div></div><dl class="specs">${factHtml}</dl><div class="spec-note">${uiIcon('shield')}<span>${esc(ui.noProof)}</span></div></div></section>`:'',
    'scenarios':`<section class="section${scenesClass}" id="scenarios"><div class="section-wrap"><div class="section-head"><div class="section-intro"><div class="section-label">${esc(ui.scenesLead)}</div><h2>${esc(t.scenes)}</h2></div></div><div class="uses">${sceneHtml}</div></div></section>`,
    'faq':`<section class="section${faqClass}" id="faq"><div class="section-wrap"><div class="section-head"><div class="section-intro"><div class="section-label">${esc(ui.faqLead)}</div><h2>${esc(t.faq)}</h2></div></div><div class="faq-grid">${faqHtml}</div></div></section>`,
    'lead-form':`<section class="section" id="contact"><div class="section-wrap"><div class="lead"><div><h2>${esc(isLighting?t.form:ui.contact)}</h2><p>${esc(isLighting?t.formLead:ui.contactSub)}</p></div><a class="btn" href="${featureLink}">${esc(facts.length?t.button:ui.site)}${uiIcon('arrow')}</a></div></div></section>`,
  };
  const bodySections=visible.map(x=>sections[x]||'').join('\n');
  const html=`<!DOCTYPE html>
<html lang="${locale}"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(c.seoTitle)} | ${esc(input.brandName)}</title><meta name="robots" content="noindex,nofollow"><meta name="description" content="${esc(c.seoDesc)}">
<script type="application/ld+json">${safeJson(productLd)}</script><script type="application/ld+json">${safeJson(faqLd)}</script>
<style>${styleCss}</style></head><body class="theme-${design}">
<a class="skip-link" href="#hero">${esc(ui.site)}</a>
<header class="site-header${navClass}"><div class="container header-inner"><a class="brand" href="#hero"><span class="brand-mark">${uiIcon('spark')}</span>${esc(input.brandName)}</a><nav class="nav" aria-label="${esc(ui.site)}">${navHtml}</nav><span class="lang">${locale.toUpperCase()}</span></div></header>
<main id="main">${bodySections}</main>
<footer class="footer"><div class="container footer-inner"><span class="footer-brand">${esc(input.brandName)}</span><span>${esc(ui.footer)}</span></div></footer></body></html>`;
  return {html,claims,editorial};
}
