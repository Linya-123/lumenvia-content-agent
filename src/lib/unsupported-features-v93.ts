import type { ProductFactV9 } from './product-profile-v9';

/**
 * Bounded, deterministic guard for common *capability expansion* in sparse
 * pet-feeder briefs. This is deliberately not a general fact verifier.
 * Only an explicitly supplied product fact can authorize the extra capability.
 */
const PET_FEEDING = /scheduled feeding|timed feeding|zeitgesteuerte f[uü]tterung|alimentaci[oó]n programada|定时喂食|futterautomat|pet feeder|宠物喂食/iu;

const RULES: ReadonlyArray<{label:string; claim:RegExp; evidence:RegExp}> = [
  {
    label:'远程追加喂食/投放额外份量',
    claim:/(?:\b(?:app|smartphone|handy)\b.{0,115}(?:zus[aä]tzliche\s+(?:portion|f[uü]tterung)|extra (?:portion|meal|feeding)|additional (?:portion|meal|feeding)|raci[oó]n adicional)|(?:zus[aä]tzliche\s+(?:portion|f[uü]tterung)|extra (?:portion|meal|feeding)|additional (?:portion|meal|feeding)|raci[oó]n adicional).{0,115}\b(?:app|smartphone|handy)\b|远程(?:加餐|投喂|出粮)|手机.{0,25}(?:加餐|额外投喂))/iu,
    evidence:/remote (?:extra )?(?:feeding|dispens|portion)|extra (?:portion|feeding) via app|additional (?:portion|feeding) (?:via|through) app|zus[aä]tzliche (?:portion|f[uü]tterung) (?:per|[uü]ber) app|远程(?:加餐|投喂|出粮)|手机.{0,25}(?:加餐|额外投喂)/iu,
  },
  {
    label:'多用户、多手机或家庭成员共同控制',
    claim:/mehrer(?:e|en)\s+(?:smartphones|nutzer|personen)|alle haushaltsmitglieder|gemeinsam.{0,35}(?:app|f[uü]tterung)|multiple (?:users|phones|smartphones|household members)|multi[- ]user|varios (?:usuarios|tel[eé]fonos)|多人(?:控制|管理)|多个手机/iu,
    evidence:/mehrer(?:e|en)\s+(?:smartphones|nutzer|personen)|multi[- ]user|multiple (?:users|phones|smartphones)|varios usuarios|多人(?:控制|管理)|多个手机/iu,
  },
  {
    label:'App 状态查看/远程监测',
    claim:/status\s+(?:per|[uü]ber|via|in der)\s+(?:die\s+)?app|(?:check|monitor|view) (?:the )?(?:feeding|device|food|meal)?\s*status (?:via|in|through) (?:the )?app|estado (?:en|por) (?:la )?app|(?:手机|App).{0,12}(?:监测状态|查看状态|设备状态)/iu,
    evidence:/status.{0,35}(?:app|smartphone)|(?:app|smartphone).{0,35}status|(?:view|check|monitor) (?:device )?status|状态(?:查看|监测)|监测状态/iu,
  },
  {
    label:'断电后的具体运行/停机行为',
    claim:/\bstromausfall\b|power outage|bei einem ausfall.{0,95}(?:mahlzeit|f[uü]tter)|stromausfall.{0,135}(?:mahlzeit|f[uü]tter|geplant|stromversorgung|akku|notstrom|ausgegeben)|(?:mahlzeit|f[uü]tter|geplant).{0,135}stromausfall|power (?:outage|failure).{0,135}(?:feeding|meal|schedule|backup|battery|dispens)|(?:feeding|schedule|meal).{0,135}power (?:outage|failure)|corte (?:de luz|el[eé]ctrico).{0,100}(?:alimentaci[oó]n|comida)|断电.{0,60}(?:喂食|运行|出粮|停机)/iu,
    evidence:/stromausfall|power (?:outage|failure)|corte (?:de luz|el[eé]ctrico)|断电|备用电源|backup (?:battery|power)/iu,
  },
  {
    label:'适用猫狗品类或体型的具体兼容性',
    claim:/katzen und kleine hunde|f[uü]r katzen (?:und|sowie) hunde|for cats and (?:small )?dogs|para gatos y perros|小型犬|犬猫通用/iu,
    evidence:/katzen und kleine hunde|f[uü]r katzen (?:und|sowie) hunde|for cats and (?:small )?dogs|para gatos y perros|小型犬|犬猫通用/iu,
  },
  {
    label:'设备端独立设置喂食时间的操作方式',
    claim:/in der app oder am ger[aä]t.{0,60}(?:fest|ein)|(?:app or (?:on )?the device).{0,60}(?:set|schedul)|en la app o en el dispositivo|设备或App设置/iu,
    evidence:/am ger[aä]t einstellen|on[- ]device schedul|schedule on the device|device button schedul|设备端设置|设备或App设置/iu,
  },
  {
    label:'将通用宠物产品限定为猫专用机型',
    claim:/katzenfutterautomat|cat[- ]only (?:feeder|dispenser)|only for cats|猫专用喂食/iu,
    evidence:/katzenfutterautomat|cat feeder|for cats|f[uü]r katzen|猫专用|猫咪专用|猫粮/iu,
  },
  {
    label:'提前安排多次喂食的数量能力',
    claim:/mehrere mahlzeiten im voraus|schedule multiple (?:meals|feedings)|plan multiple meals|programar varias comidas|预设多餐|多次定时出粮/iu,
    evidence:/mehrere mahlzeiten|multiple (?:scheduled )?(?:meals|feedings)|varias comidas|预设多餐|多次定时出粮/iu,
  },
  {
    label:'无人看护即可长期使用的承诺',
    claim:/ohne dass jemand zu hause sein muss|without anyone at home|sin nadie en casa|无人照看|无需有人在家/iu,
    evidence:/ohne dass jemand zu hause sein muss|without anyone at home|sin nadie en casa|无人照看|无需有人在家/iu,
  },
];

export function unsupportedPetFeederCapability(value:string, facts:ProductFactV9[]):string|null {
  const productContext=facts.some(f=>(f.field==='feature'||f.field==='scenario') && PET_FEEDING.test(f.value));
  if(!productContext)return null;
  // A claimed additional feature must be explicitly stated in an actual product fact.
  // 'scheduled feeding; App control' is insufficient for all rules below.
  const evidence=facts.filter(f=>['feature','scenario','included'].includes(f.field)).map(f=>f.value).join(' | ');
  for(const rule of RULES) {
    if(rule.claim.test(value) && !rule.evidence.test(evidence))return `${rule.label}未在本次用户产品事实中得到明确支持`;
  }
  return null;
}
