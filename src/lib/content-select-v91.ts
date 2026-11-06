/**
 * V9.1 customer-facing content selection.
 * Missing/unverified product data belongs in the backstage report, not a consumer FAQ.
 * No API calls: deterministic selection plus explicitly grounded, localized fallbacks.
 */
import type { ProductFactV9 } from './product-profile-v9';

export type FAQItemV91 = { q: string; a: string };
export type EditorialDecisionV91 = {
  locale: string;
  section: 'faq'|'hero'|'scenes';
  action: 'excluded_from_public_page' | 'added_grounded_faq' | 'grounded_fallback_copy' | 'added_grounded_scene';
  question: string;
  reason: string;
};

type Lang = 'en' | 'de' | 'es';
const LANGS = new Set(['en','de','es']);
const asLang = (locale:string):Lang => LANGS.has(locale) ? locale as Lang : 'en';

const UNAVAILABLE = /\b(?:not (?:provided|listed|available|confirmed|verified|specified|included|known)|no (?:data|figure|specification|information) (?:was |is )?(?:provided|available)|unknown|unverified|ask (?:the |your )?(?:supplier|seller)|request (?:the |a )?(?:datasheet|figure|report|certification)|contact (?:the |your )?supplier|supplier must confirm|to be confirmed|nicht (?:angegeben|bekannt|best[aä]tigt|verifiziert|verf[uü]gbar)|keine angaben|beim (?:anbieter|hersteller) erfragen|nicht nachgewiesen|no (?:se ha|est[aá]) (?:indicado|confirmado|verificado)|sin datos|no disponible|consulte (?:al |con el )?proveedor|solicite (?:al |al )?proveedor)\b/iu;

// A question about a product-specific measurement is not useful if the actual
// measurement was not supplied. Better to select a different, answerable question.
const TOPIC: Array<{field:string; pattern:RegExp}> = [
  {field:'lumen', pattern:/\b(?:how bright|brightness|light output|lumens?|helligkeit|lichtstrom|lumen|brillo|luminosidad|flujo luminoso)\b/iu},
  {field:'runtime',pattern:/\b(?:how long.*(?:run|last|charge)|runtime|autonomy|nights? (?:per|on)|laufzeit|betriebsdauer|autonom[ií]a|cu[aá]nto dura|duraci[oó]n.*carga)\b/iu},
  {field:'battery',pattern:/\b(?:battery capacity|battery chemistry|battery size|batteriekapazit[aä]t|akkukapazit[aä]t|capacidad de (?:la )?bater[ií]a|tipo de bater[ií]a)\b/iu},
  {field:'range', pattern:/\b(?:detection range|detection distance|sensor range|erfassungsreichweite|reichweite|alcance (?:del|de) sensor|distancia de detecci[oó]n)\b/iu},
  {field:'ip',pattern:/\b(?:ip rating|waterproof|weatherproof|rain and cold|rated for rain|wasserdicht|schutzart|ip-schutz|impermeable|protecci[oó]n ip|resistente al agua)\b/iu},
  {field:'temp',pattern:/\b(?:operating temperature|how cold|winter temperature|betriebstemperatur|temperaturbereich|temperatura de funcionamiento|temperatura operativa)\b/iu},
  {field:'cert',pattern:/\b(?:certified|certification|fcc|rohs|ce mark|zertifizier|zertifikat|certificad|homologaci[oó]n)\b/iu},
  {field:'price',pattern:/\b(?:how much does (?:it|this) cost|price|pricing|preis|precio|cu[aá]nto cuesta)\b/iu},
  {field:'warranty',pattern:/\b(?:warranty|guarantee period|garantie|garant[ií]a)\b/iu},
  {field:'panel_power',pattern:/\b(?:panel wattage|panel power|solar module wattage|solarmodul-leistung|potencia del panel)\b/iu},
];

type LocalText = {q: string; a:string};
const SAFE:Record<Lang,Record<'scenario'|'solar'|'motion'|'planning'|'selection',LocalText>> = {
  en: {
    scenario:{q:'Where could this lighting fit?',a:'Think about the route from the driveway to the entrance and which areas you want to see clearly. Choose an installation position based on the product’s instructions.'},
    solar:{q:'What makes a good location for a solar light?',a:'Consider how much daylight the intended installation position receives through the year, and follow the actual product’s mounting instructions.'},
    motion:{q:'How might motion sensing fit into an entrance lighting plan?',a:'Motion sensing is a useful option to consider for places where people approach or pass by. Position and settings should follow the actual product instructions.'},
    planning:{q:'How should I plan lighting around an entrance?',a:'Start with the approach path, nearby doors and the areas where visibility matters. Compare suitable mounting positions before choosing a fixture.'},
    selection:{q:'What should I compare when choosing outdoor lighting?',a:'Compare the intended use, installation method and verified specifications for the models you are considering.'},
  },
  de: {
    scenario:{q:'Wo passt diese Beleuchtung hin?',a:'Denken Sie an den Weg zwischen Einfahrt und Eingang und an die Bereiche, die gut sichtbar sein sollen. Beachten Sie die Montageanleitung des konkreten Produkts.'},
    solar:{q:'Worauf kommt es beim Standort einer Solarleuchte an?',a:'Berücksichtigen Sie den Tageslichteinfall am geplanten Montageort im Jahresverlauf und beachten Sie die Montageanleitung des konkreten Produkts.'},
    motion:{q:'Wie lässt sich Bewegungserkennung bei Eingängen einsetzen?',a:'Bewegungserkennung kann für Bereiche sinnvoll sein, in denen sich Menschen nähern oder vorbeigehen. Die Einstellung richtet sich nach der Produktanleitung.'},
    planning:{q:'Wie plane ich Licht rund um den Eingang?',a:'Beginnen Sie mit den Zugangswegen, Türen und den Bereichen, in denen Sicht wichtig ist. Vergleichen Sie geeignete Montageorte.'},
    selection:{q:'Was sollte ich bei Außenbeleuchtung vergleichen?',a:'Vergleichen Sie Einsatzzweck, Montageart und belegbare technische Angaben der infrage kommenden Modelle.'},
  },
  es: {
    scenario:{q:'¿Dónde puede encajar esta iluminación?',a:'Piense en el recorrido desde la entrada hasta la puerta y en las zonas donde necesita visibilidad. Elija el lugar de instalación siguiendo las instrucciones del producto.'},
    solar:{q:'¿Qué conviene tener en cuenta al colocar una luz solar?',a:'Considere la luz natural que recibe el lugar de instalación durante el año y siga las instrucciones de montaje del producto concreto.'},
    motion:{q:'¿Cómo puede encajar la detección de movimiento en una entrada?',a:'La detección de movimiento puede ser útil en zonas de paso o acceso. La orientación y la configuración deben seguir las instrucciones del producto.'},
    planning:{q:'¿Cómo planificar la iluminación de una entrada?',a:'Empiece por el recorrido de acceso, las puertas y las zonas donde necesita visibilidad. Compare posibles lugares de instalación.'},
    selection:{q:'¿Qué debo comparar al elegir iluminación exterior?',a:'Compare el uso previsto, la instalación y las especificaciones verificables de los modelos disponibles.'},
  },
};

export function choosePublicFAQ(input: {
  locale:string;
  facts:ProductFactV9[];
  generated:FAQItemV91[];
  targetCount?:number;
  category?:string;
}): { faq:FAQItemV91[]; decisions:EditorialDecisionV91[] } {
  const locale = asLang(input.locale);
  const available = new Set(input.facts.map(f=>f.field));
  const decisions:EditorialDecisionV91[]=[];
  const faq:FAQItemV91[]=[];
  const used = new Set<string>();
  const target = Math.max(2,Math.min(input.targetCount??4,5));
  const add=(item:FAQItemV91, reason?:string)=>{
    const signature=item.q.toLocaleLowerCase(locale);
    if (used.has(signature) || faq.length >= target) return;
    faq.push(item);used.add(signature);
    if(reason) decisions.push({locale,section:'faq',action:'added_grounded_faq',question:item.q,reason});
  };
  for(const item of input.generated){
    const q=item.q.trim();const a=item.a.trim();
    if(!q||!a)continue;
    const missing=TOPIC.find(t=>t.pattern.test(q) && !available.has(t.field));
    const unavailable=UNAVAILABLE.test(a);
    if(missing||unavailable){
      decisions.push({locale,section:'faq',action:'excluded_from_public_page',question:q,
        reason:missing?`未提供 ${missing.field} 产品资料；该问题改在后台列为待补充`:'回答主要是在说明资料缺失，适合后台清单而不是消费者 FAQ'});
      continue;
    }
    add({q,a});
  }
  if(input.category && input.category!=='outdoor-lighting'){
    const general=locale==='de'?[
      {q:'Welche Merkmale sollte ich vergleichen?',a:'Vergleichen Sie die vom Anbieter dokumentierten Merkmale, die für Ihren Einsatz relevant sind.'},
      {q:'Worauf sollte ich vor der Auswahl achten?',a:'Prüfen Sie die Gebrauchsanleitung und die für Ihren Anwendungsfall wichtigen Angaben.'},
      {q:'Wie finde ich passende Produktinformationen?',a:'Achten Sie auf Modellbezeichnung und eindeutig zugeordnete Produktspezifikationen.'}]
      :locale==='es'?[
      {q:'¿Qué características conviene comparar?',a:'Compare las características documentadas del fabricante relevantes para el uso previsto.'},
      {q:'¿Qué debo revisar antes de elegir?',a:'Revise las instrucciones y la información del modelo concreto.'},
      {q:'¿Cómo encontrar información adecuada del producto?',a:'Busque el modelo exacto y sus especificaciones documentadas.'}]
      :[
      {q:'Which features should I compare?',a:'Compare documented features relevant to how you plan to use the product.'},
      {q:'What should I check before choosing?',a:'Review the instructions and product information for the exact model.'},
      {q:'How can I identify the right product details?',a:'Check the model name and its documented specifications before making a decision.'}];
    for(const item of general)add(item,'通用品类中仅补充可安全回答的选择问题，不套用灯具FAQ');
    return {faq,decisions};
  }
  const candidates:Array<[keyof typeof SAFE.en,boolean]>=[
    ['scenario',available.has('scenario')],['solar',available.has('power_source')],
    ['motion',available.has('motion_sensor')],['planning',true],['selection',true],
  ];
  for(const [key,ok] of candidates){if(ok) add(SAFE[locale][key],'基于已知产品类别/场景提供通用选购建议，不增补产品性能参数');}
  return {faq,decisions};
}
