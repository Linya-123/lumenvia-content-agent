/**
 * Localize the *presentation* of recognized, request-sourced product facts.
 * Keep ProductFactV9.value unchanged for provenance, fact checking and audits.
 * This bounded dictionary is NOT a general-purpose translation system.
 */
import type { ProductFactV9 } from './product-profile-v9';

type Lang = 'en' | 'de' | 'es';
type RenderedFact = { value: string; fullyLocalized: boolean };

const TERMS: Record<string, Record<Lang, string>> = {
  'scheduled feeding': {en:'scheduled feeding',de:'Zeitgesteuerte Fütterung',es:'Alimentación programada'},
  'app control': {en:'App control',de:'Steuerung per App',es:'Control mediante aplicación'},
  'solar powered': {en:'solar powered',de:'Solarbetrieb',es:'Energía solar'},
  'motion sensing': {en:'motion sensing',de:'Bewegungserkennung',es:'Detección de movimiento'},
  'no mains wiring required': {en:'no mains wiring required',de:'Kein Netzanschluss erforderlich',es:'No requiere conexión a la red eléctrica'},
  'garage entrance': {en:'garage entrance',de:'Garageneinfahrt',es:'Entrada del garaje'},
  'garden / yard': {en:'garden / yard',de:'Garten / Hof',es:'Jardín / patio'},
  'driveway': {en:'driveway',de:'Einfahrt',es:'Entrada para vehículos'},
};

/**
 * Only for known, developer-provided demo fact phrases. This is display text,
 * not proof that the technical claim has been independently verified.
 * Preserve the raw ProductFactV9.value for the source/audit trail.
 */
function localizeKnownDemoDetails(field:string, raw:string, lang:'de'|'es'):RenderedFact {
  const words = lang==='de' ? {
    fictional:'fiktives Demonstrationsprodukt',
    noReport:'ungeprüfte Demo-Angabe; kein Prüfbericht vorgelegt',
    unverified:'ungeprüfte Demo-Angabe',
    estimate:'ungeprüfte Demo-Schätzung',
    contents:'Demo-Lieferumfang',
    range:'bis zu $1 m bei $2°, gemessen bei $3 m Montagehöhe',
    runtime:'$1 Nächte bei ca. $2 Aktivierungen/Nacht',
    temp:'$1 bis $2 °C',
    install:'ca. $1 Min.',
    included:'Leuchte, Solarpanel, 3-m-Kabel, Halterung, Bohrschablone, Kurzanleitung',
  } : {
    fictional:'producto ficticio de demostración',
    noReport:'dato de demostración no verificado; sin informe de ensayo',
    unverified:'dato de demostración no verificado',
    estimate:'estimación de demostración no verificada',
    contents:'contenido de demostración',
    range:'hasta $1 m a $2°, medido a $3 m de altura de montaje',
    runtime:'$1 noches con aproximadamente $2 activaciones/noche',
    temp:'de $1 a $2 °C',
    install:'aprox. $1 min',
    included:'luminaria, panel solar, cable de 3 m, soporte, plantilla de perforación y guía de inicio rápido',
  };
  let value=raw;
  if(field==='model') value=value.replace(/\(fictional demonstration product\)/giu,`(${words.fictional})`);
  if(field==='range') value=value.replace(/up to ([\d.,]+) m at ([\d.,]+) degrees, measured at ([\d.,]+) m mounting height/giu,words.range);
  if(field==='runtime') value=value.replace(/(\d+[–-]\d+) nights at about (\d+) activations\/night/giu,words.runtime);
  if(field==='temp') value=value.replace(/(-?\d+) to (-?\d+)\s*°C/giu,words.temp);
  if(field==='install') value=value.replace(/approximately ([\d.,]+) min(?:utes)?/giu,words.install);
  if(field==='included') value=value.replace(/^fixture, solar panel, 3 m cable, bracket, drilling template, quick-start guide/iu,words.included);
  value=value
    .replace(/\(unverified demo specification; no test report supplied\)/giu,`(${words.noReport})`)
    .replace(/\(unverified demo specification\)/giu,`(${words.unverified})`)
    .replace(/\(unverified demo estimate\)/giu,`(${words.estimate})`)
    .replace(/\(demo contents\)/giu,`(${words.contents})`);
  // Avoid silently claiming an arbitrary custom specification was translated.
  const remnants=/(?:\bunverified demo\b|\bfictional demonstration\b|\bup to \d+ m at\b|\bnights at about\b|\bapproximately \d+ min\b|\bfixture, solar panel\b)/iu;
  return {value,fullyLocalized:!remnants.test(value)};
}

/** Only known canonical tokens get translated. Never invent translations for custom facts. */
export function localizeFactValue(fact: Pick<ProductFactV9, 'field'|'value'>, locale: string): RenderedFact {
  const lang = (locale==='de'||locale==='es' ? locale : 'en') as Lang;
  const value = fact.value;
  if(lang==='en') return {value,fullyLocalized:true};
  // Do not translate model numbers, SKUs or arbitrary free-text specifications.
  if(fact.field!=='feature' && fact.field!=='power_source' && fact.field!=='motion_sensor' && fact.field!=='no_mains' && fact.field!=='scenario') {
    return localizeKnownDemoDetails(fact.field,value,lang);
  }
  const separator = fact.field==='scenario' ? /\s*,\s*/u : /\s*;\s*/u;
  const joiner = fact.field==='scenario' ? ', ' : '; ';
  const tokens = value.split(separator).map(x=>x.trim()).filter(Boolean);
  let fullyLocalized = true;
  const translated = tokens.map(token=>{
    const known = TERMS[token.toLowerCase()];
    if(!known){fullyLocalized=false;return token;}
    return known[lang];
  });
  return {value:translated.join(joiner),fullyLocalized};
}
