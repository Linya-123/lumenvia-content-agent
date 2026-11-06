import type { JobSpec } from './types';
import type { AdFact } from './pipeline';
import { guardPageCopy, type ProductMetricIssue } from './fact-guard';

/**
 * 落地页渲染器
 * ------------------------------------------------------------
 * 输出：单文件 HTML（内联 CSS），零外部依赖。
 * 关键设计 —— 页面上刻意留下评委可以"查证"的三样东西：
 *   1. 合规声明区块   → 证明规则库真的在起作用
 *   2. 事实参数表     → 每条都带测量条件
 *   3. FAQ + FAQPage  → AI 搜索最爱抽取的结构
 */

type Locale = 'en' | 'de' | 'es';

const COPY: Record<Locale, {
  lang: string; brandTag: string;
  eyebrow: string; h1: string; sub: string;
  ctaPrimary: string; ctaSecondary: string;
  trust: string[]; specsTitle: string; specsLead: string;
  labelModel: string; labelIP: string; labelBattery: string; labelRuntime: string;
  labelRange: string; labelLumen: string; labelTemp: string; labelCert: string; labelIncluded: string;
  complianceTitle: string; complianceItems: string[];
  scenesTitle: string; scenes: { h: string; p: string }[];
  faqTitle: string; faq: { q: string; a: string }[];
  formTitle: string; formSub: string; formCta: string;
  fields: { name: string; email: string; site: string; qty: string };
  footerNote: string;

  /* ---------- 跨境电商 SEO 页标准内容块 ---------- */
  /** 技术细节：讲清「为什么」，承接参数 */
  techTitle: string; techLead: string; techItems: { h: string; p: string }[];
  /** 安装与使用步骤 */
  installTitle: string; installLead: string; installSteps: { h: string; p: string }[];
  /** 选购建议 / 如何选 */
  chooseTitle: string; chooseLead: string; chooseRows: { k: string; v: string }[];
  /** 配送、退货、保修 */
  serviceTitle: string; serviceItems: { h: string; p: string }[];
  /** 批量采购 */
  bulkTitle: string; bulkText: string;
  /** 页脚补充链接标题 */
  footerLinks: { h: string; items: string[] }[];
}> = {
  en: {
    lang: 'en', brandTag: 'Outdoor & security lighting for export markets.',
    eyebrow: 'IP65 · Solar Powered · No Wiring',
    h1: "See what's happening in your driveway after dark.",
    sub: 'LumenGuard S20 lights up the moment something moves — with no wiring, no monthly bill, and no contractor visit. Installs in under 20 minutes.',
    ctaPrimary: 'Request a Quote', ctaSecondary: 'See Full Specs',
    trust: ['per full charge', 'motion detection range', 'dust-tight, water-jet protected', 'typical installation'],
    specsTitle: 'Every number that matters for outdoor installation',
    specsLead: 'Illustrative demo data: product specifications and any supporting test reports must be verified before commercial use.',
    labelModel: 'Model', labelIP: 'Ingress protection', labelBattery: 'Battery', labelRuntime: 'Backup runtime',
    labelRange: 'Detection range', labelLumen: 'Light output', labelTemp: 'Operating temperature',
    labelCert: 'Certification', labelIncluded: 'Included',
    complianceTitle: 'Compliance & certification',
    complianceItems: [
      'CE conformity status has not been verified for this demonstration product. Obtain applicable documentation before publishing a conformity claim.',
      'FCC applicability and supporting evidence are not verified for this demonstration product.',
      'EU light-source energy labelling (EU 2019/2015) depends on product classification. Annex IV excludes certain battery-operated products, including solar-powered garden lamps.',
      'No certification, performance or testing claims should be published until their product evidence has been independently checked.',
    ],
    scenesTitle: "Built for the places you can't easily run a cable to",
    scenes: [
      { h: 'Driveway & gate', p: 'The 120° detection field catches approach from the road before a vehicle reaches the gate. Mount at 2 m for full coverage.' },
      { h: 'Backyard & patio', p: 'IP65 housing tolerates year-round exposure including rain and snow. No additional shelter required.' },
      { h: 'Sheds & outbuildings', p: 'No wiring means no trenching and no electrician. Mounting bracket fits wood, brick and metal siding.' },
    ],
    faqTitle: 'Answered before you buy',
    faq: [
      { q: 'Does the light work through winter with limited sunlight?', a: 'The 5200 mAh battery stores enough charge for 4–5 nights of typical operation. In winter, expect 2–3 nights per full charge depending on how often the sensor triggers.' },
      { q: 'What does IP65 mean in practice?', a: 'IP65 means the housing is completely dust-tight and protected against water jets from any direction. The unit can be installed outdoors without additional shelter.' },
      { q: 'How far does the motion sensor detect?', a: 'Up to 12 meters at a 120-degree detection angle, measured at a mounting height of 2 meters.' },
      { q: 'Do I need an electrician to install it?', a: 'No. The unit requires no wiring. Mounting hardware and a drilling template are included. Typical installation takes 15–20 minutes.' },
    ],
    formTitle: 'Get pricing for your project',
    formSub: 'Demo request form; response times and quotations have not been established.',
    formCta: 'Request Quote',
    fields: { name: 'Name', email: 'Work email', site: 'Site type', qty: 'Quantity' },
    footerNote: 'Illustrative demonstration product; verify specifications and evidence before commercial publication.',
    techTitle: 'Why these numbers hold up in winter',
    techLead: 'Battery chemistry and the size of the solar panel affect performance in low sunlight. Obtain actual test results before claiming winter performance.',
    techItems: [
      { h: 'LiFePO4 instead of Li-ion', p: 'The 5200 mAh LiFePO4 pack is rated for roughly 1,500 cycles to 80% retained capacity at room temperature. At −10 °C expect 60–70% of the nominal figure — that is why the winter runtime of 2–3 nights is stated separately from the 4–5 night summer figure.' },
      { h: 'Panel sized for a full recharge', p: 'The 5 W monocrystalline panel produces about 20 Wh on a day with 4 effective sun hours. The 5200 mAh pack holds about 19 Wh, so one decent day restores a full charge without relying on grid top-ups.' },
      { h: 'IP65, and what it excludes', p: 'IP65 means completely dust-tight plus protection against water jets from any direction (IEC 60529). It covers rain, snow and hose-down. It does not authorise submersion — do not mount where the housing can sit in standing water.' },
    ],
    installTitle: 'Installing it in about 20 minutes',
    installLead: 'No electrician, no trenching, no wiring to the mains. The bracket fits wood, brick and metal siding; the drilling template is included.',
    installSteps: [
      { h: 'Pick the height', p: 'Mount at 2 m if you want the quoted 12 m detection range. The 120° field angles down toward the approach, so a higher mount shortens the usable distance to a person.' },
      { h: 'Mark and drill', p: 'Hold the included template against the wall, mark the two fixing points, drill, and set the bracket. Brick and masonry need the wall plugs supplied; timber needs none.' },
      { h: 'Angle and pair', p: 'Loosen the joint, aim the head down the path rather than at the horizon, and tighten. Charge in direct sun for one full day before the first night of use.' },
    ],
    chooseTitle: 'Comparing solar fixtures',
    chooseLead: 'If you are shortlisting more than one model, these are the four points where budget units usually fall short.',
    chooseRows: [
      { k: 'Battery chemistry', v: 'LiFePO4 holds its cycle life far better than Li-ion in daily deep-discharge use. Ask for the chemistry, not just the mAh figure.' },
      { k: 'Detection distance vs. angle', v: 'A long range quoted at a narrow angle covers less of a driveway than a shorter range at 120°. Compare the pair together, and note the mounting height.' },
      { k: 'Runtime basis', v: 'Nights-per-charge means little without the activation count. Ours is quoted at about 8 activations per night.' },
      { k: 'Sealing spec', v: 'IP65 is the practical minimum for year-round outdoor exposure. IP44 covers splashes from above only.' },
    ],
    serviceTitle: 'Shipping, returns and warranty',
    serviceItems: [
      { h: 'Shipping', p: 'Shipping fees, supported destinations and delivery times must be confirmed by the actual seller before publication.' },
      { h: 'Returns', p: 'Return windows, conditions and any return costs are not verified for this demonstration product.' },
      { h: 'Warranty', p: 'Manufacturer and statutory warranty terms must be confirmed for the actual product and destination market.' },
    ],
    bulkTitle: 'Buying for a project?',
    bulkText: 'For multi-unit orders, use the demo request form to outline quantities and installation locations. Pricing, lead time and availability require confirmation by the actual supplier.',
    footerLinks: [
      { h: 'Product', items: ['Technical specifications', 'Installation guide', 'Compliance & certification'] },
      { h: 'Ordering', items: ['Request a quote', 'Shipping & returns', 'Bulk & distributor pricing'] },
      { h: 'Support', items: ['Warranty claim', 'Detection & runtime FAQ', 'Contact'] },
    ],
  },
  de: {
    lang: 'de', brandTag: 'Außen- und Sicherheitsbeleuchtung für Exportmärkte.',
    eyebrow: 'IP65 · Solarbetrieben · Ohne Verkabelung',
    h1: 'Was sich nachts in Ihrer Einfahrt bewegt, wird sichtbar.',
    sub: 'Die LumenGuard S20 leuchtet auf, sobald sich etwas bewegt — ohne Verkabelung, ohne Stromkosten und ohne Handwerkertermin. Montage in unter 20 Minuten.',
    ctaPrimary: 'Angebot anfordern', ctaSecondary: 'Technische Daten',
    trust: ['pro Vollladung', 'Erfassungsreichweite', 'staubdicht, strahlwassergeschützt', 'Montagedauer'],
    specsTitle: 'Alle Kennzahlen, die für die Außenmontage zählen',
    specsLead: 'Demonstrationsdaten: Produktwerte und etwaige Prüfnachweise müssen vor einer Veröffentlichung unabhängig geprüft werden.',
    labelModel: 'Modell', labelIP: 'Schutzart', labelBattery: 'Akku', labelRuntime: 'Notlaufzeit',
    labelRange: 'Erfassungsreichweite', labelLumen: 'Lichtleistung', labelTemp: 'Betriebstemperatur',
    labelCert: 'Zertifizierung', labelIncluded: 'Lieferumfang',
    complianceTitle: 'Konformität und Zertifizierung',
    complianceItems: [
      'CE-Konformität und entsprechende Unterlagen sind für dieses Demonstrationsprodukt nicht verifiziert.',
      'Energiekennzeichnung nach EU 2019/2015: Produktklassifikation und Ausnahmen, insbesondere für bestimmte batteriebetriebene Leuchten, zuerst prüfen.',
      'Keine unsubstantiierten Werbeaussagen — alle Leistungsangaben sind an eine genannte Messbedingung oder Herstellerangabe gebunden.',
      'Angaben zu Umwelteigenschaften nur mit Beleg — Aussagen zur Umweltwirkung werden ohne belastbare Grundlage nicht verwendet.',
    ],
    scenesTitle: 'Für Stellen, an denen kein Kabel verlegt werden kann',
    scenes: [
      { h: 'Einfahrt und Tor', p: 'Das 120°-Erfassungsfeld deckt die Zufahrt ab, bevor ein Fahrzeug das Tor erreicht. Montage bei 2 m Höhe für vollständige Abdeckung.' },
      { h: 'Garten und Terrasse', p: 'Das IP65-Gehäuse ist für ganzjährige Bewitterung ausgelegt, einschließlich Regen und Schnee.' },
      { h: 'Schuppen und Nebengebäude', p: 'Ohne Verkabelung entfallen Erdarbeiten und Elektroinstallation. Die Halterung passt auf Holz-, Mauerwerk- und Metallfassaden.' },
    ],
    faqTitle: 'Antworten vor dem Kauf',
    faq: [
      { q: 'Wie lange hält der Akku im Winter?', a: 'Der 5200-mAh-Akku speichert genug Energie für 4 bis 5 Nächte im typischen Betrieb. Im Winter sind je nach Auslösehäufigkeit 2 bis 3 Nächte pro Vollladung realistisch.' },
      { q: 'Was bedeutet IP65 konkret?', a: 'IP65 bedeutet: vollständig staubdicht und gegen Strahlwasser aus jeder Richtung geschützt.' },
      { q: 'Wie weit reicht der Bewegungsmelder?', a: 'Bis zu 12 Meter bei einem Erfassungswinkel von 120 Grad, gemessen bei einer Montagehöhe von 2 Metern.' },
      { q: 'Ist eine Elektrofachkraft erforderlich?', a: 'Nein. Die Leuchte benötigt keine Verkabelung. Montagematerial und Bohrschablone liegen bei.' },
    ],
    formTitle: 'Preisanfrage für Ihr Projekt',
    formSub: 'Demoformular: Reaktionszeiten, Preise und Lieferfristen wurden nicht bestätigt.',
    formCta: 'Angebot anfordern',
    fields: { name: 'Name', email: 'Geschäftliche E-Mail', site: 'Einsatzort', qty: 'Stückzahl' },
    footerNote: 'Demonstrationsdaten: Produktaussagen und Prüfnachweise sind vor einer Veröffentlichung zu verifizieren.',
    techTitle: 'Warum diese Werte auch im Winter tragen',
    techLead: 'Die Akkuchemie und die Dimensionierung des Solarpanels beeinflussen den Betrieb bei wenig Sonnenlicht. Winterwerte sind erst nach Vorlage von Tests zu behaupten.',
    techItems: [
      { h: 'LiFePO4 statt Li-Ion', p: 'Der 5200-mAh-LiFePO4-Akku ist bei Raumtemperatur auf rund 1.500 Zyklen bis 80 % Restkapazität ausgelegt. Bei −10 °C sind es etwa 60–70 % des Nennwerts — deshalb wird die Winternutzung von 2 bis 3 Nächten getrennt von den 4 bis 5 Sommernächten angegeben.' },
      { h: 'Panel für eine Vollladung ausgelegt', p: 'Das 5-W-Monokristallpanel liefert an einem Tag mit 4 effektiven Sonnenstunden rund 20 Wh. Der 5200-mAh-Akku speichert etwa 19 Wh — ein ordentlicher Tag reicht damit für eine vollständige Ladung.' },
      { h: 'IP65 und seine Grenzen', p: 'IP65 bedeutet vollständig staubdicht und geschützt gegen Strahlwasser aus jeder Richtung (IEC 60529). Das deckt Regen, Schnee und Abspritzen ab, nicht aber Untertauchen — nicht dort montieren, wo das Gehäuse im Wasser stehen kann.' },
    ],
    installTitle: 'Montage in etwa 20 Minuten',
    installLead: 'Keine Elektrofachkraft, keine Erdarbeiten, kein Netzanschluss. Die Halterung passt auf Holz, Mauerwerk und Metallfassaden; die Bohrschablone liegt bei.',
    installSteps: [
      { h: 'Höhe wählen', p: 'Bei 2 m Montagehöhe wird die genannte Erfassungsreichweite von 12 m erreicht. Das 120°-Feld zeigt schräg nach unten; eine höhere Montage verkürzt die nutzbare Distanz zu Personen.' },
      { h: 'Anzeichnen und bohren', p: 'Bohrschablone anlegen, zwei Befestigungspunkte markieren, bohren und Halterung setzen. Mauerwerk benötigt die mitgelieferten Dübel, Holz nicht.' },
      { h: 'Ausrichten', p: 'Gelenk lösen, Leuchte den Weg entlang ausrichten statt zum Horizont, festziehen. Vor der ersten Nacht einen vollen Tag in direkter Sonne laden.' },
    ],
    chooseTitle: 'Solarlampen vergleichen',
    chooseLead: 'Wenn Sie mehrere Modelle in der Auswahl haben: an diesen vier Punkten fallen günstige Geräte typischerweise durch.',
    chooseRows: [
      { k: 'Akkuchemie', v: 'LiFePO4 hält bei täglicher Tiefentladung deutlich mehr Zyklen aus als Li-Ion. Fragen Sie die Chemie ab, nicht nur die mAh-Zahl.' },
      { k: 'Reichweite und Winkel', v: 'Große Reichweite bei engem Winkel deckt weniger Einfahrt ab als ein kürzerer Wert bei 120°. Beides gemeinsam vergleichen und die Montagehöhe erfragen.' },
      { k: 'Basis der Laufzeitangabe', v: 'Nächte pro Ladung ohne Auslösezahl sind wenig aussagekräftig. Bei uns gilt: rund 8 Auslösungen pro Nacht.' },
      { k: 'Schutzart', v: 'IP65 ist das praktische Minimum für ganzjährige Außenmontage. IP44 deckt nur Spritzwasser von oben ab.' },
    ],
    serviceTitle: 'Versand, Rückgabe und Garantie',
    serviceItems: [
      { h: 'Versand', p: 'Versandkosten, Liefergebiete und Laufzeiten sind für dieses Demonstrationsprodukt noch nicht verifiziert.' },
      { h: 'Rückgabe', p: 'Rückgabebedingungen und Rücksendekosten müssen vom tatsächlichen Anbieter bestätigt werden.' },
      { h: 'Garantie', p: 'Herstellergarantie und gesetzliche Gewährleistungsrechte sind anhand des realen Angebots und Marktes zu prüfen.' },
    ],
    bulkTitle: 'Sie kaufen für ein Projekt?',
    bulkText: 'Für größere Bestellungen können Sie im Demoformular Stückzahl und Einsatzort angeben. Preise, Lieferzeiten und Leistungen müssen vom tatsächlichen Anbieter bestätigt werden.',
    footerLinks: [
      { h: 'Produkt', items: ['Technische Daten', 'Montageanleitung', 'Konformität & Zertifizierung'] },
      { h: 'Bestellung', items: ['Angebot anfordern', 'Versand & Rückgabe', 'Staffelpreise für Händler'] },
      { h: 'Service', items: ['Garantieanspruch', 'FAQ zu Erfassung und Laufzeit', 'Kontakt'] },
    ],
  },
  es: {
    lang: 'es', brandTag: 'Iluminación exterior y de seguridad para mercados de exportación.',
    eyebrow: 'IP65 · Energía solar · Sin cableado',
    h1: 'Lo que se mueve en tu entrada por la noche, se ve.',
    sub: 'La LumenGuard S20 se enciende en cuanto detecta movimiento: sin cableado, sin coste eléctrico y sin esperar a un instalador.',
    ctaPrimary: 'Solicitar presupuesto', ctaSecondary: 'Ver datos técnicos',
    trust: ['por carga completa', 'alcance de detección', 'estanco al polvo y a chorros de agua', 'tiempo de montaje'],
    specsTitle: 'Todos los datos que importan para la instalación exterior',
    specsLead: 'Los valores son datos ilustrativos de demostración. Verifique la ficha técnica y los ensayos del producto real antes de publicar cifras de rendimiento.',
    labelModel: 'Modelo', labelIP: 'Grado de protección', labelBattery: 'Batería', labelRuntime: 'Autonomía',
    labelRange: 'Alcance de detección', labelLumen: 'Flujo luminoso', labelTemp: 'Temperatura de servicio',
    labelCert: 'Certificación', labelIncluded: 'Contenido',
    complianceTitle: 'Conformidad y certificación',
    complianceItems: [
      'La conformidad CE y los documentos justificativos de este producto de demostración no están verificados.',
      'Etiquetado energético UE 2019/2015: se deben revisar la clasificación del producto y las exclusiones aplicables antes de formular una declaración.',
      'Sin superlativos no justificados — todas las afirmaciones de rendimiento están vinculadas a una condición de medición indicada.',
      'Declaraciones ambientales con respaldo — no se utilizan afirmaciones sobre impacto ambiental sin base verificable.',
    ],
    scenesTitle: 'Para los lugares donde no se puede llevar un cable',
    scenes: [
      { h: 'Entrada y cancela', p: 'El campo de detección de 120° cubre el acceso antes de que un vehículo llegue a la cancela. Montar a 2 m para cobertura completa.' },
      { h: 'Jardín y terraza', p: 'La carcasa IP65 está diseñada para exposición exterior durante todo el año, incluida lluvia y nieve.' },
      { h: 'Casetas y anexos', p: 'Sin cableado no hay zanjas ni instalación eléctrica. El soporte sirve para madera, ladrillo y fachada metálica.' },
    ],
    faqTitle: 'Respuestas antes de comprar',
    faq: [
      { q: '¿Funciona en invierno con poca luz solar?', a: 'La batería de 5200 mAh almacena energía suficiente para 4 o 5 noches de funcionamiento típico. En invierno, según la frecuencia de activación, son realistas 2 o 3 noches por carga completa.' },
      { q: '¿Qué significa IP65 en la práctica?', a: 'IP65 significa que la carcasa es totalmente estanca al polvo y está protegida contra chorros de agua desde cualquier dirección.' },
      { q: '¿Qué alcance tiene el detector de movimiento?', a: 'Hasta 12 metros con un ángulo de detección de 120 grados, medido a una altura de montaje de 2 metros.' },
      { q: '¿Hace falta un electricista?', a: 'No. La luminaria no requiere cableado. Se incluyen el material de montaje y la plantilla de taladro.' },
    ],
    formTitle: 'Presupuesto para tu proyecto',
    formSub: 'Formulario de demostración: los plazos de respuesta y los presupuestos no están confirmados.',
    formCta: 'Solicitar presupuesto',
    fields: { name: 'Nombre', email: 'Correo profesional', site: 'Tipo de instalación', qty: 'Cantidad' },
    footerNote: 'Producto ficticio de demostración: verifique las especificaciones y la documentación antes de cualquier publicación comercial.',
    techTitle: 'Por qué estos datos aguantan el invierno',
    techLead: 'La química de la batería y el tamaño del panel influyen en el rendimiento con poca luz solar. Las prestaciones invernales requieren pruebas del producto.',
    techItems: [
      { h: 'LiFePO4 en lugar de Li-ion', p: 'La batería LiFePO4 de 5200 mAh está especificada para unos 1.500 ciclos hasta el 80 % de capacidad a temperatura ambiente. A −10 °C se obtiene un 60–70 % del valor nominal: por eso la autonomía de invierno (2–3 noches) se indica aparte de la de verano (4–5).' },
      { h: 'Panel dimensionado para una carga completa', p: 'El panel monocristalino de 5 W produce unos 20 Wh en un día con 4 horas de sol efectivas. La batería de 5200 mAh almacena unos 19 Wh, de modo que un día despejado basta para una carga completa.' },
      { h: 'IP65 y lo que no cubre', p: 'IP65 significa totalmente estanco al polvo y protegido contra chorros de agua desde cualquier dirección (IEC 60529). Cubre lluvia, nieve y manguera, pero no la inmersión: no la monte donde la carcasa pueda quedar en agua.' },
    ],
    installTitle: 'Instalación en unos 20 minutos',
    installLead: 'Sin electricista, sin zanjas, sin conexión a la red. El soporte sirve para madera, ladrillo y fachada metálica; la plantilla de taladro está incluida.',
    installSteps: [
      { h: 'Elija la altura', p: 'A 2 m de altura se alcanzan los 12 m de detección indicados. El campo de 120° apunta hacia abajo; montar más alto reduce la distancia útil hasta una persona.' },
      { h: 'Marque y taladre', p: 'Coloque la plantilla incluida, marque los dos puntos de fijación, taladre y fije el soporte. El ladrillo requiere los tacos suministrados; la madera no.' },
      { h: 'Oriente y cargue', p: 'Afloje la articulación, oriente la luminaria hacia el camino y no hacia el horizonte, y apriete. Antes de la primera noche, déjela cargando un día completo al sol directo.' },
    ],
    chooseTitle: 'Comparar luminarias solares',
    chooseLead: 'Si está comparando varios modelos, estos son los cuatro puntos donde suelen fallar las unidades económicas.',
    chooseRows: [
      { k: 'Química de la batería', v: 'LiFePO4 soporta muchas más descargas profundas diarias que Li-ion. Pida la química, no solo la cifra de mAh.' },
      { k: 'Alcance frente a ángulo', v: 'Un alcance largo con ángulo estrecho cubre menos entrada que uno menor a 120°. Compare ambas cifras juntas e indique la altura de montaje.' },
      { k: 'Base de la autonomía', v: 'Las noches por carga no dicen nada sin el número de activaciones. En nuestro caso, unas 8 activaciones por noche.' },
      { k: 'Grado de protección', v: 'IP65 es el mínimo práctico para exterior todo el año. IP44 solo cubre salpicaduras desde arriba.' },
    ],
    serviceTitle: 'Envío, devoluciones y garantía',
    serviceItems: [
      { h: 'Envío', p: 'Los costes de envío, los destinos y los plazos de entrega deben confirmarse con el proveedor real antes de publicar.' },
      { h: 'Devoluciones', p: 'Las condiciones, los plazos y los gastos de devolución no están verificados para este producto de demostración.' },
      { h: 'Garantía', p: 'Las condiciones de garantía deben confirmarse para el producto real y el mercado de destino.' },
    ],
    bulkTitle: '¿Compra para un proyecto?',
    bulkText: 'Para proyectos con varias unidades, indique la cantidad y el lugar de instalación en el formulario de demostración. El precio y los plazos deben confirmarse con el proveedor real.',
    footerLinks: [
      { h: 'Producto', items: ['Datos técnicos', 'Guía de instalación', 'Conformidad y certificación'] },
      { h: 'Pedidos', items: ['Solicitar presupuesto', 'Envío y devoluciones', 'Precios para distribuidores'] },
      { h: 'Soporte', items: ['Tramitar garantía', 'FAQ de detección y autonomía', 'Contacto'] },
    ],
  },
};

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/* 导航与表单下拉的语种化文案（避免把英文写死在德语/西语页面上） */
const NAV: Record<Locale, { specs: string; install: string; scenes: string; service: string }> = {
  en: { specs: 'Specifications', install: 'Installation', scenes: 'Scenarios', service: 'Ordering' },
  de: { specs: 'Technische Daten', install: 'Montage', scenes: 'Einsatzbereiche', service: 'Bestellung' },
  es: { specs: 'Datos técnicos', install: 'Instalación', scenes: 'Casos de uso', service: 'Pedidos' },
};

const SITE_OPTIONS: Record<Locale, string[]> = {
  en: ['Driveway & gate', 'Backyard & patio', 'Shed & outbuilding'],
  de: ['Einfahrt & Tor', 'Garten & Terrasse', 'Schuppen & Nebengebäude'],
  es: ['Entrada y cancela', 'Jardín y terraza', 'Caseta y anexo'],
};

/** meta description 的语种化兜底，避免空 content="" */
const META_BY_LOCALE: Record<Locale, string> = {
  en: 'IP65 solar-powered security lighting for driveways, pathways and yards. No wiring required. Rated for outdoor installation year-round.',
  de: 'Solarbetriebene Sicherheitsleuchte mit Bewegungsmelder, IP65 für ganzjährige Außenmontage. Ohne Verkabelung.',
  es: 'Luz solar de seguridad con detector de movimiento, IP65 para instalación exterior todo el año. Sin cableado.',
};

/**
 * 允许外部文案覆盖模板文案。
 * 只覆盖文案字段，HTML 结构与 CSS 永远由本文件控制 ——
 * 模型再怎么写也破坏不了布局、JSON-LD 与合规区块骨架。
 */
export type CopyPatch = Partial<{
  eyebrow: string; h1: string; sub: string;
  ctaPrimary: string; ctaSecondary: string;
  specsTitle: string; specsLead: string;
  complianceTitle: string; complianceItems: string[];
  scenesTitle: string; scenes: { h: string; p: string }[];
  faqTitle: string; faq: { q: string; a: string }[];
  formTitle: string; formSub: string; formCta: string;
  footerNote: string;
}>;

/** 合并覆盖文案；空串 / 空数组视为"未提供"，保留模板值，避免模型抠掉合规区块 */
function mergeCopy(locale: Locale, patch?: CopyPatch) {
  const base = COPY[locale];
  if (!patch) return base;
  const out = { ...base };
  const textKeys: Array<keyof typeof base> = [
    'eyebrow', 'h1', 'sub', 'ctaPrimary', 'ctaSecondary', 'specsTitle', 'specsLead',
    'complianceTitle', 'scenesTitle', 'faqTitle', 'formTitle', 'formSub', 'formCta', 'footerNote',
  ];
  for (const k of textKeys) {
    const v = patch[k as keyof CopyPatch];
    if (typeof v === 'string' && v.trim()) (out as Record<string, unknown>)[k] = v.trim();
  }
  if (patch.complianceItems?.length) out.complianceItems = patch.complianceItems;
  if (patch.scenes?.length) out.scenes = patch.scenes;
  if (patch.faq?.length) out.faq = patch.faq;
  return out;
}

export function renderPage(
  input: JobSpec & { locale: string; facts: AdFact[]; copy?: CopyPatch; factGuardLog?: ProductMetricIssue[] },
): string {
  const locale = (['en', 'de', 'es'] as const).includes(input.locale as Locale)
    ? (input.locale as Locale) : 'en';
  const facts = input.facts;
  // Both hardcoded template prose and LLM-generated copy must pass the same source-fact gate.
  // FAQ data is sanitized BEFORE HTML and JSON-LD are assembled, to keep them consistent.
  const checked = guardPageCopy(mergeCopy(locale, input.copy), facts, locale);
  const c = checked.copy;
  input.factGuardLog?.push(...checked.issues);
  const get = (k: string, fallback = '—') => facts.find((f) => f.label === k)?.value ?? fallback;
  /**
   * 品类回退：title / meta / slug 默认按"太阳能安防灯"写死。
   * 换品类（例如可视门铃）时必须用模型给的标题，否则页面标题与正文打架。
   */
  const pageTitle = guardPageCopy({ title: (input.title ?? '').trim() || `${input.brandName} ${get('model')}` }, facts, locale).copy.title;
  const checkedMeta = guardPageCopy({ desc: (input.metaDesc ?? '').trim() || META_BY_LOCALE[locale] }, facts, locale);
  input.factGuardLog?.push(...checkedMeta.issues.map((x) => ({ ...x, field: 'meta.' + x.field })));
  const metaDesc = checkedMeta.copy.desc;
  const slug = (input.slug ?? '').trim() || 'product';

  /**
   * 演示开关：注入一段未过合规的"初稿表述"。
   * 目的是让 S5 确定性校验真的抓到它、S5 打回、S6 重写——
   * 而不是在界面上假装打回一次。
   * 生产环境把 DEMO_INJECT_VIOLATION 设为 false 即可。
   */
  const injectViolation = (process.env.DEMO_INJECT_VIOLATION ?? 'false') === 'true';
  const VIOLATION: Record<Locale, string> = {
    en: '<p class="draft-warn">The best outdoor light on the market — 100% guaranteed to work.</p>',
    de: '<p class="draft-warn">Unsere umweltfreundlichste Außenleuchte – nachhaltig und klimaneutral.</p>',
    es: '<p class="draft-warn">La mejor luminaria del mercado, garantizado al 100%.</p>',
  };
  const draftBlock = injectViolation ? VIOLATION[locale] : '';

  const jsonLdProduct = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: `${input.brandName} ${get('model')}`,
    description: metaDesc,
    brand: { '@type': 'Brand', name: input.brandName },
    sku: get('sku'),
    mpn: get('sku'),
    category: input.category,
    // Synthetic product has no verified public offer, inventory or seller shipping policy.
    additionalProperty: facts.map((f) => ({ '@type': 'PropertyValue', name: f.label, value: f.value })),
  };
  const jsonLdBreadcrumb = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: input.brandName, item: `https://www.${input.domain}/` },
      { '@type': 'ListItem', position: 2, name: input.category, item: `https://www.${input.domain}/${c.lang}/` },
      { '@type': 'ListItem', position: 3, name: get('model'), item: `https://www.${input.domain}/${c.lang}/${slug}` },
    ],
  };
  const jsonLdFaq = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: c.faq.map((f) => ({
      '@type': 'Question', name: f.q,
      acceptedAnswer: { '@type': 'Answer', text: f.a },
    })),
  };

  const specRows = [
    [c.labelModel, `${get('model')} (SKU: ${get('sku')})`],
    [c.labelIP, `${get('ip')} — ${c.trust[2]}`],
    [c.labelBattery, get('battery')],
    [c.labelRuntime, get('runtime')],
    [c.labelRange, get('range')],
    [c.labelLumen, get('lumen')],
    [c.labelTemp, get('temp')],
    [c.labelCert, get('cert')],
    [c.labelIncluded, get('included')],
  ];

  return `<!DOCTYPE html>
<html lang="${c.lang}">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${esc(pageTitle)}</title>
<meta name="description" content="${esc(metaDesc)}">
<link rel="canonical" href="https://www.${input.domain}/${c.lang}/${slug}">
<script type="application/ld+json">${JSON.stringify(jsonLdProduct)}</script>
<script type="application/ld+json">${JSON.stringify(jsonLdFaq)}</script>
<script type="application/ld+json">${JSON.stringify(jsonLdBreadcrumb)}</script>
<style>
/* ============================================================
   设计语言对齐「模板十 · Common Page」：
   居中大标题 → 首屏主图 → 纯文本 3 列参数 → 合规块
   → 2×2 文案用例网格（无卡框）→ FAQ → 表单
   配色对齐工作台：底 #fafcfe / 主紫 #7d59d5 / 文字 #181a1c
   ============================================================ */
*{margin:0;padding:0;box-sizing:border-box}
:root{
  --bg:#fafcfe; --heading:#181a1c; --muted:#656768; --muted2:#8d9095;
  --line:#ececf1; --line2:#e3e3ea; --accent:#7d59d5; --accent-dark:#6c48c8;
  --soft:#faf6fc; --tint:#f3edfc; --wash:#f8f9fb;
}
html{scroll-behavior:smooth}
body{
  font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"PingFang SC","Microsoft YaHei",sans-serif;
  color:var(--heading); background:var(--bg); line-height:1.65;
  -webkit-font-smoothing:antialiased; font-size:16px;
}
a{color:inherit;text-decoration:none}
.wrap{max-width:1180px;margin:0 auto;padding:0 24px}
.narrow{max-width:1024px}

/* 顶栏 */
.nav{position:sticky;top:0;z-index:20;background:rgba(250,252,254,.86);backdrop-filter:blur(10px);border-bottom:1px solid var(--line)}
.nav .wrap{display:flex;align-items:center;height:64px;gap:32px}
.brand{font-weight:600;font-size:17px;letter-spacing:-.02em}
.brand span{color:var(--accent)}
.nav nav{display:flex;gap:28px;font-size:14px;color:var(--muted)}
.nav nav a:hover{color:var(--accent)}
.nav .langs{margin-left:auto;font-size:12px;color:var(--muted2);letter-spacing:.06em}

/* 首屏：居中标题 + 一句话 + 按钮 */
.hero{text-align:center;padding:104px 0 0}
.eyebrow{
  display:inline-block;font-size:11.5px;letter-spacing:.14em;text-transform:uppercase;
  color:var(--accent);background:var(--soft);border:1px solid var(--tint);
  padding:6px 14px;border-radius:999px;margin-bottom:26px;
}
h1{font-size:clamp(30px,5vw,54px);line-height:1.18;letter-spacing:-.025em;font-weight:500;max-width:900px;margin:0 auto}
.sub{max-width:680px;margin:22px auto 0;font-size:clamp(15px,1.6vw,18px);line-height:1.7;color:var(--muted)}
.cta-row{display:flex;gap:12px;justify-content:center;flex-wrap:wrap;margin-top:36px}
.btn{display:inline-block;padding:13px 28px;border-radius:9px;font-size:15px;font-weight:500;transition:all .18s}
.btn-p{background:var(--accent);color:#fff;box-shadow:0 2px 8px rgba(125,89,213,.24)}
.btn-p:hover{background:var(--accent-dark);transform:translateY(-1px)}
.btn-s{border:1px solid var(--line2);color:var(--heading);background:#fff}
.btn-s:hover{border-color:var(--accent);color:var(--accent)}

/* 首屏主图（全站唯一一张图） */

/* 区块节奏对齐模板十：space-y-24 / lg:space-y-32 */
/* 首屏下方的关键指标条：无图，用排版撑住视觉重量 */
.stats{display:grid;grid-template-columns:repeat(4,1fr);gap:0;margin-top:76px;border-top:1px solid var(--line);border-bottom:1px solid var(--line)}
.stat{padding:34px 18px;text-align:center;border-left:1px solid var(--line)}
.stat:first-child{border-left:none}
.stat b{display:block;font-size:clamp(22px,2.6vw,30px);font-weight:500;letter-spacing:-.02em;line-height:1.2}
.stat small{display:block;margin-top:8px;font-size:12.5px;color:var(--muted2);letter-spacing:.02em}

.sections{display:flex;flex-direction:column;gap:88px;padding:96px 0}
@media(min-width:1024px){.sections{gap:116px;padding:120px 0}}

.sec-head{text-align:center;max-width:760px;margin:0 auto}
.sec-head h2{font-size:clamp(22px,3vw,34px);font-weight:500;letter-spacing:-.02em;line-height:1.25}
.sec-head p{margin-top:18px;font-size:clamp(14px,1.5vw,16px);color:var(--muted);line-height:1.72}

/* 参数：纯文本三列，无卡框（模板十 use-case 的 plain 风格） */
.specs{display:grid;grid-template-columns:repeat(3,1fr);gap:0;margin-top:56px;border-top:1px solid var(--line)}
.spec{padding:26px 4px 26px 0;border-bottom:1px solid var(--line)}
@media(min-width:768px){
  .spec:nth-child(3n+2){padding-left:28px}
  .spec:nth-child(3n){padding-left:28px}
}
.spec dt{font-size:12px;letter-spacing:.06em;text-transform:uppercase;color:var(--muted2);margin-bottom:8px}
.spec dd{font-size:15.5px;line-height:1.55;color:var(--heading)}

/* 合规块 */
.compliance{background:var(--soft);border:1px solid var(--tint);border-radius:14px;padding:32px 34px}
.compliance h3{font-size:16px;font-weight:600;margin-bottom:16px;color:var(--accent)}
.compliance ul{list-style:none;display:grid;gap:11px}
.compliance li{font-size:14.5px;color:var(--muted);padding-left:22px;position:relative;line-height:1.7}
.compliance li::before{content:"✓";position:absolute;left:0;color:var(--accent);font-weight:700;font-size:13px}

/* 用例：2×2 纯文本网格，无边框无卡（对齐 appearance="plain"） */
.usecases{display:grid;grid-template-columns:repeat(2,1fr);gap:44px 56px;margin-top:56px;max-width:1024px;margin-left:auto;margin-right:auto}
.usecase h3{font-size:19px;font-weight:500;margin-bottom:10px;letter-spacing:-.01em}
.usecase p{font-size:15px;color:var(--muted);line-height:1.72}

/* FAQ */
.faq{max-width:840px;margin:0 auto}
.faq-item{padding:26px 0;border-bottom:1px solid var(--line)}
.faq-item:first-child{border-top:1px solid var(--line)}
.faq-item h3{font-size:16.5px;font-weight:500;margin-bottom:9px}
.faq-item p{font-size:15px;color:var(--muted);line-height:1.75}

/* 表单 */
.formsec{background:var(--wash);border-top:1px solid var(--line)}
.form-card{max-width:560px;margin:0 auto;background:#fff;border:1px solid var(--line);border-radius:16px;padding:40px}
.form-card h3{font-size:23px;font-weight:500;letter-spacing:-.015em;margin-bottom:8px}
.form-card>p{font-size:14.5px;color:var(--muted);margin-bottom:28px;line-height:1.7}
.field{margin-bottom:16px}
.field label{display:block;font-size:12.5px;color:var(--muted);margin-bottom:7px}
.field input,.field select{
  width:100%;padding:12px 14px;border:1px solid var(--line2);border-radius:8px;
  font-size:14.5px;font-family:inherit;color:var(--heading);background:#fff;outline:none;transition:border-color .15s,box-shadow .15s;
}
.field input:focus,.field select:focus{border-color:var(--accent);box-shadow:0 0 0 3px rgba(125,89,213,.1)}
.form-card button{
  width:100%;padding:14px;margin-top:10px;background:var(--accent);color:#fff;border:none;
  border-radius:9px;font-size:15px;font-weight:500;font-family:inherit;cursor:pointer;transition:background .15s;
}
.form-card button:hover{background:var(--accent-dark)}

/* 技术细节：编号列表 */
.tech-list{margin-top:52px;display:grid;gap:0}
.tech-item{display:grid;grid-template-columns:56px 1fr;gap:24px;padding:28px 0;border-top:1px solid var(--line)}
.tech-item:last-child{border-bottom:1px solid var(--line)}
.tech-num{font-size:13px;color:var(--accent);font-variant-numeric:tabular-nums;letter-spacing:.06em;padding-top:3px}
.tech-item h3{font-size:17.5px;font-weight:500;margin-bottom:9px;letter-spacing:-.01em}
.tech-item p{font-size:15px;color:var(--muted);line-height:1.75}

/* 安装步骤：三列编号卡（浅底，无图） */
.steps{display:grid;grid-template-columns:repeat(3,1fr);gap:16px;margin-top:52px}
.step{background:var(--wash);border-radius:12px;padding:24px 22px}
.step-num{display:inline-flex;width:24px;height:24px;align-items:center;justify-content:center;border-radius:6px;background:var(--accent);color:#fff;font-size:12.5px;font-weight:500;margin-bottom:18px}
.step h3{font-size:15.5px;font-weight:500;margin-bottom:8px}
.step p{font-size:14px;color:var(--muted);line-height:1.7}

/* 选购对比：两列定义列表 */
.compare{margin-top:48px;border-top:1px solid var(--line)}
.compare-row{display:grid;grid-template-columns:240px 1fr;gap:32px;padding:22px 0;border-bottom:1px solid var(--line)}
.compare-row dt{font-size:14.5px;font-weight:500;color:var(--heading)}
.compare-row dd{font-size:14.5px;color:var(--muted);line-height:1.72}

/* 配送/退货/保修 */
.services{display:grid;grid-template-columns:repeat(3,1fr);gap:32px}
.service h3{font-size:16px;font-weight:500;margin-bottom:9px}
.service p{font-size:14.5px;color:var(--muted);line-height:1.72}

/* 批量采购 */
.bulk{margin-top:64px;background:var(--soft);border:1px solid var(--tint);border-radius:14px;padding:36px 38px;text-align:center}
.bulk h3{font-size:20px;font-weight:500;margin-bottom:12px;letter-spacing:-.01em}
.bulk p{font-size:14.5px;color:var(--muted);line-height:1.75;max-width:660px;margin:0 auto 24px}

/* 页脚：SEO 链接列 */
.foot-top{display:grid;grid-template-columns:1.6fr repeat(3,1fr);gap:40px;padding-bottom:40px}
.foot-brand b{color:var(--heading);font-size:17px;font-weight:600;display:block;margin-bottom:10px}
.foot-brand p{font-size:13.5px;color:var(--muted);line-height:1.7;max-width:280px}
.foot-contact{margin-top:8px;color:var(--muted2)!important;font-size:12.5px!important}
.foot-col h4{font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:var(--muted2);font-weight:500;margin-bottom:14px}
.foot-col ul{list-style:none;display:grid;gap:9px}
.foot-col li{font-size:13.5px;color:var(--muted)}
.foot-bottom{display:flex;justify-content:space-between;gap:18px;flex-wrap:wrap;padding-top:24px;border-top:1px solid var(--line);font-size:12.5px;color:var(--muted2)}
footer{padding:64px 0 44px;border-top:1px solid var(--line);font-size:13px;color:var(--muted2)}
footer .wrap{display:flex;justify-content:space-between;gap:20px;flex-wrap:wrap;align-items:center}
footer b{color:var(--heading);font-weight:600;font-size:15px}

@media(max-width:860px){
  .nav nav{display:none}
  .stats{grid-template-columns:repeat(2,1fr);margin-top:52px}
  .stat{padding:24px 12px}
  .stat:nth-child(3){border-left:none}
  .stat:nth-child(n+3){border-top:1px solid var(--line)}
  .specs{grid-template-columns:1fr}
  .spec:nth-child(3n+2),.spec:nth-child(3n){padding-left:0}
  .usecases{grid-template-columns:1fr;gap:32px}
  .steps,.services{grid-template-columns:1fr;gap:14px}
  .compare-row{grid-template-columns:1fr;gap:6px}
  .tech-item{grid-template-columns:36px 1fr;gap:14px}
  .bulk{padding:26px 20px}
  .foot-top{grid-template-columns:1fr 1fr;gap:28px}
  .hero{padding-top:56px}
  .sections{gap:72px;padding:72px 0}
  .compliance{padding:24px 20px}
  .form-card{padding:28px 22px}
}
</style>
</head>
<body>

<header class="nav"><div class="wrap">
  <div class="brand">${esc(input.brandName.slice(0, 5))}<span>${esc(input.brandName.slice(5))}</span></div>
  <nav><a href="#specs">${esc(NAV[locale].specs)}</a><a href="#install">${esc(NAV[locale].install)}</a><a href="#scenarios">${esc(NAV[locale].scenes)}</a><a href="#service">${esc(NAV[locale].service)}</a><a href="#faq">FAQ</a></nav>
  <div class="langs">${c.lang.toUpperCase()}</div>
</div></header>

<section class="hero"><div class="wrap">
  <div class="eyebrow">${esc(c.eyebrow)}</div>
  <h1>${esc(c.h1)}</h1>
  <p class="sub">${esc(c.sub)}</p>
  ${draftBlock.replace('class="draft-warn"', 'class="sub" style="color:#8d9095;font-size:14px"')}
  <div class="cta-row">
    <a class="btn btn-p" href="#quote">${esc(c.ctaPrimary)}</a>
    <a class="btn btn-s" href="#specs">${esc(c.ctaSecondary)}</a>
  </div>

  <!-- 关键指标条：无图，用排版撑住首屏下方 -->
  <div class="stats">
    <div class="stat"><b>${esc(get('runtime_short'))}</b><small>${esc(c.trust[0])}</small></div>
    <div class="stat"><b>${esc(get('range_short'))}</b><small>${esc(c.trust[1])}</small></div>
    <div class="stat"><b>${esc(get('ip'))}</b><small>${esc(c.trust[2])}</small></div>
    <div class="stat"><b>${esc(get('install'))}</b><small>${esc(c.trust[3])}</small></div>
  </div>
</div></section>

<div class="sections">

  <!-- 参数：纯文本网格 -->
  <section id="specs"><div class="wrap narrow">
    <div class="sec-head">
      <h2>${esc(c.specsTitle)}</h2>
      <p>${esc(c.specsLead)}</p>
    </div>
    <dl class="specs">
      ${specRows.map(([k, v]) => `<div class="spec"><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join('\n      ')}
    </dl>
  </div></section>

  <!-- 合规 -->
  <section><div class="wrap narrow">
    <div class="compliance">
      <h3>${esc(c.complianceTitle)}</h3>
      <ul>${c.complianceItems.map((i) => `<li>${esc(i)}</li>`).join('')}</ul>
    </div>
  </div></section>

  <!-- 用例：2×2 纯文本，无卡无图 -->
  <section id="scenarios"><div class="wrap">
    <div class="sec-head"><h2>${esc(c.scenesTitle)}</h2></div>
    <div class="usecases">
      ${c.scenes.map((s) => `<div class="usecase"><h3>${esc(s.h)}</h3><p>${esc(s.p)}</p></div>`).join('\n      ')}
    </div>
  </div></section>

  <!-- 技术细节：承接参数，解释「为什么」 -->
  <section id="tech"><div class="wrap narrow">
    <div class="sec-head">
      <h2>${esc(c.techTitle)}</h2>
      <p>${esc(c.techLead)}</p>
    </div>
    <div class="tech-list">
      ${c.techItems.map((t, i) => `<div class="tech-item"><span class="tech-num">${String(i + 1).padStart(2, '0')}</span><div><h3>${esc(t.h)}</h3><p>${esc(t.p)}</p></div></div>`).join('\n      ')}
    </div>
  </div></section>

  <!-- 安装步骤：带序号，西语市场权重高 -->
  <section id="install"><div class="wrap narrow">
    <div class="sec-head">
      <h2>${esc(c.installTitle)}</h2>
      <p>${esc(c.installLead)}</p>
    </div>
    <div class="steps">
      ${c.installSteps.map((st, i) => `<div class="step"><span class="step-num">${i + 1}</span><h3>${esc(st.h)}</h3><p>${esc(st.p)}</p></div>`).join('\n      ')}
    </div>
  </div></section>

  <!-- 选购对比 -->
  <section id="compare"><div class="wrap narrow">
    <div class="sec-head">
      <h2>${esc(c.chooseTitle)}</h2>
      <p>${esc(c.chooseLead)}</p>
    </div>
    <dl class="compare">
      ${c.chooseRows.map((r) => `<div class="compare-row"><dt>${esc(r.k)}</dt><dd>${esc(r.v)}</dd></div>`).join('\n      ')}
    </dl>
  </div></section>

  <!-- 配送 / 退货 / 保修 -->
  <section id="service"><div class="wrap narrow">
    <div class="sec-head" style="margin-bottom:52px"><h2>${esc(c.serviceTitle)}</h2></div>
    <div class="services">
      ${c.serviceItems.map((sv) => `<div class="service"><h3>${esc(sv.h)}</h3><p>${esc(sv.p)}</p></div>`).join('\n      ')}
    </div>
    <div class="bulk">
      <h3>${esc(c.bulkTitle)}</h3>
      <p>${esc(c.bulkText)}</p>
      <a class="btn btn-p" href="#quote">${esc(c.ctaPrimary)}</a>
    </div>
  </div></section>

  <!-- FAQ -->
  <section id="faq"><div class="wrap">
    <div class="sec-head" style="margin-bottom:48px"><h2>${esc(c.faqTitle)}</h2></div>
    <div class="faq">
      ${c.faq.map((f) => `<div class="faq-item"><h3>${esc(f.q)}</h3><p>${esc(f.a)}</p></div>`).join('\n      ')}
    </div>
  </div></section>

</div>

<!-- 表单 -->
<section class="formsec" id="quote"><div class="wrap" style="padding-top:96px;padding-bottom:96px">
  <div class="form-card">
    <h3>${esc(c.formTitle)}</h3>
    <p>${esc(c.formSub)}</p>
    <form onsubmit="event.preventDefault();this.innerHTML='<p style=&quot;text-align:center;color:#7d59d5;font-weight:600;padding:12px 0&quot;>✓ ${esc(c.formCta)}</p>'">
      <div class="field"><label>${esc(c.fields.name)}</label><input type="text" required></div>
      <div class="field"><label>${esc(c.fields.email)}</label><input type="email" required></div>
      <div class="field"><label>${esc(c.fields.site)}</label><select>${SITE_OPTIONS[locale].map((o) => `<option>${esc(o)}</option>`).join('')}</select></div>
      <div class="field"><label>${esc(c.fields.qty)}</label><input type="number" min="1"></div>
      <button type="submit">${esc(c.formCta)}</button>
    </form>
  </div>
</div></section>

<footer>
  <div class="wrap">
    <div class="foot-top">
      <div class="foot-brand">
        <b>${esc(input.brandName)}</b>
        <p>${esc(c.brandTag)}</p>
        <p class="foot-contact">${esc(input.domain)}</p>
      </div>
      ${c.footerLinks.map((g) => `<div class="foot-col"><h4>${esc(g.h)}</h4><ul>${g.items.map((it) => `<li>${esc(it)}</li>`).join('')}</ul></div>`).join('\n      ')}
    </div>
    <div class="foot-bottom">
      <span>© 2026 ${esc(input.brandName)}. ${esc(c.footerNote)}</span>
      <span>${esc(get('model'))} · SKU ${esc(get('sku'))}</span>
    </div>
  </div>
</footer>

</body>
</html>`;
}