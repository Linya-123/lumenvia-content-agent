/**
 * V9.1 editorial refinement: meaningful, sparse-input landing-page copy.
 * These are conservative editorial suggestions, not additional product facts.
 * Only named features from this request may appear in the fallback headline.
 * Neither network access nor an LLM is used by this module.
 */
import type { ProductFactV9 } from './product-profile-v9';

type Lang = 'en'|'de'|'es';
type Scene = {h:string;p:string};
export type GroundedEditorialV91 = {
  badge:string;title:string;subtitle:string;seoTitle:string;seoDesc:string;scenes:Scene[];
};

function known(facts: ProductFactV9[]) {
  const source=facts.find(f=>f.field==='power_source')?.value??'';
  const context=facts.find(f=>f.field==='scenario')?.value??'';
  return {
    solar:/solar|太阳能|solarbetrieben|fotovoltaic/iu.test(source),
    motion:facts.some(f=>f.field==='motion_sensor'),
    garage:/garage|车库|garaje/iu.test(context),
    garden:/garden|yard|庭院|院子|garten|jard[ií]n|patio/iu.test(context),
  };
}

/** Grounded headline and optional, non-claim-bearing placement advice. */
export function groundedEditorial(locale: string, facts: ProductFactV9[]): GroundedEditorialV91 {
  const lang=(['de','es'].includes(locale)?locale:'en') as Lang;
  const {solar,motion,garage,garden}=known(facts);
  const en = (()=>{
    const product=solar&&motion?'solar motion lighting':solar?'solar lighting':motion?'motion-sensing lighting':'outdoor lighting';
    const place=garage?'your garage entrance':garden?'your garden and outdoor spaces':'your outdoor spaces';
    const title=product.charAt(0).toUpperCase()+product.slice(1)+' for '+place;
    const features=[solar?'Solar-powered':null,motion?'Motion sensing':null,garage?'Garage entrance':garden?'Garden / yard':null].filter(Boolean).join(' · ')||'Outdoor lighting';
    const subtitle=`From daily arrivals to evening paths, see how ${product} can fit into your outdoor lighting plan. Explore ideas for the spaces you use most.`;
    const scenes:Scene[] = [
      ...(garage?[{h:'Garage door approach',p:'Think about the approach between the driveway and garage door, where visibility matters when arriving home. Choose a position with the actual fixture instructions in hand.'}]:[]),
      ...(garden?[{h:'Garden paths and entrances',p:'Consider the routes people use after dusk and the points where a view of the path matters. Check the chosen product’s installation guidance.'}]:[]),
      ...(solar?[{h:'Positioning for daylight',p:'Compare proposed locations by how much daylight they receive across the seasons before choosing where to install the solar lighting.'}]:[]),
      ...(motion?[{h:'Planning for movement',p:'Consider the direction people approach an entrance and review the actual sensor placement and adjustment instructions before installing.'}]:[]),
      {h:'Everyday entrance lighting',p:'Start with doors, steps and the route between outdoor spaces. Compare placement options before selecting a fixture.'},
    ].slice(0,3);
    return {badge:features,title,subtitle,seoTitle:title,seoDesc:`Explore ${product} for ${garage?'garage entrances':garden?'garden paths':'outdoor entrances'}. Explore placement ideas for everyday entrances and outdoor spaces.`,scenes};
  })();
  if(lang==='en')return en;
  if(lang==='de'){
    const product=solar&&motion?'Solar-Bewegungslicht':solar?'Solarbeleuchtung':motion?'Beleuchtung mit Bewegungserkennung':'Außenbeleuchtung';
    const place=garage?'für die Garageneinfahrt':garden?'für Garten und Außenbereich':'für den Außenbereich';
    const title=`${product} ${place}`;
    const scenes:Scene[]=[
      ...(garage?[{h:'Zufahrt zur Garage',p:'Denken Sie an den Weg von der Einfahrt bis zum Garagentor. Wählen Sie den Montageort anhand der Anleitung des konkreten Produkts.'}]:[]),
      ...(garden?[{h:'Gartenwege und Zugänge',p:'Berücksichtigen Sie regelmäßig genutzte Wege und Eingänge. Richten Sie sich bei der Montage nach der Produktanleitung.'}]:[]),
      ...(solar?[{h:'Standort mit Tageslicht',p:'Vergleichen Sie mögliche Standorte danach, wie viel Tageslicht sie im Jahresverlauf erhalten.'}]:[]),
      ...(motion?[{h:'Bewegung am Eingang',p:'Betrachten Sie die Bewegungsrichtung am Zugang und prüfen Sie die konkreten Hinweise zur Sensorausrichtung.'}]:[]),
      {h:'Licht für Eingänge',p:'Planen Sie zuerst Türen, Stufen und Zugangswege, bevor Sie den Montageort auswählen.'},
    ].slice(0,3);
    return {badge:[solar?'Solar':null,motion?'Bewegungserkennung':null,garage?'Garageneinfahrt':null].filter(Boolean).join(' · ')||'Außenbeleuchtung',title,subtitle:'Entdecken Sie Beleuchtungsideen für Ihre alltäglichen Zugangswege. Die konkreten Montagehinweise des Produkts sind bei der Auswahl entscheidend.',seoTitle:title,seoDesc:`${product} für Eingangsbereiche: Entdecken Sie Ideen für Zugänge und tägliche Wege.`,scenes};
  }
  const product=solar&&motion?'Iluminación solar con sensor de movimiento':solar?'Iluminación solar':motion?'Iluminación con sensor de movimiento':'Iluminación exterior';
  const place=garage?'para la entrada del garaje':garden?'para el jardín y los espacios exteriores':'para espacios exteriores';
  const title=`${product} ${place}`;
  const scenes:Scene[]=[
    ...(garage?[{h:'Acceso al garaje',p:'Piense en el recorrido entre la entrada y la puerta del garaje. Elija la ubicación siguiendo las instrucciones del producto concreto.'}]:[]),
    ...(garden?[{h:'Senderos y accesos al jardín',p:'Considere las zonas de paso habituales y siga las indicaciones de montaje del producto.'}]:[]),
    ...(solar?[{h:'Ubicación y luz natural',p:'Compare posibles ubicaciones según la luz natural que reciben durante las distintas estaciones.'}]:[]),
    ...(motion?[{h:'Movimiento cerca de la entrada',p:'Observe por dónde se acercan las personas y revise la orientación recomendada para el sensor del producto.'}]:[]),
    {h:'Entradas de uso diario',p:'Comience por las puertas, escalones y recorridos de acceso antes de elegir la ubicación.'},
  ].slice(0,3);
  return {badge:[solar?'Solar':null,motion?'Sensor de movimiento':null,garage?'Entrada del garaje':null].filter(Boolean).join(' · ')||'Iluminación exterior',title,subtitle:'Descubra ideas de iluminación para los accesos que utiliza cada día. Revise las instrucciones del producto para elegir la ubicación.',seoTitle:title,seoDesc:`${product} para entradas exteriores: ideas para entradas y recorridos de uso diario.`,scenes};
}
