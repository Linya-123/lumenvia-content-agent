import type { ProductFactV9 } from './product-profile-v9';
import type { GroundedEditorialV91 } from './grounded-marketing-v91';
import { localizedProductName } from './task-intake-v92';
import { localizeFactValue } from './fact-localization-v92';
/** Fallback when no model is available: no lighting claims or industry-specific specs. */
export function genericEditorial(locale:string,topic:string,facts:ProductFactV9[]):GroundedEditorialV91 {
  const name=localizedProductName(topic,(locale==='de'||locale==='es'?locale:'en'));
  const en=locale==='en',de=locale==='de';
  // Avoid concatenating a nominative German product name after an accusative verb.
  const title=en?`Explore ${name}`:de
    ? name==='Intelligenter Futterautomat'
      ? 'Entdecken Sie den intelligenten Futterautomaten'
      : `Produkt im Überblick: ${name}`
    : name==='Comedero inteligente para mascotas'
      ? 'Descubra el comedero inteligente para mascotas'
      : `Producto en detalle: ${name}`;
  const features=facts.slice(0,3).map(f=>localizeFactValue(f,locale).value).join(' · ');
  const subtitle=en?'Explore features, everyday use ideas and things to consider before choosing.':de?'Entdecken Sie Eigenschaften, Einsatzideen und wichtige Auswahlkriterien.':'Conozca características, ideas de uso y aspectos a considerar.';
  // Grounded, product-specific fallback for the two explicitly named pet-feeder
  // functions. Never infer remote dispensing, shared accounts or status tracking.
  const coreFeature=facts.find(f=>f.field==='feature')?.value.toLowerCase()??'';
  const petFeeder=coreFeature.includes('scheduled feeding') && coreFeature.includes('app control');
  const petScenes = en ? [
    ['Feeding times that fit your routine','Plan feeding times around your pet’s daily routine. Scheduled feeding is one of the functions described for this product.'],
    ['App control in everyday use','App control is a listed function. Consult the specific model instructions for the actions it supports.'],
    ['Before getting started','Follow the model instructions and plan feeding times around your pet’s needs.'],
  ] : de ? [
    ['Fütterungszeiten im Alltag','Planen Sie Fütterungszeiten passend zum Tagesablauf Ihres Tieres. Die zeitgesteuerte Fütterung gehört zu den angegebenen Funktionen.'],
    ['App-Steuerung im Alltag','Die Steuerung per App ist als Produktfunktion angegeben. Welche einzelnen Aktionen möglich sind, steht in der Anleitung des Modells.'],
    ['Vor dem Einsatz','Beachten Sie die Anleitung des Modells und stimmen Sie die Fütterungszeiten auf die Bedürfnisse Ihres Tieres ab.'],
  ] : [
    ['Horarios para cada día','Organice los horarios de comida según la rutina de su mascota. La alimentación programada es una función indicada para este producto.'],
    ['Control mediante aplicación','El control mediante aplicación figura entre las funciones indicadas. Consulte las instrucciones del modelo para conocer las acciones disponibles.'],
    ['Antes de empezar','Siga las instrucciones del modelo y adapte los horarios de comida a las necesidades de su mascota.'],
  ];
  const sceneData=petFeeder?petScenes:en?[['Everyday use','Think about where and how this product could fit into your routine. Follow the actual product instructions.'],['Compare choices','Consider the product features you need and compare documented specifications.'],['Before choosing','Check which details matter most for the intended use and ask for accurate product information.']]
   :de?[['Im Alltag','Überlegen Sie, wie dieses Produkt zu Ihrer täglichen Nutzung passen könnte. Beachten Sie die Gebrauchsanleitung.'],['Optionen vergleichen','Vergleichen Sie die für Ihre Bedürfnisse relevanten und belegbaren Eigenschaften.'],['Vor der Auswahl','Prüfen Sie die für Ihren Einsatz wichtigen Details in den Produktinformationen.']]
   :[['Uso diario','Piense cómo podría encajar este producto en su rutina y siga sus instrucciones.'],['Comparar opciones','Compare las características documentadas que necesita.'],['Antes de elegir','Revise los detalles importantes para el uso previsto.']];
  return {badge:features||name,title,subtitle,seoTitle:title,seoDesc:subtitle,scenes:sceneData.map(([h,p])=>({h,p}))};
}
